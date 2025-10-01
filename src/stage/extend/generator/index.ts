// 文件：src/stage/extend/generator/index.ts
// 作用：调用代码生成器生成客户端包的阶段

import type { IStage } from '../../index.js';
import type { DocSyncContext, GeneratorStageConfig, GeneratorStageResult } from '../../../pipeline/types.js';
import type { ServiceDefinition } from '../../../types.js';
import { defaultGenerator } from './generator.js';

/**
 * 代码生成阶段类
 * 负责调用代码生成器生成客户端代码
 */
export class GeneratorStage implements IStage<DocSyncContext, GeneratorStageConfig | undefined, GeneratorStageResult | undefined> {
  readonly name = 'generator';

  /**
   * 执行代码生成阶段
   * @param context 文档同步上下文
   * @param config 代码生成阶段配置
   * @returns 代码生成阶段结果
   */
  async execute(context: DocSyncContext, config?: GeneratorStageConfig): Promise<GeneratorStageResult | undefined> {
    // 如果配置跳过，则返回undefined
    if (config?.skip) {
      return undefined;
    }

    // 获取服务定义
    const service = (config?.service ?? (context.normalizedService as ServiceDefinition | undefined) ?? context.serviceDefinition) as ServiceDefinition | undefined;
    if (!service) {
      throw new Error('[GeneratorStage] Missing service definition for code generation.');
    }

    // 获取生成器并生成代码
    const generator = config?.generator ?? defaultGenerator;
    const bundle = await Promise.resolve(generator.generate(service, config?.options));

    context.generatedBundle = bundle;
    context.generatorName = generator.name;

    return {
      bundle,
      generatorName: generator.name,
    };
  }
}