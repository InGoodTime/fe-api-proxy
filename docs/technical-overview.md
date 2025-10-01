# api-doc-sync 技术文档

## 1. 项目背景与目标
- 多数团队需要维护 Swagger/OpenAPI、Postman、Apifox 等多源接口文档，格式差异导致客户端代码重复编写、同步成本高。
- 项目提供统一的 `ServiceDefinition` 抽象，自动识别文档来源并转换为可被运行时客户端和代码生成器消费的模型，降低文档到代码的落地成本。
- 目标包括：快速接入常见文档格式、提供带错误处理的 `fetch` 客户端、支持自定义解析器扩展、为类型生成和运行时校验打基础。

## 2. 技术栈
- **语言**：TypeScript（ESM-only，`tsc` 编译到 `dist/`）。
- **运行时**：Node.js ≥ 18（内置 `fetch`、`URL`、`fs/promises`）。
- **测试**：Vitest（`test/parse.spec.ts`, `test/client.spec.ts`）。
- **工具链**：`rimraf` 清理构建产物，`util.parseArgs` 解析 CLI 参数。
- **包结构**：`package.json` 采用 ESM `exports` 声明、提供 CLI `bin`。

## 3. 处理流程与核心功能实现
### 3.1 文档识别与调度（`src/index.ts`）
1. 默认加载 `SwaggerSource`、`PostmanSource`、`ApifoxSource` 三种解析器。
2. 根据 `parseServiceDefinition(raw, opts)` 中的 `prefer` 或自定义 `parsers` 调整解析优先级。
3. 逐个执行解析器的 `canParse` → `parse`，遇到异常跳过，全部失败则抛出不支持的格式。

### 3.2 数据模型归一化（`src/types.ts`, `src/normalizer.ts`）
- `ServiceDefinition` 统一描述服务信息、端点、请求/响应结构，保障运行时和生成器共享语义。
- `jsonSchemaToSchema` 将 OpenAPI/Swagger 的 JSON Schema 转换为内部 `Schema` 枚举，保留 `enum`、`oneOf`、`nullable` 等关键属性。
- `inferSchemaFromExample` 在文档缺少 schema 时从示例推断字段类型，保持最小可用信息量。

### 3.3 运行时客户端（`src/client.ts`, `src/runtime/utils.ts`, `src/errors.ts`）
- `createClient` 读取 `ServiceDefinition` 按端点生成 `byId` 调用、`call` 方法、`urlOf` 工具，默认拼接 `baseUrl` 并序列化路径及查询参数。
- `serializeQuery` 支持重复 key 或逗号风格的数组序列化；`applyPathParams` 负责安全替换路径占位符。
- 所有请求统一通过 `ApiError` 暴露 HTTP 状态、响应数据、上下文，允许调用方集中处理网络错误或非 2xx。
- 提供 `onRequest`、`onResponse` 钩子，可扩展日志、鉴权、缓存逻辑。

### 3.4 CLI 与代码生成（`src/cli.ts`, `src/codegen.ts`）
- CLI 命令：`api-doc-sync generate --input <json> [--output <file>] [--class <Name>]`。
- 读取文档 → 解析为 `ServiceDefinition` → `generateClientSource` 输出轻量 TypeScript 客户端类，默认生成 `GeneratedApiClient`。
- 支持将结果写入文件或直接打印到终端，便于集成到前端/SDK 仓库。

## 4. 已实现功能
- 自动检测并解析 Swagger/OpenAPI、Postman Collection、Apifox（含导出为 OpenAPI 的文件）。
- 统一的服务定义模型，覆盖路径、参数、请求体、响应及共享类型。
- 运行时 `fetch` 客户端：支持自定义 `fetch`、默认 header、查询序列化、钩子、错误归一化。
- CLI 生成 TypeScript 客户端包装类，降低项目落地成本。
- 基础测试覆盖解析准确性与请求流水的关键分支。

## 5. Roadmap
1. **文档来源扩展**：支持 YApi、Rap、Stoplight 等，开放解析器注册机制。
2. **代码生成增强**：输出类型定义、hook/SDK 模板、可配置模板系统。
3. **运行时能力**：可选的响应校验、重试/缓存策略、中间件管线。
4. **开发体验**：CLI 交互式向导、配置文件支持、错误提示本地化。
5. **质量保障**：增加真实文档回归用例、端到端测试、文档站点化展示。
