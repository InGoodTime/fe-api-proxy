/**
 * 文件：src/common/http-client.ts
 * 作用：从统一服务定义生成可执行的HTTP客户端
 * 
 * 核心功能设计：
 * 1. 将ServiceDefinition转换为可调用的客户端实例
 * 2. 支持多种调用方式：按ID调用、按名称调用
 * 3. 处理请求/响应的序列化和反序列化
 * 4. 提供完整的错误处理和生命周期钩子
 * 
 * 数据流转：
 * ServiceDefinition → 客户端实例 → 方法调用 → HTTP请求 → 响应处理 → 结果返回
 */

import type {
  ServiceDefinition,
  EndpointDefinition,
  ClientOptions,
  CallInput,
  RequestContext,
  ResponseContext,
} from '../types.js';
import { ApiError } from '../errors.js';
import { applyPathParams, serializeQuery } from './tools.js';

/**
 * 选择成功的响应定义
 * 
 * 选择策略：
 * 1. 优先选择2xx状态码的响应（200-299）
 * 2. 如果没有成功响应，则选择第一个响应作为默认
 * 
 * @param endpoint 端点定义，包含所有可能的响应定义
 * @returns 成功响应定义，用于类型推断和数据解析
 */
function pickSuccessResponse(endpoint: EndpointDefinition) {
  const list = endpoint.responses || [];
  return list.find(r => typeof r.status === 'number' && r.status >= 200 && r.status < 300) || list[0];
}

/**
 * API客户端接口
 * 
 * 提供多种调用API端点的方法：
 * - byId: 通过端点ID直接调用，支持类型推断
 * - call: 通用调用方法，需要手动指定端点ID
 * - urlOf: 获取端点URL，用于自定义请求或调试
 */
export interface ApiClient {
  /** 端点定义列表 */
  endpoints: EndpointDefinition[];
  /** 通过ID调用端点的映射 */
  byId: Record<string, (input?: CallInput, init?: RequestInit) => Promise<any>>;
  /** 通过ID调用端点的方法 */
  call: (endpointId: string, input?: CallInput, init?: RequestInit) => Promise<any>;
  /** 获取端点URL的方法 */
  urlOf: (endpointId: string, input?: CallInput) => string;
}

/**
 * 创建API客户端实例
 * 
 * 实现原理：
 * 1. 解析客户端配置，设置基础URL和fetch实现
 * 2. 为每个端点创建调用函数，支持参数校验和类型转换
 * 3. 封装HTTP请求逻辑，处理头部、请求体、响应解析
 * 4. 提供统一的错误处理和生命周期钩子
 * 
 * @param service 服务定义，包含所有端点信息
 * @param opts 客户端选项，包括基础URL、fetch实现、默认头部等
 * @returns 可用的API客户端实例
 */
export function createClient(service: ServiceDefinition, opts: ClientOptions = {}): ApiClient {
  const baseUrl = opts.baseUrl?.replace(/\/$/, '') || '';
  const fetchImpl: typeof fetch = opts.fetch ?? (globalThis as any).fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation found. Pass ClientOptions.fetch in Node < 18 or non-browser env.');
  }

  /**
   * 构建请求URL
   * 
   * 处理步骤：
   * 1. 将路径参数替换路径模板中的占位符
   * 2. 序列化查询参数为查询字符串
   * 3. 拼接基础URL、路径和查询字符串
   * 
   * @param ep 端点定义，包含路径模板
   * @param input 调用输入参数，包含路径和查询参数
   * @returns 完整的请求URL
   */
  function buildUrl(ep: EndpointDefinition, input?: CallInput) {
    const rawPath = applyPathParams(ep.path, input?.path);
    const qs = serializeQuery(input?.query, opts.queryArrayFormat);
    return baseUrl + rawPath + qs;
  }

  /**
   * 执行API调用
   * 
   * 执行流程：
   * 1. 构建请求URL和头部
   * 2. 根据Content-Type序列化请求体
   * 3. 执行请求前钩子（onRequest）
   * 4. 发送HTTP请求，处理网络错误
   * 5. 解析响应数据（JSON/文本/二进制）
   * 6. 执行响应后钩子（onResponse）
   * 7. 检查响应状态，非成功时抛出ApiError
   * 
   * @param ep 端点定义
   * @param input 调用输入参数
   * @param init 请求初始化选项
   * @returns 解析后的响应数据
   */
  async function doCall(ep: EndpointDefinition, input?: CallInput, init?: RequestInit) {
    const url = buildUrl(ep, input);
    const headers: Record<string, string> = {
      ...(opts.defaultHeaders || {}),
      ...(input?.headers || {}),
    };

    let bodyInit: BodyInit | undefined;
    // 处理请求体：根据Content-Type选择序列化方式
    if (input?.body !== undefined && input?.body !== null) {
      const ct = ep.body?.contentType || headers['Content-Type'] || headers['content-type'];
      if ((ct || '').includes('application/json') || !ct) {
        headers['Content-Type'] = 'application/json';
        bodyInit = JSON.stringify(input.body);
      } else if ((ct || '').includes('application/x-www-form-urlencoded')) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const params = new URLSearchParams();
        const obj = input.body as Record<string, any>;
        for (const [k, v] of Object.entries(obj || {})) {
          if (v != null) params.append(k, String(v));
        }
        bodyInit = params as any;
      } else {
        bodyInit = String(input.body);
      }
    }

    const method = ep.method || 'GET';
    const reqInit: RequestInit = {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : bodyInit,
      signal: input?.signal,
      ...init,
    };

    const reqCtx: RequestContext = { url, method, init: reqInit, endpoint: ep };
    // 执行请求前钩子，允许用户修改请求参数
    if (opts.onRequest) await opts.onRequest(reqCtx);

    let res: Response;
    try {
      res = await fetchImpl(url, reqInit);
    } catch (e: any) {
      throw new ApiError(e?.message || 'Network error', {
        url,
        method,
        endpoint: ep,
        requestInit: reqInit,
        code: 'NETWORK_ERROR',
      });
    }

    const ct = res.headers.get('content-type') || '';
    let data: any = null;
    // 解析响应数据：根据Content-Type选择解析方式
    try {
      if (ct.includes('application/json')) {
        data = await res.json();
      } else if (ct.includes('text/')) {
        data = await res.text();
      } else {
        data = await res.arrayBuffer();
      }
    } catch (_) {
      data = null;
    }

    const resCtx: ResponseContext = {
      url,
      method,
      init: reqInit,
      endpoint: ep,
      status: res.status,
      statusText: res.statusText,
      data,
    };
    // 执行响应后钩子，允许用户处理响应数据
    if (opts.onResponse) await opts.onResponse(resCtx);

    // 处理非成功响应：抛出包含详细信息的ApiError
    if (!res.ok) {
      throw new ApiError(`HTTP ${res.status} ${res.statusText}`, {
        url,
        method,
        endpoint: ep,
        requestInit: reqInit,
        status: res.status,
        statusText: res.statusText,
        data,
      });
    }

    const _success = pickSuccessResponse(ep);
    void _success;

    return data;
  }

  // 构建通过ID调用的映射：为每个端点创建快捷调用函数
  const byId: ApiClient['byId'] = Object.create(null);
  for (const ep of service.endpoints) {
    byId[ep.id] = (input?: CallInput, init?: RequestInit) => doCall(ep, input, init);
  }

  return {
    endpoints: service.endpoints,
    byId,
    /**
     * 通过端点ID调用API
     * @param endpointId 端点ID
     * @param input 调用输入参数
     * @param init 请求初始化选项
     * @returns 响应数据
     */
    call(endpointId: string, input?: CallInput, init?: RequestInit) {
      const fn = byId[endpointId];
      if (!fn) throw new Error(`Unknown endpoint id: ${endpointId}`);
      return fn(input, init);
    },
    /**
     * 获取端点的URL
     * @param endpointId 端点ID
     * @param input 调用输入参数
     * @returns 端点URL
     */
    urlOf(endpointId: string, input?: CallInput) {
      const ep = service.endpoints.find(e => e.id === endpointId);
      if (!ep) throw new Error(`Unknown endpoint id: ${endpointId}`);
      return buildUrl(ep, input);
    },
  };
}