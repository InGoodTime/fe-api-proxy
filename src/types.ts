/**
 * 文件：src/types.ts
 * 作用：集中定义接口文档同步与客户端生成所需的核心类型。
 * 
 * 核心功能设计：
 * 1. 定义统一的Schema类型系统，支持各种数据结构
 * 2. 提供接口定义的标准化模型（EndpointDefinition）
 * 3. 支持多种参数位置（路径、查询、头部、请求体）
 * 4. 定义运行时客户端的配置和上下文类型
 * 
 * 数据流转：
 * 原始文档 → 解析器 → ServiceDefinition → 代码生成器 → 运行时客户端
 */

/** 支持的 HTTP 请求方法枚举。 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS';

/** 统一模型中参数所在的位置类型。用于标识参数在HTTP请求中的具体位置。 */
export type ParamLocation = 'path' | 'query' | 'header' | 'body';

/** 
 * 归一化后可用的基础数据结构类型。
 * 
 * 支持的类型说明：
 * - string/number/integer/boolean: 基础原始类型
 * - object: 对象类型，支持属性定义
 * - array: 数组类型，支持元素类型约束
 * - null: 空值类型
 * - any/unknown: 任意类型和未知类型
 * - enum: 枚举类型，支持多种值类型
 * - oneOf: 联合类型，表示多选一
 */
export type SchemaKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'any'
  | 'unknown'
  | 'enum'
  | 'oneOf';

/** 
 * 各类 Schema 公共属性。
 * 
 * 属性说明：
 * - kind: 数据类型标识符，用于类型判断和处理
 * - description: 类型的描述信息，用于文档生成
 * - nullable: 是否允许null值，影响类型检查
 * - title: 类型的标题，通常用于显示
 * - example: 示例值，用于文档和测试
 */
export interface BaseSchema {
  kind: SchemaKind;
  description?: string;
  nullable?: boolean;
  title?: string;
  example?: unknown;
}

/** 
 * 描述对象类型的 Schema，支持属性及必填信息。
 * 
 * 核心功能：
 * - properties: 定义对象的所有属性及其类型
 * - required: 指定必填属性列表，用于校验
 * - additionalProperties: 是否允许额外属性，可为布尔值或Schema
 */
export interface ObjectSchema extends BaseSchema {
  kind: 'object';
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
}

/** 
 * 描述数组类型的 Schema，引入子元素类型与长度限制。
 * 
 * 核心功能：
 * - element: 数组元素的类型定义，支持任意Schema类型
 * - minItems/maxItems: 数组长度的最小值和最大值限制
 */
export interface ArraySchema extends BaseSchema {
  kind: 'array';
  element?: Schema;
  minItems?: number;
  maxItems?: number;
}

/** 
 * 枚举类型 Schema，列出可选值集合。
 * 
 * 核心功能：
 * - values: 定义所有允许的枚举值，支持多种类型混合
 * - 支持字符串、数字、布尔值和null的组合
 */
export interface EnumSchema extends BaseSchema {
  kind: 'enum';
  values: Array<string | number | boolean | null>;
}

/** 
 * 联合类型 Schema，表示 oneOf/anyOf 等多选一结构。
 * 
 * 核心功能：
 * - variants: 定义所有可能的类型选项
 * - 用于处理复杂的类型联合，如 A | B | C
 */
export interface OneOfSchema extends BaseSchema {
  kind: 'oneOf';
  variants: Schema[];
}

/** 
 * 原始类型 Schema，支持格式信息（如 email、date-time）。
 * 
 * 核心功能：
 * - 支持基础类型：string、number、integer、boolean等
 * - format: 特殊格式标识，如email、uri、date-time等
 * - 用于数据验证和类型生成
 */
export type PrimitiveSchema = BaseSchema & {
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'any' | 'unknown';
  format?: string;
};

/** 
 * 各类型 Schema 的联合，用于参数、请求体、响应等场景。
 * 
 * 作用：
 * - 提供统一的类型接口，支持所有可能的数据结构
 * - 使用类型守卫和模式匹配进行类型判断和处理
 */
export type Schema =
  | PrimitiveSchema
  | ObjectSchema
  | ArraySchema
  | EnumSchema
  | OneOfSchema;

/** 
 * 统一模型中的单个请求参数描述。
 * 
 * 核心属性：
 * - name: 参数名称，用于标识和引用
 * - in: 参数位置（path/query/header/body）
 * - required: 是否为必填参数
 * - schema: 参数的数据类型定义
 * - style: 参数序列化方式（用于OpenAPI）
 */
export interface ParameterDefinition {
  name: string;
  in: ParamLocation;
  required?: boolean;
  description?: string;
  schema?: Schema;
  example?: unknown;
  style?: 'form' | 'simple' | 'matrix' | 'label' | 'spaceDelimited' | 'pipeDelimited' | 'deepObject';
}

/** 
 * 描述请求体的元数据与 Schema 定义。
 * 
 * 核心属性：
 * - required: 请求体是否为必填
 * - contentType: MIME类型，如application/json、multipart/form-data
 * - schema: 请求体的数据结构定义
 */
export interface RequestBodyDefinition {
  required?: boolean;
  contentType?: string;
  schema?: Schema;
}

/** 
 * 单个响应结构的描述信息。
 * 
 * 核心属性：
 * - status: HTTP状态码或'default'（默认响应）
 * - description: 响应的描述信息
 * - contentType: 响应的MIME类型
 * - schema: 响应数据的结构定义
 */
export interface ResponseDefinition {
  status?: number | 'default';
  description?: string;
  contentType?: string;
  schema?: Schema;
}

/** 
 * 统一后的接口定义，客户端按此生成请求函数。
 * 
 * 核心属性：
 * - id: 唯一标识符（通常为operationId或自动生成）
 * - path: URL路径模板，如/users/{id}
 * - method: HTTP方法
 * - parameters: 按位置分组的参数定义
 * - body: 请求体定义（仅适用于POST/PUT等）
 * - responses: 所有可能的响应定义
 */
export interface EndpointDefinition {
  id: string; // operationId or generated
  name?: string;
  description?: string;
  path: string; // e.g. /users/{id}
  method: HttpMethod;
  tags?: string[];
  parameters?: {
    path?: ParameterDefinition[];
    query?: ParameterDefinition[];
    header?: ParameterDefinition[];
  };
  body?: RequestBodyDefinition; // for request body
  responses?: ResponseDefinition[]; // prefer first 2xx
}

/** 描述整个接口服务的基本信息与所有接口。 */
export interface ServiceDefinition {
  title?: string;
  version?: string;
  description?: string;
  servers?: string[];
  types?: Record<string, Schema>;
  endpoints: EndpointDefinition[];
  source?: {
    kind: string;
    raw?: any;
  };
}

/** 
 * 运行时客户端可选项。
 * 
 * 核心配置：
 * - baseUrl: 基础URL，会与接口路径拼接
 * - fetch: 自定义的fetch实现，默认使用全局fetch
 * - defaultHeaders: 所有请求的默认头部
 * - queryArrayFormat: 数组参数的序列化方式
 * - onRequest/onResponse: 请求生命周期钩子
 */
export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  defaultHeaders?: Record<string, string>;
  queryArrayFormat?: 'repeat' | 'comma';
  onRequest?: (ctx: RequestContext) => void | Promise<void>;
  onResponse?: (ctx: ResponseContext) => void | Promise<void>;
}

/** 
 * 调用单个接口时可传入的动态参数。
 * 
 * 参数类型：
 * - path: 路径参数，用于替换URL模板中的占位符
 * - query: 查询参数，会拼接到URL后面
 * - headers: 请求头部，会与默认头部合并
 * - body: 请求体数据
 * - signal: 取消信号，用于中断请求
 */
export interface CallInput {
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

/** 
 * 请求发起前的上下文信息，供钩子使用。
 * 
 * 包含信息：
 * - url: 最终的请求URL（已处理路径参数和查询参数）
 * - method: HTTP请求方法
 * - init: fetch的RequestInit对象
 * - endpoint: 对应的接口定义
 */
export interface RequestContext {
  url: string;
  method: HttpMethod;
  init: RequestInit;
  endpoint: EndpointDefinition;
}

/** 
 * 请求完成后的上下文信息，包含响应结果。
 * 
 * 扩展信息：
 * - status/statusText: HTTP响应状态
 * - data: 解析后的响应数据
 * - 继承自 RequestContext 的所有属性
 */
export interface ResponseContext extends RequestContext {
  status: number;
  statusText: string;
  data: unknown;
}
