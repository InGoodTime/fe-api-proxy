/**
/**
 * 文件: src/pipeline/types.ts
 * 作用: 定义 DocSync 流水线各阶段和结果共享的类型定义
 * 
 * 核心功能设计：
 * 1. 定义流水线的执行上下文和结果类型
 * 2. 为每个阶段提供独立的配置和结果类型
 * 3. 支持中间件和日志系统的类型定义
 * 4. 提供灵活的扩展点和钩子支持
 * 
 * 数据流转：
 * 配置类型 → 执行上下文 → 阶段结果 → 最终输出
 */

import type { ServiceDefinition, Schema } from '../types.js';
import type { InvokeStageConfig, InvokeStageResult } from '../stage/extend/invoke/contracts.js';
import type { DocSourceParser, ParseContext } from '../stage/extend/parser/parser.js';
import type { GeneratedBundle, CodegenOptions, CodeGeneratorExtension, GeneratedFile } from '../stage/extend/generator/generator.js';
import type { NormalizerExtension } from '../stage/extend/normalizer/convert.js';
import type { FileWriter, WriteOptions } from '../stage/extend/output/writer.js';
import type { IStage } from '../stage/index.js';

/**
 * 流水线阶段结果映射表
 * 
 * 功能特性：
 * 1. 用于存储每个阶段的执行结果
 * 2. 支持任意类型的结果存储
 * 3. 使用阶段名称作为键名进行索引
 */
export interface PipelineStageResultMap {
  [stageName: string]: unknown;
}

/**
 * 流水线执行结果
 * 
 * 结果组成：
 * 1. context: 最终的执行上下文，包含所有累积的数据
 * 2. stageResults: 各阶段的结果映射，用于详细分析
 * 
 * 适用场景：为不同流水线提供统一的结果接口
 */
export interface PipelineExecutionResult<Context extends Record<string, unknown>> {
  context: Context;
  stageResults: PipelineStageResultMap;
}

/**
 * 文档同步上下文
 * 
 * 上下文数据类型：
 * 1. rawDocument: 原始文档数据，未经解析的源文档
 * 2. serviceDefinition: 统一的服务定义模型
 * 3. invokeResults: 调用阶段的详细结果
 * 4. normalizedService: 规范化后的服务定义
 * 5. generatedBundle: 生成的代码包
 * 6. writtenFiles: 已写入的文件路径列表
 * 
 * 数据流转：在流水线各阶段之间传递的上下文数据
 */
export interface DocSyncContext {
  /** 原始文档数据 */
  rawDocument?: unknown;
  /** 服务定义 */
  serviceDefinition?: ServiceDefinition;
  /** 调用阶段结果 */
  invokeResults?: InvokeStageResult;
  /** 规范化后的服务 */
  normalizedService?: ServiceDefinition;
  /** 生成的代码包 */
  generatedBundle?: GeneratedBundle;
  /** 已写入的文件列表 */
  writtenFiles?: string[];
  /** 其他扩展属性 */
  [key: string]: unknown;
}

/**
 * 解析器阶段配置
 * 
 * 配置选项：
 * 1. source: 需要解析的文档源数据
 * 2. prefer: 优先使用的解析器名称（swagger/postman/apifox）
 * 3. parsers: 可用的解析器列表，支持自定义扩展
 * 4. context: 解析过程中的上下文信息
 * 5. skip: 是否跳过此阶段的执行
 * 
 * 作用：控制文档解析阶段的行为
 */
export interface ParserStageConfig {
  /** 文档源数据 */
  source?: unknown;
  /** 优先使用的解析器 */
  prefer?: string;
  /** 可用的解析器列表 */
  parsers?: DocSourceParser[];
  /** 解析上下文 */
  context?: ParseContext;
  /** 服务定义 */
  service?: ServiceDefinition;
  /** 是否跳过此阶段 */
  skip?: boolean;
}

/**
 * 解析器阶段结果
 * 
 * 结果内容：
 * 1. rawDocument: 保留原始文档数据，用于调试和错误分析
 * 2. serviceDefinition: 解析后的服务定义，为后续阶段提供数据
 * 3. parserName: 实际使用的解析器名称，用于日志和统计
 * 
 * 作用：文档解析阶段的输出结果
 */
export interface ParserStageResult {
  /** 原始文档 */
  rawDocument: unknown;
  /** 服务定义 */
  serviceDefinition: ServiceDefinition;
  /** 使用的解析器名称 */
  parserName: string;
}

/**
 * 规范化阶段配置
 * 
 * 配置选项：
 * 1. service: 需要规范化的服务定义
 * 2. transforms: 转换函数数组，用于自定义的数据变换
 * 3. extensions: 扩展插件数组，提供特定的规范化功能
 * 4. inputs: 额外的输入数据，用于复杂的合并场景
 * 5. skip: 是否跳过此阶段的执行
 * 
 * 作用：控制服务定义规范化阶段的行为
 */
export interface NormalizerStageConfig {
  /** 服务定义 */
  service?: ServiceDefinition;
  /** 转换函数数组 */
  transforms?: Array<(service: ServiceDefinition) => ServiceDefinition | void | Promise<ServiceDefinition | void>>;
  /** 扩展插件数组 */
  extensions?: NormalizerExtension[];
  /** 输入数据 */
  inputs?: Array<{ key: string; payload: unknown }>;
  /** 是否跳过此阶段 */
  skip?: boolean;
}

/**
 * 规范化阶段结果
 * 
 * 结果内容：
 * 1. serviceDefinition: 规范化后的服务定义
 * 2. normalizedTypes: 规范化后的类型定义集合
 * 3. appliedTransforms: 已应用的转换器列表，用于调试
 * 4. appliedExtensions: 已应用的扩展列表，用于调试
 * 
 * 作用：服务定义规范化阶段的输出结果
 */
export interface NormalizerStageResult {
  /** 服务定义 */
  serviceDefinition: ServiceDefinition;
  /** 规范化后的类型 */
  normalizedTypes?: Record<string, Schema>;
  /** 已应用的转换器列表 */
  appliedTransforms?: string[];
  /** 已应用的扩展列表 */
  appliedExtensions?: string[];
}

/**
 * 生成器阶段配置
 * 
 * 配置选项：
 * 1. service: 用于代码生成的服务定义
 * 2. generator: 代码生成器扩展，支持自定义生成逻辑
 * 3. options: 代码生成选项，如语言、风格等
 * 4. skip: 是否跳过此阶段的执行
 * 
 * 作用：控制代码生成阶段的行为
 */
export interface GeneratorStageConfig {
  /** 服务定义 */
  service?: ServiceDefinition;
  /** 代码生成器扩展 */
  generator?: CodeGeneratorExtension;
  /** 代码生成选项 */
  options?: CodegenOptions;
  /** 是否跳过此阶段 */
  skip?: boolean;
}

/**
 * 生成器阶段结果
 * 
 * 结果内容：
 * 1. bundle: 生成的代码包，包含所有生成的文件
 * 2. generatorName: 使用的生成器名称，用于识别和统计
 * 
 * 作用：代码生成阶段的输出结果
 */
export interface GeneratorStageResult {
  /** 生成的代码包 */
  bundle: GeneratedBundle;
  /** 使用的生成器名称 */
  generatorName: string;
}

/**
 * 输出阶段配置
 * 
 * 配置选项：
 * 1. bundle: 需要输出的代码包
 * 2. writer: 文件写入器，支持自定义写入逻辑
 * 3. outputDir: 输出目录路径
 * 4. mapFilePath: 文件路径映射函数，用于自定义文件布局
 * 5. extraFiles: 额外的文件列表，如配置文件、README等
 * 6. writeOptions: 写入选项，如编码、权限等
 * 7. skip: 是否跳过此阶段的执行
 * 
 * 作用：控制文件输出阶段的行为
 */
export interface OutputStageConfig {
  /** 生成的代码包 */
  bundle?: GeneratedBundle;
  /** 文件写入器 */
  writer?: FileWriter;
  /** 输出目录 */
  outputDir?: string;
  /** 文件路径映射函数 */
  mapFilePath?: (file: GeneratedFile) => string;
  /** 额外文件 */
  extraFiles?: Array<{ path: string; content: string }>;
  /** 写入选项 */
  writeOptions?: WriteOptions;
  /** 是否跳过此阶段 */
  skip?: boolean;
}

/**
 * 输出阶段结果
 * 
 * 结果内容：
 * 1. writtenFiles: 已成功写入的文件路径列表
 * 
 * 作用：
 * - 提供输出结果的反馈信息
 * - 用于后续的清理或验证操作
 * - 支持增量更新和版本控制
 */
export interface OutputStageResult {
  /** 已写入的文件路径列表 */
  writtenFiles: string[];
}

/**
 * 文档同步阶段配置
 * 
 * 配置组成：
 * 1. invoke: 调用阶段配置，控制文档获取和解析
 * 2. normalizer: 规范化阶段配置，控制数据标准化
 * 3. generator: 生成阶段配置，控制代码生成
 * 4. output: 输出阶段配置，控制文件写入
 * 
 * 作用：整个文档同步流程的阶段配置集合
 */
export interface DocSyncStageConfig {
  /** 调用阶段配置 */
  invoke?: InvokeStageConfig;
  /** 规范化阶段配置 */
  normalizer?: NormalizerStageConfig;
  /** 生成阶段配置 */
  generator?: GeneratorStageConfig;
  /** 输出阶段配置 */
  output?: OutputStageConfig;
}

/**
 * 文档同步流水线运行选项
 * 控制整个流水线运行的选项
 */
/**
 * 文档同步流水线运行选项
 * 
 * 运行配置：
 * 1. 继承 DocSyncStageConfig 的所有阶段配置
 * 2. initialContext: 初始上下文，用于预设数据
 * 3. stageMiddlewares: 阶段中间件列表，用于扩展功能
 * 4. stageLogger: 阶段日志记录器，设为 false 可禁用日志
 * 
 * 作用：控制整个流水线运行的选项
 */
export interface DocSyncPipelineRunOptions extends DocSyncStageConfig {
  /** 初始上下文 */
  initialContext?: Partial<DocSyncContext>;
  /** 阶段中间件 */
  stageMiddlewares?: StageMiddleware[];
  /** 阶段日志记录器，设为 false 可禁用日志 */
  stageLogger?: StageLogger | false;
}

/**
 * 文档同步流水线结果
 * 文档同步流水线的最终执行结果
 */
/**
 * 文档同步流水线结果
 * 
 * 结果组成：
 * 1. 继承 DocSyncContext 的所有上下文数据
 * 2. stageResults: 各阶段执行结果的详细映射
 * 
 * 作用：
 * - 提供流水线的最终执行结果
 * - 支持阶段级别的结果访问和分析
 * - 便于调试和问题排查
 */
export interface DocSyncPipelineResult extends DocSyncContext {
  /** 各阶段执行结果 */
  stageResults: PipelineStageResultMap;
}

/**
 * 阶段调用参数
 * 阶段执行时传递的参数
 */
/**
 * 阶段调用参数
 * 
 * 参数组成：
 * 1. stage: 阶段实例，包含执行逻辑
 * 2. context: 执行上下文，在阶段间传递
 * 3. params: 阶段参数，控制阶段行为
 * 4. stageResults: 阶段结果映射，用于跨阶段数据访问
 * 
 * 作用：阶段执行时传递的参数
 */
export interface StageInvokeArgs<Params, Result> {
  /** 阶段实例 */
  stage: IStage<DocSyncContext, Params, Result>;
  /** 执行上下文 */
  context: DocSyncContext;
  /** 阶段参数 */
  params: Params;
  /** 阶段结果映射 */
  stageResults: PipelineStageResultMap;
}

/**
 * 阶段调用器
 * 阶段执行函数的类型定义
 */
/**
 * 阶段调用器
 * 
 * 功能特性：
 * 1. 定义阶段执行函数的标准类型
 * 2. 支持泛型参数，保证类型安全
 * 3. 返回 Promise，支持异步执行
 * 
 * 作用：阶段执行函数的类型定义
 */
export type StageInvoker<Params, Result> = (args: StageInvokeArgs<Params, Result>) => Promise<Result>;

/**
 * 阶段中间件
 * 可以在阶段执行前后插入的逻辑
 */
/**
 * 阶段中间件
 * 
 * 中间件特性：
 * 1. 可以在阶段执行前后插入的逻辑
 * 2. 支持调用链模式，允许多中间件嵌套
 * 3. 提供对参数和结果的完全控制
 * 
 * 适用场景：
 * - 日志记录和性能监控
 * - 参数验证和结果转换
 * - 错误处理和重试机制
 */
export type StageMiddleware = <Params, Result>(next: StageInvoker<Params, Result>, args: StageInvokeArgs<Params, Result>) => Promise<Result>;

/**
 * 阶段日志记录器
 * 定义日志记录器的接口
 */
/**
 * 阶段日志记录器
 * 
 * 日志级别：
 * 1. info: 信息日志，用于记录正常操作
 * 2. warn: 警告日志，用于记录潜在问题
 * 3. error: 错误日志，用于记录严重问题
 * 4. debug: 调试日志，用于开发调试
 * 
 * 特性：
 * - 支持可选的日志方法，提供灵活性
 * - 兼容不同的日志库和平台
 */
export interface StageLogger {
  /** 信息日志 */
  info(message: string): void;
  /** 警告日志（可选） */
  warn?(message: string): void;
  /** 错误日志（可选） */
  error?(message: string): void;
  /** 调试日志（可选） */
  debug?(message: string): void;
}

export type { InvokeStageConfig, InvokeStageResult } from '../stage/extend/invoke/contracts.js';