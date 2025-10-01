// 文件：src/stage/index.ts
// 作用：定义阶段契约并重新导出具体的管道阶��?

/**
 * 阶段接口
 * 
 * 接口特性：
 * 1. 所有管道阶段都需要实现此接口
 * 2. 支持泛型参数，保证类型安全
 * 3. 提供统一的执行模式和约定
 * 
 * 类型参数：
 * - TContext: 上下文类型，在阶段间传递数据
 * - TParams: 参数类型，控制阶段行为
 * - TResult: 结果类型，阶段执行输出
 */
export interface IStage<
  TContext extends Record<string, unknown>,
  TParams = unknown,
  TResult = unknown,
> {
  /** 阶段标识符，用于记录管道结果 */
  readonly name: string;

  /**
   * 执行阶段并传入当前管道上下文
   * 
   * 执行要求：
   * 1. 可以修改传入的上下文对象
   * 2. 支持同步和异步执行模式
   * 3. 必须返回符合TResult类型的结果
   * 
   * @param context 共享上下文对象，可由阶段进行修改
   * @param params 阶段特定配置，控制阶段行为
   * @returns 执行结果，可为同步或异步
   */
  execute(context: TContext, params: TParams): Promise<TResult> | TResult;
}

// 导出各个具体阶段的实现，为管道系统提供完整的阶段集合
export { InvokeStage, createInvokeStage } from './extend/invoke/index.js';       // 调用阶段：获取和解析API文档
export { NormalizerStage } from './extend/normalizer/index.js';                // 规范化阶段：标准化服务定义
export { GeneratorStage } from './extend/generator/index.js';                  // 生成阶段：生成客户端代码
export { OutputStage } from './extend/output/index.js';                      // 输出阶段：写入文件系统