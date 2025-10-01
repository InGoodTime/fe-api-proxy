import type {
  ServiceDefinition,
  EndpointDefinition,
  ParameterDefinition,
  RequestBodyDefinition,
  ResponseDefinition,
  Schema,
} from '../../../../../types.js';
import { jsonSchemaToSchema } from '../../utils/schema.js';

import {HTTP_METHODS,isRecord} from '../const.js'


// function isRecord(value: unknown): value is Record<string, unknown> {
//   return !!value && typeof value === 'object';
// }

export function isOpenApiDocument(doc: unknown): doc is Record<string, unknown> {
  if (!isRecord(doc)) return false;
  const openapi = (doc as Record<string, unknown>).openapi;
  const paths = (doc as Record<string, unknown>).paths;
  return typeof openapi === 'string' && !!paths;
}

export function parseOpenApiDocument(raw: any): ServiceDefinition {
  if (!isOpenApiDocument(raw)) {
    throw new Error('Not an OpenAPI 3.x document');
  }

  const doc = raw as Record<string, any>;
  const endpoints: EndpointDefinition[] = [];
  const servers: string[] = Array.isArray(doc.servers)
    ? doc.servers.map((server: any) => server?.url).filter(Boolean)
    : [];

  const types: Record<string, Schema> = {};
  const schemas = doc.components?.schemas || {};
  for (const [name, schema] of Object.entries<any>(schemas)) {
    const converted = jsonSchemaToSchema(schema);
    if (converted) types[name] = converted;
  }

  for (const [path, pathItem] of Object.entries<any>(doc.paths || {})) {
    const commonParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method.toLowerCase()];
      if (!operation) continue;
      const operationId = operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]+/g, '_')}`;

      const mergedParams = [
        ...commonParams,
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
      ];
      const normalizedParams = normalizeParameters(mergedParams);

      let body: RequestBodyDefinition | undefined;
      if (operation.requestBody) {
        const { contentType, schema } = pickFirstContent(operation.requestBody.content);
        body = { required: !!operation.requestBody.required, contentType, schema };
      }

      const responses: ResponseDefinition[] = [];
      for (const [statusCode, response] of Object.entries<any>(operation.responses || {})) {
        const status = statusCode === 'default' ? 'default' : Number(statusCode);
        const { contentType, schema } = pickFirstContent(response.content);
        responses.push({ status, description: response.description, contentType, schema });
      }
      responses.sort((a, b) => {
        const isA2xx = typeof a.status === 'number' && a.status >= 200 && a.status < 300;
        const isB2xx = typeof b.status === 'number' && b.status >= 200 && b.status < 300;
        if (isA2xx === isB2xx) return 0;
        return isA2xx ? -1 : 1;
      });

      endpoints.push({
        id: operationId,
        name: operation.summary || operationId,
        description: operation.description,
        path,
        method,
        tags: Array.isArray(operation.tags) ? operation.tags : undefined,
        parameters: {
          path: normalizedParams.filter(param => param.in === 'path'),
          query: normalizedParams.filter(param => param.in === 'query'),
          header: normalizedParams.filter(param => param.in === 'header'),
        },
        body,
        responses,
      });
    }
  }

  return {
    title: doc.info?.title,
    version: doc.info?.version,
    description: doc.info?.description,
    servers,
    types: Object.keys(types).length ? types : undefined,
    endpoints,
    source: { kind: 'swagger', raw: doc },
  };
}

function normalizeParameters(parameters: any[]): ParameterDefinition[] {
  const normalized: ParameterDefinition[] = [];
  for (const prm of parameters) {
    if (!prm || typeof prm !== 'object' || prm.$ref) continue;
    normalized.push({
      name: prm.name,
      in: prm.in === 'cookie' ? 'header' : prm.in,
      required: !!prm.required,
      description: prm.description,
      schema: jsonSchemaToSchema(prm.schema || prm),
      style: prm.style,
    });
  }
  return normalized;
}

function pickFirstContent(content: any): { contentType?: string; schema?: Schema } {
  if (!content || typeof content !== 'object') return {};
  const [contentType, body] = Object.entries<any>(content)[0] ?? [];
  if (!contentType) return {};
  return { contentType, schema: jsonSchemaToSchema(body?.schema) };
}
