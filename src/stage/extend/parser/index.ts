
import type { IStage } from '../../index.js';
import type { DocSyncContext, ParserStageConfig, ParserStageResult } from '../../../pipeline/types.js';
import type { DocSourceParser } from './parser.js';
import { SwaggerSource } from './swagger.js';
import { PostmanSource } from './postman.js';
import { ApifoxSource } from './apifox.js';

/**
 * 默认解析器列表
 */
const DEFAULT_PARSERS: DocSourceParser[] = [SwaggerSource, PostmanSource, ApifoxSource];

/**
 * 对解析器进行排序
 * @param parsers 解析器列表
 * @param prefer 偏好的解析器名称
 * @returns 排序后的解析器列表
 */
function orderParsers(parsers: DocSourceParser[], prefer?: string) {
  if (!prefer) return parsers;
  const lowered = prefer.toLowerCase();
  return [...parsers].sort((a, b) => {
    if (a.name === lowered) return -1;
    if (b.name === lowered) return 1;
    return 0;
  });
}

/**
 * 解析阶段类
 * 负责将原始文档解析为服务定义
 */
export class ParserStage implements IStage<DocSyncContext, ParserStageConfig | undefined, ParserStageResult | undefined> {
  readonly name = 'parser';

  /**
   * 执行解析阶段
   * @param context 文档同步上下文
   * @param config 解析阶段配置
   * @returns 解析阶段结果
   */
  async execute(context: DocSyncContext, config?: ParserStageConfig): Promise<ParserStageResult | undefined> {
    // 如果没有配置且上下文中已有服务定义，则直接返回
    if (!config && context.serviceDefinition) {
      return {
        rawDocument: context.rawDocument ?? null,
        serviceDefinition: context.serviceDefinition,
        parserName: (context.parserName as string | undefined) ?? 'unknown',
      };
    }

    // 如果配置跳过，则返回undefined
    if (config?.skip) {
      return undefined;
    }

    // 如果提供了服务定义，则直接使用
    if (config?.service) {
      context.serviceDefinition = config.service;
      if (config.source !== undefined) {
        context.rawDocument = config.source;
      }
      context.parserName = 'provided';
      return {
        rawDocument: context.rawDocument ?? null,
        serviceDefinition: config.service,
        parserName: 'provided',
      };
    }

    // 获取原始文档
    const rawDocument = config?.source ?? context.rawDocument;
    if (rawDocument === undefined) {
      throw new Error('[ParserStage] Missing source document for parsing.');
    }
    context.rawDocument = rawDocument;

    // 获取解析器列表
    const parsers = (config?.parsers && config.parsers.length ? config.parsers : DEFAULT_PARSERS).slice();
    const ordered = orderParsers(parsers, config?.prefer);

    // 尝试使用每个解析器解析文档
    for (const parser of ordered) {
      try {
        if (!parser.canParse(rawDocument)) {
          continue;
        }
        const service = parser.parseWithContext
          ? await Promise.resolve(parser.parseWithContext(rawDocument, config?.context ?? {}))
          : await Promise.resolve(parser.parse(rawDocument));
        context.serviceDefinition = service;
        context.parserName = parser.name;
        return {
          rawDocument,
          serviceDefinition: service,
          parserName: parser.name,
        };
      } catch {
        // 忽略失败并尝试下一个解析器
      }
    }

    const hint = config?.prefer ? ' (prefer=' + config.prefer + ')' : '';
    throw new Error('[ParserStage] Unable to parse document with provided parsers' + hint + '.');
  }
}