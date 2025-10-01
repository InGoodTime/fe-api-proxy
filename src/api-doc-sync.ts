// 文件：src/api-doc-sync.ts
// 作用：提供公共入口点，连接文档解析、管道执行和运行时助手

export * from './types.js';
export * from './errors.js';
export * from './common/http-client.js';
export * from './common/tools.js';
export * from './stage/extend/parser/parser.js';
export * from './pipeline/index.js';
export * from './stage/index.js';

export * as normalizer from './stage/extend/normalizer/convert.js';
export * as generator from './stage/extend/generator/generator.js';
export * as writer from './stage/extend/output/writer.js';

import type { ServiceDefinition } from './types.js';
import type { DocSourceParser } from './stage/extend/parser/parser.js';
import { SwaggerSource } from './stage/extend/parser/swagger.js';
import { PostmanSource } from './stage/extend/parser/postman.js';
import { ApifoxSource } from './stage/extend/parser/apifox.js';

export { CustomSource } from './stage/extend/parser/custom.js';

/**
 * 默认文档解析器列表，包括Swagger、Postman和Apifox解析器
 */
const defaultParsers = [SwaggerSource, PostmanSource, ApifoxSource];

/**
 * 解析服务定义文档，将其转换为统一的ServiceDefinition格式
 * @param raw 原始文档对象
 * @param opts 解析选项，可指定偏好解析器和自定义解析器列表
 * @returns 统一的服务定义对象
 * @throws 当无法识别文档格式时抛出错误
 */
export function parseServiceDefinition(
  raw: any,
  opts?: { prefer?: 'swagger' | 'postman' | 'apifox'; parsers?: DocSourceParser[] }
): ServiceDefinition {
  const parsers = opts?.parsers || defaultParsers;
  const prefer = opts?.prefer;
  // 根据偏好设置对解析器进行排序
  const ordered = prefer ? [...parsers].sort((a, b) => (a.name === prefer ? -1 : b.name === prefer ? 1 : 0)) : parsers;
  for (const parser of ordered) {
    try {
      // 检查解析器是否能处理该文档
      if (parser.canParse(raw)) {
        // 如果解析器支持上下文解析，则使用上下文解析方法
        if ('parseWithContext' in parser && typeof parser.parseWithContext === 'function') {
          return parser.parseWithContext(raw, {});
        }
        // 使用普通解析方法
        return parser.parse(raw);
      }
    } catch {
      // 忽略错误并尝试下一个解析器
    }
  }
  throw new Error('Unsupported document format: cannot detect Swagger/OpenAPI, Postman, or Apifox');
}