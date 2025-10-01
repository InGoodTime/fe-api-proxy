/**
 * 文件：types.ts
 * 作用：为API文档驱动的客户端生成助手提供共享类型定义
 * 
 * 核心功能设计：
 * 1. 定义多种文档源类型（URL、多端点、发现式）
 * 2. 支持多文档合并策略
 * 3. 提供客户端生成的配置选项
 * 
 * 数据流转：
 * 文档源定义 → HTTP获取 → 合并处理 → 管道执行 → 客户端生成
 */
import type {
  DocSyncPipelineRunOptions,
  DocSyncStageConfig,
  InvokeStageConfig,
} from './src/pipeline/types.js';

/**
 * 获取API文档时支持的HTTP响应解析模式。
 * 
 * 模式说明：
 * - auto: 自动检测响应类型并选择合适的解析方式
 * - json: 强制使用JSON解析
 * - text: 解析为纯文本
 * - buffer: 解析为二进制数据
 */
export type ResponseParseMode = 'auto' | 'json' | 'text' | 'buffer';

/**
 * 从TTP端点获取API文档的请求描述。
 * 
 * 核心属性：
 * - url: 目标文档的URL地址
 * - method: HTTP请求方法，默认GET
 * - headers: 请求头部，用于身份验证等
 * - query: 查询参数，支持多种类型
 * - body: 请求体数据（POST等请求）
 * - parseAs: 指定响应解析模式
 */
export interface ApiDocRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | null | undefined>;
  body?: unknown;
  parseAs?: ResponseParseMode;
}

/**
 * 将多个端点文档聚合为一个逻辑系统的源定义。
 * 
 * 核心功能：
 * - requests: 多个文档请求的列表，支持字符串、URL和复杂请求对象
 * - mergeStrategy: 文档合并策略，决定如何将多个文档组合成一个
 * 
 * 适用场景：分布式微服务架构，多个服务的API文档需要统一管理
 */
export interface MultiEndpointSource {
  requests: Array<string | URL | ApiDocRequest>;
  mergeStrategy?: MergeStrategy;
}

/**
 * 动态发现并生成后续文档请求的源定义。
 * 
 * 核心功能：
 * - discovery: 发现服务的初始请求，用于获取服务列表或配置
 * - resolveRequests: 解析函数，根据发现结果生成实际的文档请求
 * - mergeStrategy: 多文档合并策略
 * 
 * 适用场景：服务注册中心、动态服务发现、配置中心等
 */
export interface DiscoverySource {
  discovery: string | URL | ApiDocRequest;
  resolveRequests: (
    payload: unknown
  ) => Promise<string | URL | ApiDocRequest | Array<string | URL | ApiDocRequest>> | string | URL | ApiDocRequest | Array<string | URL | ApiDocRequest>;
  mergeStrategy?: MergeStrategy;
}

/**
 * 将多个获取的API文档合并为单个载荷的策略。
 * 
 * 合并策略说明：
 * - auto: 自动检测文档类型并选择合适的合并方式
 * - swagger/openapi: 按Swagger/OpenAPI规范合并
 * - json-array: 将文档组合为JSON数组
 * - first: 只使用第一个文档，忽略其余
 * - 自定义函数: 提供完全自定义的合并逻辑
 */
export type MergeStrategy =
  | 'auto'
  | 'swagger'
  | 'openapi'
  | 'json-array'
  | 'first'
  | ((documents: unknown[]) => unknown);

/**
 * 生成器入口点支持的API文档源类型。
 * 
 * 支持的源类型：
 * - string: 简单URL字符串
 * - URL: URL对象
 * - ApiDocRequest: 完整的HTTP请求配置
 * - MultiEndpointSource: 多端点文档聚合
 * - DiscoverySource: 动态发现源
 */
export type ApiDocSource = string | URL | ApiDocRequest | MultiEndpointSource | DiscoverySource;

/**
 * 通过管道助手影响客户端生成的选项。
 * 
 * 配置选项：
 * - preferParser: 偏好的文档解析器类型
 * - outputDir: 生成文件的输出目录
 * - pipelineDefaults: 管道阶段的默认配置
 * - pipelineOptions: 管道执行的具体选项
 * 
 * 作用：提供统一的配置接口，简化高级用户的使用方式
 */
export interface GenerateClientOptions {
  preferParser?: InvokeStageConfig['sources'][number]['type'];
  outputDir?: string;
  pipelineDefaults?: Partial<DocSyncStageConfig>;
  pipelineOptions?: Partial<DocSyncPipelineRunOptions>;
}