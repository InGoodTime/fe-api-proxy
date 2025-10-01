/**
 * 文件：src/stage/extend/parser/parser.ts
 * 作用：定义文档源解析器的接口及支持工具
 * 
 * 核心功能设计：
 * 1. 定义所有文档解析器的标准接口
 * 2. 提供统一的文档识别和解析流程
 * 3. 支持上下文解析和工厂模式
 * 4. 为不同类型的API文档提供扩展能力
 * 
 * 数据流转：
 * 原始文档 → 文档识别 → 解析器选择 → 标准化解析 → ServiceDefinition
 */

import type { ServiceDefinition } from '../../../types.js';

/**
 * 文档源解析器需要实现的契约接口
 * 
 * 接口设计：
 * 1. 解析器用于检测是否能处理某个载荷并将其转换为标准化的ServiceDefinition
 * 2. 支持多种文档格式：Swagger/OpenAPI、Postman、Apifox等
 * 3. 提供灵活的解析策略和上下文支持
 * 
 * 实现要求：
 * - 必须实现name、canParse和parse方法
 * - parseWithContext为可选，用于高级场景
 */
export interface DocSourceParser {
  /**
   * 解析器的唯一标识符
   * 
   * 命名约定：
   * - 使用小写字母和连字符
   * - 常见标识："swagger"、"postman"、"apifox"、"openapi"
   * - 用于日志记录和统计分析
   */
  name: string;

  /**
   * 检查解析器是否能理解给定的载荷
   * 
   * 识别策略：
   * 1. 检查关键字段的存在（如swagger、openapi、info等）
   * 2. 验证数据结构和格式的正确性
   * 3. 支持模糊匹配和启发式检测
   * 
   * @param raw 任意文档载荷，通常为JSON对象
   * @returns 如果解析器能处理输入则返回true，否则返回false
   */
  canParse(raw: any): boolean;

  /**
   * 将载荷转换为ServiceDefinition
   * 
   * 解析流程：
   * 1. 验证文档的完整性和正确性
   * 2. 提取服务信息（标题、版本、描述等）
   * 3. 解析接口定义和参数结构
   * 4. 转换为统一的ServiceDefinition模型
   * 
   * @param raw 文档载荷，必须是解析器可处理的格式
   * @returns 标准化的服务定义对象
   * @throws 当无法解析载荷时抛出错误
   */
  parse(raw: any): ServiceDefinition;

  /**
   * 可选的变体方法，在解析时接收上下文信息
   * 
   * 上下文支持：
   * 1. 处理相对链接和引用解析
   * 2. 支持多文档合并和关联
   * 3. 提供特定的解析选项和配置
   * 
   * @param raw 文档载荷
   * @param context 额外的解析器特定选项，包括基础URL等
   * @returns 标准化的服务定义对象
   */
  parseWithContext?(raw: any, context: ParseContext): ServiceDefinition;
}

/**
 * 用于按需生成文档解析器的工厂抽象
 * 
 * 工厂模式特性：
 * 1. 支持动态配置和定制化解析器
 * 2. 为不同环境和需求提供适配的解析器
 * 3. 支持解析器的懒加载和资源优化
 * 
 * 适用场景：插件系统、多配置环境、性能优化
 */
export interface DocSourceParserFactory {
  /**
   * 使用可选配置创建解析器实例
   * 
   * 创建特性：
   * 1. 支持动态参数配置和定制化
   * 2. 可以调整解析器的行为和特性
   * 3. 保证返回的解析器符合DocSourceParser接口
   * 
   * @param options 可选的配置参数，具体内容取决于具体的解析器实现
   * @returns 配置好的解析器实例
   */
  createParser(options?: Record<string, any>): DocSourceParser;
}

/**
 * 支持上下文解析时传递的共享上下文
 * 
 * 上下文用途：
 * 1. 提供解析相对链接时的基础URL
 * 2. 传递解析器特定的配置和选项
 * 3. 支持复杂解析场景和跨文档引用
 * 
 * 适用场景：
 * - OpenAPI的$ref引用解析
 * - Postman的环境变量处理
 * - Apifox的项目配置合并
 */
export interface ParseContext {
  /** 解析相对链接时应假定的基础URL，用于处理$ref引用等 */
  baseUrl?: string;

  /** 额外的解析器特定选项，内容由具体解析器定义 */
  options?: Record<string, any>;
}