import type { ServiceDefinition } from '../../../types.js';
import type { ApiDocSource } from '../../../../types.js';

/**
 * 支持的调用源类型
 * 包括常见的API文档格式以及自定义字符串类型以支持扩展
 */
export type InvokeSourceType = 'apifox' | 'swagger' | 'openapi' | 'postman' | string;

/**
 * 调用源配置接口
 * 定义了获取和解析API文档所需的所有配置信息
 */
export interface InvokeSourceConfig<Options = Record<string, unknown>> {
  /**
   * 源类型，对应不同的文档格式
   */
  type: InvokeSourceType;
  
  /**
   * 源名称，用于标识和错误提示
   */
  name?: string;
  
  /**
   * API文档源信息，包含URL等获取文档所需的信息
   */
  request?: ApiDocSource;
  
  /**
   * 已提供的文档数据，可选，如果提供则不需要通过request获取
   */
  document?: unknown;
  
  /**
   * 特定于源的选项配置
   */
  options?: Options;
  
  /**
   * 元数据信息，可用于存储额外的上下文数据
   */
  metadata?: Record<string, unknown>;
}

/**
 * 调用源适配器接口
 * 定义了处理特定类型API文档源所需实现的方法
 */
export interface InvokeSourceAdapter<Options = Record<string, unknown>> {
  /**
   * 源类型标识符
   */
  readonly type: InvokeSourceType;
  
  /**
   * 判断当前适配器是否能处理指定的源配置
   */
  canHandle(source: InvokeSourceConfig<unknown>): source is InvokeSourceConfig<Options>;
  
  /**
   * 获取API文档数据
   */
  fetch(source: InvokeSourceConfig<Options>): Promise<unknown>;
  
  /**
   * 解析文档数据为统一的服务定义
   */
  parse(payload: unknown, source: InvokeSourceConfig<Options>): Promise<ServiceDefinition> | ServiceDefinition;
}

/**
 * 统一的调用文档接口
 * 封装了解析后的文档信息，包括原始数据和服务定义
 */
export interface UnifiedInvokeDocument {
  /**
   * 源类型
   */
  type: InvokeSourceType;
  
  /**
   * 源名称
   */
  name?: string;
  
  /**
   * 原始文档数据
   */
  rawDocument: unknown;
  
  /**
   * 解析后的服务定义
   */
  serviceDefinition: ServiceDefinition;
  
  /**
   * 元数据信息
   */
  metadata?: Record<string, unknown>;
  
  /**
   * 使用的适配器类型
   */
  adapter: string;
}

/**
 * 调用源错误接口
 * 定义了处理API文档过程中可能发生的错误信息
 */
export interface InvokeSourceError {
  /**
   * 源类型
   */
  type: InvokeSourceType;
  
  /**
   * 源名称
   */
  name?: string;
  
  /**
   * 错误消息
   */
  message: string;
  
  /**
   * 错误原因（原始错误对象）
   */
  cause?: unknown;
}

/**
 * 调用阶段配置接口
 * 定义了执行调用阶段所需的所有配置信息
 */
export interface InvokeStageConfig {
  /**
   * 源配置列表
   */
  sources: InvokeSourceConfig[];
  
  /**
   * 自定义适配器列表
   */
  adapters?: InvokeSourceAdapter[];
  
  /**
   * 是否在遇到错误时继续处理其他源
   */
  continueOnError?: boolean;
  
  /**
   * 是否跳过此阶段
   */
  skip?: boolean;
}

/**
 * 调用阶段结果接口
 * 定义了调用阶段执行后的结果结构
 */
export interface InvokeStageResult {
  /**
   * 成功处理的文档列表
   */
  documents: UnifiedInvokeDocument[];
  
  /**
   * 处理过程中发生的错误列表
   */
  errors?: InvokeSourceError[];
}