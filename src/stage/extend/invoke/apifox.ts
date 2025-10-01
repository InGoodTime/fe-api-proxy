import type { ServiceDefinition, HttpMethod } from '../../../types.js';
import type { InvokeSourceConfig } from './contracts.js';
import { BaseInvokeSource } from './base.js';
import { isSwaggerLikeDocument, parseSwaggerDocument } from './utils/parser/swagger.js';

function isApifoxDocument(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  if (isSwaggerLikeDocument(raw)) return true;
  const keys = Object.keys(raw);
  return keys.includes('apifoxProject') || keys.includes('apis') || keys.includes('apiList');
}

export class ApifoxInvokeSource extends BaseInvokeSource {
  readonly type = 'apifox';

  parse(payload: unknown, source: InvokeSourceConfig): ServiceDefinition {
    if (!isApifoxDocument(payload)) {
      const label = source.name ?? 'apifox';
      throw new Error('Payload for source "' + label + '" is not a valid Apifox export.');
    }

    if (isSwaggerLikeDocument(payload)) {
      return parseSwaggerDocument(payload);
    }

    const raw = payload as Record<string, any>;
    const endpoints: ServiceDefinition['endpoints'] = [];
    const list = (raw.apis || raw.apiList || []) as any[];

    for (const item of list) {
      const method = String(item.method || 'GET').toUpperCase() as HttpMethod;
      const sanitizedId = (item.operationId || item.name || `${method}_${item.path}` || 'op').replace(/[^a-zA-Z0-9_]+/g, '_');
      endpoints.push({
        id: sanitizedId,
        name: item.name || sanitizedId,
        description: item.description,
        path: item.path || '/',
        method,
        parameters: {
          path: (item.parameters || [])
            .filter((p: any) => p.in === 'path')
            .map((p: any) => ({
              name: p.name,
              in: 'path',
              required: p.required,
              description: p.description,
              schema: { kind: 'string' },
            })),
          query: (item.parameters || [])
            .filter((p: any) => p.in === 'query')
            .map((p: any) => ({
              name: p.name,
              in: 'query',
              required: p.required,
              description: p.description,
              schema: { kind: 'string' },
            })),
          header: (item.parameters || [])
            .filter((p: any) => p.in === 'header')
            .map((p: any) => ({
              name: p.name,
              in: 'header',
              required: p.required,
              description: p.description,
              schema: { kind: 'string' },
            })),
        },
        body: item.requestBody
          ? {
              required: !!item.requestBody.required,
              contentType: item.requestBody.contentType,
              schema: { kind: 'unknown' },
            }
          : undefined,
        responses: Array.isArray(item.responses)
          ? item.responses.map((r: any) => ({
              status: r.status,
              description: r.description,
              contentType: r.contentType,
              schema: { kind: 'unknown' },
            }))
          : undefined,
      });
    }

    return {
      title: raw.projectName || raw.name,
      version: raw.version,
      description: raw.description,
      endpoints,
      source: { kind: 'apifox', raw },
    };
  }
}