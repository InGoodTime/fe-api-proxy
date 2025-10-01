import type { ServiceDefinition } from '../../../types.js';
import { fetchApiDocumentation } from './utils/fetch.js';
import type { InvokeSourceAdapter, InvokeSourceConfig, InvokeSourceType } from './contracts.js';

/**
 * 抽象基类，为各种API文档源提供统一的调用接口
 * 
 * 设计思路：
 * 1. 提供统一的接口规范，所有具体的文档源实现都需要继承此类
 * 2. 实现通用的fetch逻辑，处理从URL获取文档或使用已提供的文档
 * 3. 定义抽象方法parse，由子类实现具体的文档解析逻辑
 * 4. 通过泛型支持不同源的特定选项配置
 */
export abstract class BaseInvokeSource<Options = Record<string, unknown>>
  implements InvokeSourceAdapter<Options>
{
  /**
   * 源类型标识符，由子类实现具体类型
   */
  abstract readonly type: InvokeSourceType;

  /**
   * 判断当前适配器是否能处理指定的源配置
   * @param source 源配置对象
   * @returns 如果能处理返回true，否则返回false
   */
  canHandle(source: InvokeSourceConfig<unknown>): source is InvokeSourceConfig<Options> {
    return source.type === this.type;
  }

  /**
   * 获取API文档数据
   * 优先使用source中已提供的document，否则通过HTTP请求获取
   * @param source 源配置对象
   * @returns Promise<unknown> 解析后的文档数据
   */
  async fetch(source: InvokeSourceConfig<Options>): Promise<unknown> {
    if (source.document !== undefined) {
      return source.document;
    }
    if (!source.request) {
      throw new Error('Missing request for source type ' + this.type + '.');
    }
    return fetchApiDocumentation(source.request);
  }

  /**
   * 抽象方法，由子类实现具体的文档解析逻辑
   * @param payload 原始文档数据
   * @param source 源配置对象
   * @returns 解析后的服务定义对象或Promise
   */
  abstract parse(
    payload: unknown,
    source: InvokeSourceConfig<Options>
  ): Promise<ServiceDefinition> | ServiceDefinition;
}