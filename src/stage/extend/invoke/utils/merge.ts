/**
 * 文档合并模块：提供将多份接口文档合并为单一载荷的工具函数。
 */
import type { MergeStrategy } from '../../../../../types.js';

/**
 * 根据指定策略合并多份文档，默认对 OpenAPI 文档进行深度合并。
 */
export function mergeDocuments(documents: unknown[], strategy?: MergeStrategy): unknown {
  if (!documents.length) {
    throw new Error('No documents fetched to merge.');
  }
  if (typeof strategy === 'function') {
    return strategy(documents);
  }
  const appliedStrategy = strategy && strategy !== 'auto' ? strategy : detectMergeStrategy(documents);
  switch (appliedStrategy) {
    case 'first':
      return documents[0];
    case 'json-array':
      return documents;
    case 'swagger':
    case 'openapi': {
      const swaggerDocs = documents.filter(isSwaggerLike) as Array<Record<string, any>>;
      if (!swaggerDocs.length || swaggerDocs.length !== documents.length) {
        throw new Error('Merge strategy swagger requested but not all documents appear to be OpenAPI/Swagger.');
      }
      return mergeSwaggerDocuments(swaggerDocs);
    }
    default: {
      const swaggerDocs = documents.filter(isSwaggerLike) as Array<Record<string, any>>;
      if (swaggerDocs.length === documents.length && swaggerDocs.length > 0) {
        return mergeSwaggerDocuments(swaggerDocs);
      }
      if (documents.length === 1) {
        return documents[0];
      }
      return documents;
    }
  }
}

/**
 * 根据输入文档推断合并策略。
 */
export function detectMergeStrategy(documents: unknown[]): MergeStrategy {
  if (documents.length === 1) {
    return 'first';
  }
  if (documents.every(isSwaggerLike)) {
    return 'swagger';
  }
  return 'json-array';
}

function isSwaggerLike(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && 'paths' in value;
}

/**
 * 合并多份 OpenAPI/Swagger 文档，整合路径、组件、标签和服务器信息。
 */
function mergeSwaggerDocuments(documents: Array<Record<string, any>>): Record<string, any> {
  const [first, ...rest] = documents;
  const merged: Record<string, any> = {
    ...first,
    paths: { ...(first.paths ?? {}) },
    components: { ...(first.components ?? {}) },
  };

  const tagMap = new Map<string, any>();
  collectTags(tagMap, first.tags);

  const serverMap = new Map<string, any>();
  collectServers(serverMap, first.servers);

  for (const doc of rest) {
    for (const [pathKey, pathValue] of Object.entries(doc.paths ?? {})) {
      const current = merged.paths[pathKey];
      merged.paths[pathKey] = {
        ...(current ?? {}),
        ...(pathValue as Record<string, any>),
      };
    }

    mergeComponentSection(merged.components, doc.components);
    collectTags(tagMap, doc.tags);
    collectServers(serverMap, doc.servers);
  }

  if (tagMap.size) {
    merged.tags = Array.from(tagMap.values());
  }

  if (serverMap.size) {
    merged.servers = Array.from(serverMap.values());
  }

  return merged;
}

function mergeComponentSection(target: Record<string, any>, source: Record<string, any> | undefined): void {
  if (!source) return;
  for (const [sectionKey, sectionValue] of Object.entries(source)) {
    const current = target[sectionKey];
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      target[sectionKey] = {
        ...current,
        ...(sectionValue as Record<string, any>),
      };
    } else {
      target[sectionKey] = sectionValue;
    }
  }
}

function collectTags(target: Map<string, any>, source: any): void {
  if (!Array.isArray(source)) return;
  for (const tag of source) {
    if (!tag || typeof tag !== 'object') continue;
    const name = 'name' in tag ? (tag as any).name : undefined;
    if (typeof name !== 'string') continue;
    const existing = target.get(name);
    target.set(name, existing ? { ...existing, ...tag } : tag);
  }
}

function collectServers(target: Map<string, any>, source: any): void {
  if (!Array.isArray(source)) return;
  for (const server of source) {
    if (!server || typeof server !== 'object') continue;
    const url = 'url' in server ? (server as any).url : undefined;
    if (typeof url !== 'string') continue;
    const existing = target.get(url);
    target.set(url, existing ? { ...existing, ...server } : server);
  }
}
