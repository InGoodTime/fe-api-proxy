/**
 * 文档获取模块：支持单请求、多端点和发现式流程的接口文档抓取。
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ApiDocRequest,
  ApiDocSource,
  DiscoverySource,
  MultiEndpointSource,
  ResponseParseMode,
} from '../../../../../types.js';
import { mergeDocuments } from './merge.js';

/**
 * 统一拉取接口文档（支持单步、组合或发现流程），返回原始文档内容。
 */
export async function fetchApiDocumentation(source: ApiDocSource): Promise<unknown> {
  if (isDiscoverySource(source)) {
    const entry = await fetchSingleDocument(source.discovery);
    const followups = await source.resolveRequests(entry);
    const requests = ensureArray(followups);
    if (!requests.length) {
      throw new Error('Discovery source returned no follow-up requests.');
    }
    const documents = await Promise.all(requests.map(fetchSingleDocument));
    return mergeDocuments(documents, source.mergeStrategy);
  }

  if (isMultiEndpointSource(source)) {
    if (!source.requests.length) {
      throw new Error('Multi-endpoint source requires at least one request.');
    }
    const documents = await Promise.all(source.requests.map(fetchSingleDocument));
    return mergeDocuments(documents, source.mergeStrategy);
  }

  return fetchSingleDocument(source);
}

type DocSourceSingle = string | URL | ApiDocRequest;

function isApiDocRequest(value: unknown): value is ApiDocRequest {
  return !!value && typeof value === 'object' && 'url' in value;
}

function isMultiEndpointSource(value: unknown): value is MultiEndpointSource {
  return !!value && typeof value === 'object' && Array.isArray((value as MultiEndpointSource).requests);
}

function isDiscoverySource(value: unknown): value is DiscoverySource {
  return (
    !!value &&
    typeof value === 'object' &&
    'discovery' in (value as Record<string, unknown>) &&
    typeof (value as DiscoverySource).resolveRequests === 'function'
  );
}

/**
 * 将任意支持的来源规范化为单份原始文档。
 */
async function fetchSingleDocument(spec: DocSourceSingle): Promise<unknown> {
  if (spec instanceof URL) {
    return fetchHttp({ url: spec.toString(), parseAs: 'auto' });
  }

  if (typeof spec === 'string') {
    if (isHttpUrl(spec)) {
      return fetchHttp({ url: spec, parseAs: 'auto' });
    }
    if (spec.startsWith('file://')) {
      return parseJsonFile(fileURLToPath(spec));
    }
    return parseJsonFile(spec);
  }

  return fetchHttp(spec);
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/**
 * 执行一次 HTTP 请求并根据模式或响应类型解析结果。
 */
async function fetchHttp(request: ApiDocRequest): Promise<unknown> {
  const { url, method = 'GET', headers = {}, query, body, parseAs = 'auto' } = request;
  const targetUrl = appendQuery(url, query);
  const init: RequestInit = { method, headers: { ...headers } };

  if (body !== undefined && body !== null && method.toUpperCase() !== 'GET') {
    if (isPlainObject(body)) {
      const headerKey = Object.keys(init.headers as Record<string, string>).find(key => key.toLowerCase() === 'content-type');
      if (!headerKey) {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      }
      init.body = JSON.stringify(body);
    } else {
      init.body = body as BodyInit;
    }
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch API document from ${targetUrl}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Unexpected response ${response.status} ${response.statusText} from ${targetUrl}`);
  }

  return parseHttpResponse(response, parseAs);
}

function appendQuery(
  url: string,
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>
): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      params.append(key, String(item));
    }
  }
  const serialized = params.toString();
  if (!serialized) return url;
  try {
    const target = new URL(url);
    const search = new URLSearchParams(target.search);
    for (const [key, value] of params.entries()) {
      search.append(key, value);
    }
    target.search = search.toString();
    return target.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + serialized;
  }
}

async function parseHttpResponse(response: Response, mode: ResponseParseMode): Promise<unknown> {
  if (mode === 'json') {
    return response.json();
  }
  if (mode === 'text') {
    return response.text();
  }
  if (mode === 'buffer') {
    return response.arrayBuffer();
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return response.json();
  }
  if (contentType.startsWith('text/')) {
    return response.text();
  }
  return response.arrayBuffer();
}

async function parseJsonFile(pathOrRelative: string): Promise<unknown> {
  const absolute = isAbsolute(pathOrRelative) ? pathOrRelative : resolve(process.cwd(), pathOrRelative);
  const content = await readFile(absolute, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${absolute}: ${message}`);
  }
}

function ensureArray<T>(input: T | T[]): T[] {
  return Array.isArray(input) ? input : [input];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
