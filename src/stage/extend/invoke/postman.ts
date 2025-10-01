import type {
  ServiceDefinition,
  EndpointDefinition,
  ParameterDefinition,
  ResponseDefinition,
  RequestBodyDefinition,
  HttpMethod,
} from '../../../types.js';
import type { InvokeSourceConfig } from './contracts.js';
import { BaseInvokeSource } from './base.js';
import { inferSchemaFromExample } from '../normalizer/convert.js';

function isPostmanCollection(raw: any): boolean {
  return !!raw?.info?.schema && String(raw.info.schema).includes('postman');
}

function toPath(rawUrl: any): string {
  if (!rawUrl) return '/';
  if (typeof rawUrl === 'string') {
    try {
      const url = new URL(rawUrl, 'http://dummy');
      return url.pathname + (url.search || '');
    } catch {
      return rawUrl;
    }
  }
  if (typeof rawUrl === 'object') {
    const path = Array.isArray(rawUrl.path) ? '/' + rawUrl.path.join('/') : rawUrl.path || '/';
    return path;
  }
  return '/';
}

export class PostmanInvokeSource extends BaseInvokeSource {
  readonly type = 'postman';

  parse(payload: unknown, source: InvokeSourceConfig): ServiceDefinition {
    if (!isPostmanCollection(payload)) {
      const label = source.name ?? 'postman';
      throw new Error('Payload for source "' + label + '" is not a Postman collection.');
    }

    const raw = payload as Record<string, any>;
    const endpoints: EndpointDefinition[] = [];

    function walk(items: any[], parentTags: string[] = []) {
      for (const item of items) {
        if (item?.item) {
          const tags = [...parentTags, item.name].filter(Boolean);
          walk(item.item, tags);
          continue;
        }
        if (!item?.request) continue;

        const request = item.request;
        const method = String(request.method || 'GET').toUpperCase() as HttpMethod;
        const path = toPath(request.url);

        const headers: ParameterDefinition[] = [];
        for (const header of request.header || []) {
          headers.push({
            name: header.key,
            in: 'header',
            required: false,
            description: header.description,
            schema: { kind: 'string' },
          });
        }

        const query: ParameterDefinition[] = [];
        for (const q of request.url?.query || []) {
          query.push({
            name: q.key,
            in: 'query',
            required: false,
            description: q.description,
            schema: { kind: 'string', example: q.value },
          });
        }

        const pathParams: ParameterDefinition[] = [];
        const rawPath = typeof request.url === 'string' ? request.url : request.url?.raw;
        const setPathParam = (token: string) => {
          const name = token.replace(/[:{}]/g, '');
          if (!pathParams.find(x => x.name === name)) {
            pathParams.push({ name, in: 'path', required: true, schema: { kind: 'string' } });
          }
        };
        if (typeof rawPath === 'string') {
          for (const match of rawPath.matchAll(/\{\{(.*?)\}\}/g)) setPathParam(match[0]);
          for (const match of rawPath.matchAll(/:(\w+)/g)) setPathParam(match[0]);
          for (const match of rawPath.matchAll(/\{(.*?)\}/g)) setPathParam(match[0]);
        }

        let body: RequestBodyDefinition | undefined;
        const requestBody = request.body;
        if (requestBody) {
          if (requestBody.mode === 'raw') {
            const rawText = requestBody.raw ?? '';
            let schema;
            try {
              schema = inferSchemaFromExample(JSON.parse(rawText));
            } catch {
              schema = { kind: 'string', example: rawText } as any;
            }
            body = {
              required: true,
              contentType: requestBody.options?.raw?.language === 'json' ? 'application/json' : 'text/plain',
              schema,
            };
          } else if (requestBody.mode === 'urlencoded') {
            body = { required: true, contentType: 'application/x-www-form-urlencoded', schema: { kind: 'object' } };
          } else if (requestBody.mode === 'formdata') {
            body = { required: true, contentType: 'multipart/form-data', schema: { kind: 'object' } };
          }
        }

        const responses: ResponseDefinition[] = [];
        const response = item.response?.[0];
        if (response) {
          let schema;
          try {
            schema = inferSchemaFromExample(JSON.parse(response.body));
          } catch {
            schema = { kind: 'string' } as any;
          }
          responses.push({
            status: Number(response.code) || 200,
            contentType: response.header?.find((h: any) => h.key.toLowerCase() === 'content-type')?.value,
            schema,
            description: response.name,
          });
        }

        const opId = (item.name || `${method}_${path}`).replace(/[^a-zA-Z0-9_]+/g, '_');
        endpoints.push({
          id: opId,
          name: item.name || opId,
          description: item?.request?.description,
          path,
          method,
          tags: parentTags,
          parameters: { path: pathParams, query, header: headers },
          body,
          responses,
        });
      }
    }

    walk(raw.item || []);

    return {
      title: raw.info?.name,
      version: raw.info?.version,
      description: raw.info?.description,
      endpoints,
      source: { kind: 'postman', raw },
    };
  }
}