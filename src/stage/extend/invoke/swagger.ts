import type { ServiceDefinition } from '../../../types.js';
import type { InvokeSourceConfig } from './contracts.js';
import { BaseInvokeSource } from './base.js';
import { isSwaggerLikeDocument, parseSwaggerDocument } from './utils/parser/swagger.js';

type SwaggerInvokeOptions = Record<string, unknown> & {
  url?: string;
  headers?: Record<string, string>;
};

export class SwaggerInvokeSource extends BaseInvokeSource<SwaggerInvokeOptions> {
  readonly type = 'swagger';

  async fetch(source: InvokeSourceConfig<SwaggerInvokeOptions>): Promise<unknown> {
    // 已经有文档，直接返回
    if (source.document !== undefined) {
      return source.document;
    }

    // 获取swagger请求url, 根据不同的request类型，调用不同的方法处理
    const targetUrl = this.resolveUrl(source);
    if (!targetUrl) {
      return super.fetch(source);
    }

    // 获取请求地址，这里的类型都是纯url类型的，对象类型的在super.fetch中处理了
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: source.options?.headers as Record<string, string> | undefined,
    });

    if (!response.ok) {
      throw new Error(
        '[SwaggerInvokeSource] Failed to fetch Swagger document from ' +
          targetUrl +
          ': ' +
          response.status +
          ' ' +
          response.statusText
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json') || contentType.includes('+json')) {
      return response.json();
    }

    // 获取swagger的文档信息并返回
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('[SwaggerInvokeSource] Response from ' + targetUrl + ' is not valid JSON.');
    }
  }

  parse(payload: unknown, source: InvokeSourceConfig<SwaggerInvokeOptions>): ServiceDefinition {
    if (!isSwaggerLikeDocument(payload)) {
      const label = source.name ?? 'swagger';
      throw new Error('Payload for source "' + label + '" is not a Swagger/OpenAPI document.');
    }

    // parse之后的结果是ServiceDefinition
    return parseSwaggerDocument(payload);
  }

  // request如果是string / URL类型，直接返回url
  // option中带了url参数的，直接返回
  private resolveUrl(source: InvokeSourceConfig<SwaggerInvokeOptions>): string | undefined {
    const { request, options } = source;
    if (typeof request === 'string') {
      return request;
    }
    if (request instanceof URL) {
      return request.toString();
    }
    if (typeof options?.url === 'string' && options.url) {
      return options.url;
    }
    return undefined;
  }
}