/**
 * 文件：src/errors.ts
 * 作用：定义API客户端使用的共享错误类型
 * 
 * 核心功能设计：
 * 1. 提供统一的API调用错误封装
 * 2. 包含详细的错误上下文和诊断信息
 * 3. 支持HTTP状态码和自定义错误代码
 * 4. 便于错误处理和问题排查
 * 
 * 数据流转：
 * HTTP请求异常 → 错误上下文收集 → ApiError封装 → 上层处理
 */

import type { HttpMethod, EndpointDefinition } from './types.js';

/**
 * ApiError异常上下文信息接口
 * 
 * 上下文信息：
 * 1. 包含发起请求时的相关信息，用于错误诊断
 * 2. 提供请求URL、HTTP方法等关键信息
 * 3. 可选包含端点定义和请求配置
 * 
 * 适用场景：错误日志、调试信息、重试策略等
 */
export interface ApiErrorContext {
  /** 请求URL */
  url: string;
  /** HTTP方法 */
  method: HttpMethod;
  /** 端点定义（可选） */
  endpoint?: EndpointDefinition;
  /** 请求初始化选项（可选） */
  requestInit?: RequestInit;
}

/**
 * API错误包装类
 * 
 * 错误特性：
 * 1. 在HTTP请求失败时抛出，携带HTTP元数据和失败载荷
 * 2. 继承自标准Error类，兼容现有错误处理机制
 * 3. 提供丰富的错误上下文，便于问题定位
 * 
 * 错误属性：
 * - status/statusText: HTTP响应状态信息
 * - data: 服务器返回的错误数据
 * - ctx: 请求上下文，包含URL、方法等
 * - code: 自定义错误代码，用于错误分类
 */
export class ApiError extends Error {
  /** HTTP状态码 */
  public status?: number;
  /** HTTP状态文本 */
  public statusText?: string;
  /** 错误数据 */
  public data?: unknown;
  /** 错误上下文 */
  public ctx: ApiErrorContext;
  /** 错误代码 */
  public code?: string;

  /**
   * 构造ApiError实例
   * 
   * 构造特性：
   * 1. 设置错误名称为'ApiError'，便于错误类型识别
   * 2. 分离存储上下文和状态信息，避免数据混乱
   * 3. 支持可选的错误属性，适应不同错误场景
   * 
   * @param message 错误消息，描述错误的基本情况
   * @param ctx 错误上下文，包含状态、状态文本、数据和代码等信息
   */
  constructor(message: string, ctx: ApiErrorContext & { status?: number; statusText?: string; data?: unknown; code?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = ctx.status;
    this.statusText = ctx.statusText;
    this.data = ctx.data;
    this.ctx = { url: ctx.url, method: ctx.method, endpoint: ctx.endpoint, requestInit: ctx.requestInit };
    this.code = ctx.code;
  }
}