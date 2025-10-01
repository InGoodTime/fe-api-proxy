// 文件：src/stage/extend/parser/apifox.ts
// 作用：识别Apifox项目导出并将其标准化为共享的ServiceDefinition格式

import type { ServiceDefinition } from '../../../types.js';
import type { DocSourceParser } from './parser.js';
import { SwaggerSource } from './swagger.js';

/**
 * 快速启发式方法判断载荷是否看起来像Apifox导出
 * @param raw 任意对象
 * @returns 如果看起来像Apifox导出返回true，否则返回false
 */
function isApifox(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  // Apifox可以直接导出OpenAPI；如果Swagger解析器能处理，则委托给它
  if (SwaggerSource.canParse(raw)) return true;
  const keys = Object.keys(raw);
  return keys.includes('apifoxProject') || keys.includes('apis') || keys.includes('apiList');
}

/**
 * Apifox项目解析器
 * 简易的解析器，从Apifox项目快照中提取端点
 */
export const ApifoxSource: DocSourceParser = {
  name: 'apifox',
  canParse: isApifox,
  parse(raw: any): ServiceDefinition {
    // 如果文档已经符合OpenAPI，则优先回落到Swagger解析器
    if (SwaggerSource.canParse(raw)) return SwaggerSource.parse(raw);

    const endpoints: ServiceDefinition['endpoints'] = [];
    const list = (raw.apis || raw.apiList || []) as any[];
    for (const it of list) {
      const method = String(it.method || 'GET').toUpperCase();
      const id = (it.operationId || it.name || `${method}_${it.path}` || 'op').replace(/[^a-zA-Z0-9_]+/g, '_');
      endpoints.push({
        id,
        name: it.name || id,
        description: it.description,
        path: it.path || '/',
        method: method as any,
        parameters: {
          path: (it.parameters || [])
            .filter((p: any) => p.in === 'path')
            .map((p: any) => ({ name: p.name, in: 'path', required: p.required, description: p.description, schema: { kind: 'string' } })),
          query: (it.parameters || [])
            .filter((p: any) => p.in === 'query')
            .map((p: any) => ({ name: p.name, in: 'query', required: p.required, description: p.description, schema: { kind: 'string' } })),
          header: (it.parameters || [])
            .filter((p: any) => p.in === 'header')
            .map((p: any) => ({ name: p.name, in: 'header', required: p.required, description: p.description, schema: { kind: 'string' } })),
        },
        body: it.requestBody
          ? { required: !!it.requestBody.required, contentType: it.requestBody.contentType, schema: { kind: 'unknown' } }
          : undefined,
        responses: Array.isArray(it.responses)
          ? it.responses.map((r: any) => ({ status: r.status, description: r.description, contentType: r.contentType, schema: { kind: 'unknown' } }))
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
  },
};