// 文件：src/old_design/sources/extend/swagger.ts
// 作用：将Swagger/OpenAPI文档解析为统一服务定义

import type {
  ServiceDefinition,
  EndpointDefinition,
  ParameterDefinition,
  RequestBodyDefinition,
  ResponseDefinition,
  HttpMethod,
  Schema,
} from '../../../types.js';
import type { DocSourceParser } from './parser.js';
import { jsonSchemaToSchema } from '../normalizer/convert.js';

/**
 * 判断是否为OpenAPI 3.x文档
 * @param doc 文档对象
 * @returns 如果是OpenAPI 3.x文档返回true，否则返回false
 */
function isOpenAPI3(doc: any): boolean {
  return !!doc && typeof doc === 'object' && typeof doc.openapi === 'string' && !!doc.paths;
}

/**
 * 判断是否为Swagger 2.0文档
 * @param doc 文档对象
 * @returns 如果是Swagger 2.0文档返回true，否则返回false
 */
function isSwagger2(doc: any): boolean {
  return !!doc && typeof doc === 'object' && doc.swagger === '2.0' && !!doc.paths;
}

/**
 * 判断是否为Swagger类文档
 * @param doc 文档对象
 * @returns 如果是Swagger类文档返回true，否则返回false
 */
function isSwaggerLike(doc: any): boolean {
  return isOpenAPI3(doc) || isSwagger2(doc);
}

/**
 * 从content对象中选择第一个内容类型和对应的schema
 * @param content 内容对象
 * @returns 包含内容类型和schema的对象
 */
function pickFirstContent(content: any): { contentType?: string; schema?: Schema } {
  if (!content || typeof content !== 'object') return {};
  const entries = Object.entries<any>(content);
  if (!entries.length) return {};
  const [ct, obj] = entries[0];
  return { contentType: ct, schema: jsonSchemaToSchema(obj.schema) };
}

/**
 * 解析OpenAPI 3.x文档
 * @param raw 原始文档对象
 * @returns 服务定义对象
 * @throws 当文档不是有效的OpenAPI 3.x格式时抛出错误
 */
export function parseOpenAPI(raw: any): ServiceDefinition {
  if (!isOpenAPI3(raw)) throw new Error('Not an OpenAPI 3.x document');

  const endpoints: EndpointDefinition[] = [];
  const servers: string[] = Array.isArray(raw.servers) ? raw.servers.map((s: any) => s.url).filter(Boolean) : [];

  const types: Record<string, Schema> = {};
  const schemas = raw.components?.schemas || {};
  for (const [name, schema] of Object.entries<any>(schemas)) {
    const conv = jsonSchemaToSchema(schema);
    if (conv) types[name] = conv;
  }

  for (const [p, pathItem] of Object.entries<any>(raw.paths || {})) {
    const commonParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']) {
      const op = pathItem[method];
      if (!op) continue;
      const httpMethod = method.toUpperCase() as HttpMethod;
      const opId = op.operationId || `${httpMethod}_${p.replace(/[^a-zA-Z0-9]+/g, '_')}`;

      const parameters: ParameterDefinition[] = [];
      const mergedParams = [...commonParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      for (const prm of mergedParams) {
        if (prm.$ref) continue;
        const pd: ParameterDefinition = {
          name: prm.name,
          in: prm.in === 'cookie' ? 'header' : prm.in,
          required: !!prm.required,
          description: prm.description,
          schema: jsonSchemaToSchema(prm.schema || prm),
          style: prm.style,
        };
        parameters.push(pd);
      }

      let body: RequestBodyDefinition | undefined = undefined;
      if (op.requestBody) {
        const rb = op.requestBody;
        const { contentType, schema } = pickFirstContent(rb.content);
        body = { required: !!rb.required, contentType, schema };
      }

      const responses: ResponseDefinition[] = [];
      for (const [code, r] of Object.entries<any>(op.responses || {})) {
        const status = code === 'default' ? 'default' : Number(code);
        const { contentType, schema } = pickFirstContent(r.content);
        responses.push({ status, description: r.description, contentType, schema });
      }

      // 按照2xx状态码优先排序
      responses.sort((a, b) => {
        const a2xx = typeof a.status === 'number' && a.status >= 200 && a.status < 300 ? 0 : 1;
        const b2xx = typeof b.status === 'number' && b.status >= 200 && b.status < 300 ? 0 : 1;
        if (a2xx !== b2xx) return a2xx - b2xx;
        return 0;
      });

      const ep: EndpointDefinition = {
        id: opId,
        name: op.summary || opId,
        description: op.description,
        path: p,
        method: httpMethod,
        tags: Array.isArray(op.tags) ? op.tags : undefined,
        parameters: {
          path: parameters.filter(p => p.in === 'path'),
          query: parameters.filter(p => p.in === 'query'),
          header: parameters.filter(p => p.in === 'header'),
        },
        body,
        responses,
      };
      endpoints.push(ep);
    }
  }

  return {
    title: raw.info?.title,
    version: raw.info?.version,
    description: raw.info?.description,
    servers,
    types: Object.keys(types).length ? types : undefined,
    endpoints,
    source: { kind: 'swagger', raw },
  } as ServiceDefinition;
}

/**
 * 解析Swagger 2.0文档
 * @param raw 原始文档对象
 * @returns 服务定义对象
 * @throws 当文档不是有效的Swagger 2.0格式时抛出错误
 */
export function parseSwagger2(raw: any): ServiceDefinition {
  if (!isSwagger2(raw)) throw new Error('Not a Swagger 2.0 document');

  const endpoints: EndpointDefinition[] = [];
  const servers: string[] = raw.host
    ? [String(raw.schemes?.[0] || 'https') + '://' + raw.host + (raw.basePath || '')]
    : [];

  const types: Record<string, Schema> = {};
  const schemas = raw.definitions || {};
  for (const [name, schema] of Object.entries<any>(schemas)) {
    const conv = jsonSchemaToSchema(schema);
    if (conv) types[name] = conv;
  }

  for (const [p, pathItem] of Object.entries<any>(raw.paths || {})) {
    const commonParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']) {
      const op = pathItem[method];
      if (!op) continue;
      const httpMethod = method.toUpperCase() as HttpMethod;
      const opId = op.operationId || `${httpMethod}_${p.replace(/[^a-zA-Z0-9]+/g, '_')}`;

      const parameters: ParameterDefinition[] = [];
      const mergedParams = [...commonParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      let body: RequestBodyDefinition | undefined = undefined;
      for (const prm of mergedParams) {
        if (prm.$ref) continue;
        if (prm.in === 'body') {
          body = {
            required: !!prm.required,
            contentType: 'application/json',
            schema: jsonSchemaToSchema(prm.schema),
          };
        } else {
          const pd: ParameterDefinition = {
            name: prm.name,
            in: prm.in,
            required: !!prm.required,
            description: prm.description,
            schema: jsonSchemaToSchema(prm.schema || prm),
          };
          parameters.push(pd);
        }
      }

      const responses: ResponseDefinition[] = [];
      for (const [code, r] of Object.entries<any>(op.responses || {})) {
        const status = code === 'default' ? 'default' : Number(code);
        const schema = jsonSchemaToSchema(r.schema);
        responses.push({ status, description: r.description, contentType: 'application/json', schema });
      }

      // 按照2xx状态码优先排序
      responses.sort((a, b) => {
        const a2xx = typeof a.status === 'number' && a.status >= 200 && a.status < 300 ? 0 : 1;
        const b2xx = typeof b.status === 'number' && b.status >= 200 && b.status < 300 ? 0 : 1;
        return a2xx - b2xx;
      });

      endpoints.push({
        id: opId,
        name: op.summary || opId,
        description: op.description,
        path: p,
        method: httpMethod,
        tags: Array.isArray(op.tags) ? op.tags : undefined,
        parameters: {
          path: parameters.filter(p => p.in === 'path'),
          query: parameters.filter(p => p.in === 'query'),
          header: parameters.filter(p => p.in === 'header'),
        },
        body,
        responses,
      });
    }
  }

  return {
    title: raw.info?.title,
    version: raw.info?.version,
    description: raw.info?.description,
    servers,
    types: Object.keys(types).length ? types : undefined,
    endpoints,
    source: { kind: 'swagger', raw },
  } as ServiceDefinition;
}

/**
 * Swagger文档解析器
 * 支持OpenAPI 3.x和Swagger 2.0格式
 */
export const SwaggerSource: DocSourceParser = {
  name: 'swagger',
  canParse: isSwaggerLike,
  parse(raw: any): ServiceDefinition {
    if (isOpenAPI3(raw)) return parseOpenAPI(raw);
    if (isSwagger2(raw)) return parseSwagger2(raw);
    throw new Error('Invalid Swagger or OpenAPI document');
  },
};