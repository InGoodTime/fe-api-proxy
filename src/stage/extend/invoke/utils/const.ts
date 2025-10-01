import type {
  HttpMethod
} from '../../../../types.js';

export const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

// 临时放在这里
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}