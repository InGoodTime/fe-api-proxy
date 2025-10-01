// 文件：src/stage/extend/parser/postman.ts
// 作用：将Postman集合导出转换为共享的ServiceDefinition格式

import type {
  ServiceDefinition,
  EndpointDefinition,
  ParameterDefinition,
  ResponseDefinition,
  RequestBodyDefinition,
  HttpMethod,
} from '../../../types.js';
import type { DocSourceParser } from './parser.js';
import { inferSchemaFromExample } from '../normalizer/convert.js';

/**
 * 检测载荷是否看起来像Postman集合
 * @param raw 任意对象
 * @returns 如果看起来像Postman集合返回true，否则返回false
 */
function isPostmanCollection(raw: any): boolean {
  return !!raw?.info?.schema && String(raw.info.schema).includes('postman');
}

/**
 * 将多种Postman URL形状标准化为单个路径字符串
 * @param rawUrl 原始URL对象
 * @returns 标准化后的路径字符串
 */
function toPath(rawUrl: any): string {
  if (!rawUrl) return '/';
  if (typeof rawUrl === 'string') {
    try {
      const u = new URL(rawUrl, 'http://dummy');
      return u.pathname + (u.search || '');
    } catch (_) {
      return rawUrl;
    }
  }
  if (typeof rawUrl === 'object') {
    const path = Array.isArray(rawUrl.path) ? '/' + rawUrl.path.join('/') : rawUrl.path || '/';
    return path;
  }
  return '/';
}

/**
 * Postman集合解析器
 * 简易的Postman集合解析器实现
 */
export const PostmanSource: DocSourceParser = {
  name: 'postman',
  canParse: isPostmanCollection,
  parse(raw: any): ServiceDefinition {
    if (!isPostmanCollection(raw)) throw new Error('Not a Postman collection');
    const endpoints: EndpointDefinition[] = [];

    /**
     * 递归遍历集合项
     * @param items 集合项数组
     * @param prefixTags 前缀标签
     */
    function walk(items: any[], prefixTags: string[] = []) {
      for (const it of items) {
        // 如果是文件夹，递归处理子项
        if (it.item) {
          const tags = [...prefixTags, it.name].filter(Boolean);
          walk(it.item, tags);
          continue;
        }
        // 如果没有请求，跳过
        if (!it.request) continue;

        const req = it.request;
        const method = String(req.method || 'GET').toUpperCase() as HttpMethod;
        const path = toPath(req.url);

        // 处理请求头参数
        const headers: ParameterDefinition[] = [];
        for (const h of req.header || []) {
          headers.push({
            name: h.key,
            in: 'header',
            required: false,
            description: h.description,
            schema: { kind: 'string' },
          });
        }

        // 处理查询参数
        const query: ParameterDefinition[] = [];
        for (const q of req.url?.query || []) {
          query.push({
            name: q.key,
            in: 'query',
            required: false,
            description: q.description,
            schema: { kind: 'string', example: q.value },
          });
        }

        // 处理路径参数
        const pathParams: ParameterDefinition[] = [];
        const pathStr = typeof req.url === 'string' ? req.url : req.url?.raw;
        const setPathParam = (token: string) => {
          const name = token.replace(/[:{}]/g, '');
          if (!pathParams.find(x => x.name === name)) {
            pathParams.push({ name, in: 'path', required: true, schema: { kind: 'string' } });
          }
        };
        if (typeof pathStr === 'string') {
          for (const m of pathStr.matchAll(/\{\{(.*?)\}\}/g)) setPathParam(m[0]);
          for (const m of pathStr.matchAll(/:(\w+)/g)) setPathParam(m[0]);
          for (const m of pathStr.matchAll(/\{(.*?)\}/g)) setPathParam(m[0]);
        }

        // 处理请求体
        let body: RequestBodyDefinition | undefined;
        const b = req.body;
        if (b) {
          if (b.mode === 'raw') {
            const rawText = b.raw ?? '';
            let schema;
            try {
              schema = inferSchemaFromExample(JSON.parse(rawText));
            } catch (_) {
              schema = { kind: 'string', example: rawText } as any;
            }
            body = {
              required: true,
              contentType: b.options?.raw?.language === 'json' ? 'application/json' : 'text/plain',
              schema,
            };
          } else if (b.mode === 'urlencoded') {
            body = { required: true, contentType: 'application/x-www-form-urlencoded', schema: { kind: 'object' } };
          } else if (b.mode === 'formdata') {
            body = { required: true, contentType: 'multipart/form-data', schema: { kind: 'object' } };
          }
        }

        // 处理响应
        const responses: ResponseDefinition[] = [];
        const res = it.response?.[0];
        if (res) {
          let schema;
          try {
            schema = inferSchemaFromExample(JSON.parse(res.body));
          } catch (_) {
            schema = { kind: 'string' } as any;
          }
          responses.push({
            status: Number(res.code) || 200,
            contentType: res.header?.find((h: any) => h.key.toLowerCase() === 'content-type')?.value,
            schema,
            description: res.name,
          });
        }

        // 生成操作ID
        const opId = (it.name || `${method}_${path}`).replace(/[^a-zA-Z0-9_]+/g, '_');
        endpoints.push({
          id: opId,
          name: it.name || opId,
          description: it?.request?.description,
          path,
          method,
          tags: prefixTags,
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
  },
};