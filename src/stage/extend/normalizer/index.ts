// 文件：src/stage/extend/normalizer-stage.ts
// 作用：在代码生成之前对服务定义进行归一化处理

import type { IStage } from '../../index.js';
import type {
  DocSyncContext,
  NormalizerStageConfig,
  NormalizerStageResult,
} from '../../../pipeline/types.js';
import type { ServiceDefinition, Schema } from '../../../types.js';

/**
 * 克隆服务定义
 * @param service 服务定义
 * @returns 克隆后的服务定义
 */
function cloneService(service: ServiceDefinition): ServiceDefinition {
  try {
    const cloner = (globalThis as any).structuredClone as ((value: unknown) => unknown) | undefined;
    if (typeof cloner === 'function') {
      return cloner(service) as ServiceDefinition;
    }
  } catch {
    // 当structuredClone不可用时，回退到JSON深克隆
  }
  return JSON.parse(JSON.stringify(service)) as ServiceDefinition;
}

/**
 * 确保值为数组
 * @param value 值
 * @returns 数组
 */
function ensureArray<T>(value?: ReadonlyArray<T>): T[] {
  return value ? Array.from(value) : [];
}

/**
 * 归一化阶段类
 * 负责对服务定义进行归一化处理
 */
export class NormalizerStage
  implements IStage<DocSyncContext, NormalizerStageConfig | undefined, NormalizerStageResult | undefined>
{
  readonly name = 'normalizer';

  /**
   * 执行归一化阶段
   * @param context 文档同步上下文
   * @param config 归一化阶段配置
   * @returns 归一化阶段结果
   */
  async execute(context: DocSyncContext, config?: NormalizerStageConfig): Promise<NormalizerStageResult | undefined> {
    // 如果配置跳过，则返回undefined
    if (config?.skip) {
      return undefined;
    }

    // 获取基础服务定义
    const baseService = config?.service ?? (context.normalizedService as ServiceDefinition | undefined) ?? context.serviceDefinition;
    if (!baseService) {
      return undefined;
    }

    let working = cloneService(baseService);
    const appliedTransforms: string[] = [];

    // 应用转换函数
    const transforms = ensureArray(config?.transforms);
    for (let idx = 0; idx < transforms.length; idx += 1) {
      const transform = transforms[idx];
      const maybe = await Promise.resolve(transform(working));
      const tag = transform.name || `transform#${idx + 1}`;
      appliedTransforms.push(tag);
      if (maybe && maybe !== working) {
        working = maybe;
      }
    }

    let normalizedTypes: Record<string, Schema> | undefined;
    const appliedExtensions = new Set<string>();

    // 应用扩展
    const extensions = ensureArray(config?.extensions);
    const inputs = ensureArray(config?.inputs);
    if (extensions.length && inputs.length) {
      const collected: Record<string, Schema> = { ...(working.types ?? {}) };
      let changed = false;

      for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
        const input = inputs[inputIndex];
        for (let extIndex = 0; extIndex < extensions.length; extIndex += 1) {
          const extension = extensions[extIndex];
          const schema = extension.normalize(input.payload);
          if (schema) {
            const key = input.key ?? `${extension.name}-${inputIndex}-${extIndex}`;
            collected[key] = schema;
            appliedExtensions.add(extension.name);
            changed = true;
          }
        }
      }

      if (changed) {
        normalizedTypes = collected;
        working = { ...working, types: collected };
      }
    }

    context.normalizedService = working;
    context.serviceDefinition = working;

    const result: NormalizerStageResult = {
      serviceDefinition: working,
    };
    if (normalizedTypes) {
      result.normalizedTypes = normalizedTypes;
    }
    if (appliedTransforms.length) {
      result.appliedTransforms = appliedTransforms;
    }
    if (appliedExtensions.size) {
      result.appliedExtensions = Array.from(appliedExtensions);
    }

    return result;
  }
}