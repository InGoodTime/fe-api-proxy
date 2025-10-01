import type {
  ServiceDefinition,
  EndpointDefinition,
  ParameterDefinition,
  RequestBodyDefinition,
  ResponseDefinition,
  Schema,
} from '../../../../../types.js';
import { jsonSchemaToSchema } from '../../utils/schema.js';

import { isOpenApiDocument, parseOpenApiDocument } from './openapi.js';

import {HTTP_METHODS,isRecord} from '../const.js'

export function isSwagger2Document(doc: unknown): doc is Record<string, unknown> {
  if (!isRecord(doc)) return false;
  const swagger = (doc as Record<string, unknown>).swagger;
  const paths = (doc as Record<string, unknown>).paths;
  return swagger === '2.0' && !!paths;
}

export function isSwaggerLikeDocument(doc: unknown): doc is Record<string, unknown> {
  return isOpenApiDocument(doc) || isSwagger2Document(doc);
}


export function parseSwagger2Document(raw: any): ServiceDefinition {
  if (!isSwagger2Document(raw)) {
    throw new Error('Not a Swagger 2.0 document');
  }

  const doc = raw as Record<string, any>;
  const endpoints: EndpointDefinition[] = [];
  const servers: string[] = doc.host
    ? [String(doc.schemes?.[0] || 'https') + '://' + doc.host + (doc.basePath || '')]
    : [];

  const types: Record<string, Schema> = {};
  const definitions = doc.definitions || {};
  for (const [name, schema] of Object.entries<any>(definitions)) {
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

      const normalizedParams: ParameterDefinition[] = [];
      let body: RequestBodyDefinition | undefined;
      for (const prm of mergedParams) {
        if (!prm || typeof prm !== 'object' || prm.$ref) continue;
        if (prm.in === 'body') {
          body = {
            required: !!prm.required,
            contentType: 'application/json',
            schema: jsonSchemaToSchema(prm.schema),
          };
        } else {
          normalizedParams.push({
            name: prm.name,
            in: prm.in,
            required: !!prm.required,
            description: prm.description,
            schema: jsonSchemaToSchema(prm.schema || prm),
          });
        }
      }

      const responses: ResponseDefinition[] = [];
      for (const [statusCode, response] of Object.entries<any>(operation.responses || {})) {
        const status = statusCode === 'default' ? 'default' : Number(statusCode);
        const schema = jsonSchemaToSchema(response.schema);
        responses.push({
          status,
          description: response.description,
          contentType: 'application/json',
          schema,
        });
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

export function parseSwaggerDocument(raw: any): ServiceDefinition {
  if (isOpenApiDocument(raw)) return parseOpenApiDocument(raw);
  if (isSwagger2Document(raw)) return parseSwagger2Document(raw);
  throw new Error('Invalid Swagger or OpenAPI document');
}