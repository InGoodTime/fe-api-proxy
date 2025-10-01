/**
 * 文件：src/pipeline/index.ts
 * 作用：定义 DocSyncPipeline 阶段并提供中间件和日志扩展
 * 
 * 核心功能设计：
 * 1. 实现文档同步的完整管道：调用 → 解析 → 规范化 → 生成 → 输出
 * 2. 支持灵活的中间件系统，允许插入自定义逻辑
 * 3. 提供详细的日志记录功能，便于调试和监控
 * 4. 支持阶段级别的配置合并和覆盖
 * 
 * 数据流转：
 * 输入配置 → 阶段执行 → 上下文传递 → 结果聚合 → 最终输出
 */

import type {
  DocSyncContext,
  DocSyncPipelineRunOptions,
  DocSyncPipelineResult,
  DocSyncStageConfig,
  PipelineStageResultMap,
  InvokeStageConfig,
  NormalizerStageConfig,
  GeneratorStageConfig,
  OutputStageConfig,
  StageInvokeArgs,
  StageInvoker,
  StageMiddleware,
  StageLogger,
} from './types.js';
import { InvokeStage, NormalizerStage, GeneratorStage, OutputStage } from '../stage/index.js';
import type { IStage } from '../stage/index.js';
import type { InvokeStageResult, UnifiedInvokeDocument } from '../stage/extend/invoke/contracts.js';

/**
 * 通用管道接口
 * 
 * 定义了所有管道实现必须遵循的标准接口：
 * - 具有唯一的名称标识
 * - 提供统一的运行方法
 * - 支持泛型参数，保证类型安全
 */
export interface IPipeline<RunConfig, Result> {
  /** 通用名称 */
  readonly name: string;
  /**
   * 运行管道
   * @param config 运行配置
   * @returns 运行结果
   */
  run(config: RunConfig): Promise<Result>;
}

/**
 * 合并阶段配置
 * 
 * 实现特性：
 * 1. 支持深度合并：将两个配置对象的属性进行递归合并
 * 2. 覆盖优先：后传入的配置优先级更高
 * 3. 处理边界情况：自动处理undefined和null值
 * 
 * @param base 基础配置，通常来自默认设置
 * @param override 覆盖配置，来自用户输入
 * @returns 合并后的配置，保持原有类型
 */
function mergeStageConfig<T>(base?: T, override?: T): T | undefined {
  if (base === undefined) return override;
  if (override === undefined) return base;
  if (typeof base === 'object' && base && typeof override === 'object' && override) {
    return { ...(base as Record<string, unknown>), ...(override as Record<string, unknown>) } as T;
  }
  return override;
}

/**
 * 判断是否为可合并对象
 * 
 * 判断条件：
 * 1. 非空值（null/undefined）
 * 2. 类型为'object'
 * 3. 非数组类型「keyCode
 * 
 * @param value 输入值
 * @returns 如果输入值为可合并对象则返回 true，否则返回 false
 */
function isMergeableObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function formatForLogEntry(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.length > 80) {
      return "'" + value.slice(0, 77) + "...'";
    }
    return "'" + value + "'";
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const preview = value.slice(0, 5).map(v => formatForLogEntry(v)).join(', ');
    const suffix = value.length > 5 ? ', ...' : '';
    return `Array(${value.length})[${preview}${suffix}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return '{}';
    const preview = entries
      .slice(0, 5)
      .map(([key, val]) => `${key}=${formatForLogEntry(val)}`)
      .join(', ');
    const suffix = entries.length > 5 ? ', ...' : '';
    return `{${preview}${suffix}}`;
  }
  return String(value);
}
/**
 * 创建控制台阶段日志记录器
 * 
 * 功能特性：
 * 1. 映射到标准控制台方法
 * 2. 兼容性处理：debug方法的fallback
 * 3. 提供统一的日志接口
 * 
 * @returns 控制台日志记录器实例
 */
function createConsoleStageLogger(): StageLogger {
  return {
    info: message => console.log(message),
    warn: message => console.warn(message),
    error: message => console.error(message),
    debug: message => (console.debug ? console.debug(message) : console.log(message)),
  };
}
/**
 * 创建阶段日志中间件
 * 
 * 日志功能：
 * 1. 记录阶段开始/成功/失败信息
 * 2. 计算和显示执行时间
 * 3. 格式化输入参数和输出结果
 * 4. 提供详细的错误信息
 * 
 * @param logger 可选的日志记录器，默认使用控制台
 * @returns 日志中间件函数
 */
export function createStageLoggingMiddleware(logger?: StageLogger): StageMiddleware {
  const target = logger ?? createConsoleStageLogger();
  return async function stageLoggingMiddleware<Params, Result>(
    next: StageInvoker<Params, Result>,
    args: StageInvokeArgs<Params, Result>
  ): Promise<Result> {
    const stageName = args.stage.name;
    const paramsDump = formatForLogEntry(args.params);
    const start = Date.now();
    target.info(`[DocSyncPipeline] START stage=${stageName}\n  params=${paramsDump}`);
    try {
      const result = await next(args);
      const duration = Date.now() - start;
      const resultDump = formatForLogEntry(result);
      target.info(
        `[DocSyncPipeline] SUCCESS stage=${stageName} duration=${duration}ms\n  result=${resultDump}`,
      );
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      const errorDump = formatForLogEntry(error);
      (target.error ?? target.info)(
        `[DocSyncPipeline] FAIL stage=${stageName} duration=${duration}ms message=${message}\n  error=${errorDump}`,
      );
      throw error;
    }
  };
}
/**
 * 运行单个阶段
 * 
 * 执行流程：
 * 1. 构建基础调用器，封装阶段的execute方法
 * 2. 应用所有中间件，形成调用链
 * 3. 执行最终的组合调用器
 * 4. 将阶段结果存储到结果映射中
 * 5. 如果结果是对象，将其合并到上下文
 * 6. 统一处理错误，添加阶段信息
 * 
 * @param options 运行参数，包含阶段、上下文、参数等
 */
async function runStage<Params, Result>(options: {
  stage: IStage<DocSyncContext, Params, Result>;
  context: DocSyncContext;
  params: Params;
  stageResults: PipelineStageResultMap;
  middlewares: StageMiddleware[];
}): Promise<void> {
  const { stage, context, params, stageResults, middlewares } = options;
  const baseInvoker: StageInvoker<Params, Result> = async invocation =>
    stage.execute(invocation.context, invocation.params);

  const composed = middlewares.reduceRight<StageInvoker<Params, Result>>(
    (next, middleware) => args => middleware(next, args),
    baseInvoker,
  );

  try {
    const result = await composed({ stage, context, params, stageResults });
    stageResults[stage.name] = result;
    if (isMergeableObject(result)) {
      Object.assign(context, result);
    }
  } catch (error) {
    if (error instanceof Error) {
      error.message = '[DocSyncPipeline] Stage ' + stage.name + ' failed: ' + error.message;
      throw error;
    }
    throw new Error('[DocSyncPipeline] Stage ' + stage.name + ' failed: ' + String(error));
  }
}
/**
 * 选择主要文档
 * 
 * 选择策略：
 * 1. 根据配置中的sources顺序查找匹配的文档
 * 2. 查找标记为主要文档（primary=true）的文档
 * 3. 如果都没有，选择第一个文档
 * 
 * @param result 调用阶段结果，包含所有解析后的文档
 * @param config 调用阶段配置，用于确定优先级
 * @returns 选中的主要文档，或undefined
 */
function selectPrimaryDocument(
  result: InvokeStageResult | undefined,
  config?: InvokeStageConfig
): UnifiedInvokeDocument | undefined {
  if (!result || !Array.isArray(result.documents) || result.documents.length === 0) {
    return undefined;
  }

  if (config?.sources?.length) {
    for (const source of config.sources) {
      const key = source.name ?? source.type;
      const match = result.documents.find(doc => doc.name === key || doc.type === source.type);
      if (match) {
        return match;
      }
    }
  }

  const preferred = result.documents.find(doc => doc.metadata?.primary === true);
  if (preferred) {
    return preferred;
  }

  return result.documents[0];
}
/**
 * 文档同步管道
 * 
 * 实现特性：
 * 1. 实现IPipeline接口，提供标准化的管道操作
 * 2. 包含完整的文档同步各个阶段的实现
 * 3. 支持灵活的中间件系统和日志记录
 * 4. 提供阶段级别的配置合并能力
 * 
 * 阶段流程：
 * Invoke（调用）→ Normalizer（规范化）→ Generator（生成）→ Output（输出）
 */
export class DocSyncPipeline implements IPipeline<DocSyncPipelineRunOptions, DocSyncPipelineResult> {
  readonly name = 'doc-sync';
  private readonly defaults: Partial<DocSyncStageConfig>;
  private readonly invokeStage = new InvokeStage();
  private readonly normalizerStage = new NormalizerStage();
  private readonly generatorStage = new GeneratorStage();
  private readonly outputStage = new OutputStage();
  private readonly baseMiddlewares: StageMiddleware[];
  private readonly loggingMiddleware?: StageMiddleware;

  /**
   * 构造函数
   * 
   * 初始化特性：
   * 1. 设置默认阶段配置，支持全局覆盖
   * 2. 配置基础中间件列表，支持扩展
   * 3. 设置日志记录器，支持禁用
   * 
   * @param defaults 默认阶段配置，会与运行时配置合并
   * @param middlewares 管道中间件列表，在所有阶段中生效
   * @param logger 可选的日志记录器，设置为 false 则禁用日志
   */
  constructor(
    defaults?: Partial<DocSyncStageConfig>,
    middlewares?: StageMiddleware[],
    logger: StageLogger | false = createConsoleStageLogger()
  ) {
    this.defaults = defaults ?? {};
    this.baseMiddlewares = middlewares?.slice() ?? [];
    if (logger !== false) {
      const resolvedLogger = logger ?? createConsoleStageLogger();
      this.loggingMiddleware = createStageLoggingMiddleware(resolvedLogger);
    }
  }

  private buildStageMiddlewares(options: DocSyncPipelineRunOptions): StageMiddleware[] {
    const middlewares: StageMiddleware[] = [];
    let loggingMiddleware = this.loggingMiddleware;

    // 根据运行配置决定是否启用日志中间件
    if (options.stageLogger !== undefined) {
      loggingMiddleware = options.stageLogger === false
        ? undefined
        : createStageLoggingMiddleware(options.stageLogger);
    }

    // 添加日志中间件（如果启用）
    if (loggingMiddleware) {
      middlewares.push(loggingMiddleware);
    }

    // 添加基础中间件
    middlewares.push(...this.baseMiddlewares);

    // 添加运行时指定的额外中间件
    if (options.stageMiddlewares?.length) {
      middlewares.push(...options.stageMiddlewares);
    }

    return middlewares;
  }

  /**
   * 运行管道
   * 
   * 执行流程：
   * 1. 初始化上下文和结果映射
   * 2. 按顺序执行各个阶段：调用→规范化→生成→输出
   * 3. 在阶段间传递上下文数据
   * 4. 处理主要文档选择逻辑
   * 5. 返回最终的聚合结果
   * 
   * @param options 运行选项，包含各阶段配置和中间件设置
   * @returns 管道运行结果，包含最终上下文和所有阶段结果
   */
  async run(options: DocSyncPipelineRunOptions): Promise<DocSyncPipelineResult> {
    // 初始化上下文和结果映射
    const context: DocSyncContext = { ...(options.initialContext ?? {}) };
    const stageResults: PipelineStageResultMap = {};
    const stageMiddlewares = this.buildStageMiddlewares(options);

    const invokeConfig = mergeStageConfig(this.defaults.invoke, options.invoke);
    if (invokeConfig !== undefined) {
      await runStage({
        stage: this.invokeStage,
        context,
        params: invokeConfig as InvokeStageConfig,
        stageResults,
        middlewares: stageMiddlewares,
      });
    }

    if (!context.serviceDefinition) {
      const invokeResult = (context.invokeResults as InvokeStageResult | undefined)
        ?? (stageResults[this.invokeStage.name] as InvokeStageResult | undefined);
      const primaryDocument = selectPrimaryDocument(invokeResult, invokeConfig);
      if (primaryDocument) {
        context.serviceDefinition = primaryDocument.serviceDefinition;
        if (context.rawDocument === undefined) {
          context.rawDocument = primaryDocument.rawDocument;
        }
        if ((context as Record<string, unknown>).parserName === undefined) {
          (context as Record<string, unknown>).parserName = primaryDocument.adapter;
        }
      }
    }

    if (!context.serviceDefinition) {
      throw new Error(
        '[DocSyncPipeline] Missing service definition. Provide invoke configuration or set it on the initial context.',
      );
    }

    const normalizerConfig = mergeStageConfig(this.defaults.normalizer, options.normalizer);
    if (normalizerConfig !== undefined || context.serviceDefinition) {
      await runStage({
        stage: this.normalizerStage,
        context,
        params: normalizerConfig as NormalizerStageConfig | undefined,
        stageResults,
        middlewares: stageMiddlewares,
      });
    }

    const generatorConfig = mergeStageConfig(this.defaults.generator, options.generator)
      ?? ({} as GeneratorStageConfig);
    await runStage({
      stage: this.generatorStage,
      context,
      params: generatorConfig as GeneratorStageConfig,
      stageResults,
      middlewares: stageMiddlewares,
    });

    const outputConfig = mergeStageConfig(this.defaults.output, options.output);
    if (outputConfig !== undefined) {
      await runStage({
        stage: this.outputStage,
        context,
        params: outputConfig as OutputStageConfig,
        stageResults,
        middlewares: stageMiddlewares,
      });
    }

    return {
      ...context,
      stageResults,
    };
  }
}

export { createStageLoggingMiddleware as createPipelineStageLoggingMiddleware };
export * from './types.js';
