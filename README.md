<div align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Version-0.1.1-blue.svg?style=for-the-badge" alt="Version">
</div>

<h1 align="center">🚀 fe-api-proxy</h1>

<p align="center">
  <b>下一代 TypeScript API 文档同步工具</b><br>
  自动将 Swagger、OpenAPI、Postman、Apifox 等 API 文档转换为类型安全的客户端代码
</p>

<div align="center">
  <a href="#✨-特性">特性</a> •
  <a href="#🚀-快速开始">快速开始</a> •
  <a href="#📖-使用指南">使用指南</a> •
  <a href="#🛠️-配置">配置</a> •
  <a href="#📦-发布">发布</a> •
  <a href="#🤝-贡献">贡献</a>
</div>

---

## ✨ 特性

### 🎯 多格式支持
- 📄 **Swagger/OpenAPI** - 完整支持 2.0 和 3.x 版本
- 📮 **Postman Collection** - 导入 Postman 集合
- 🦊 **Apifox** - 支持 Apifox 项目文档
- 🔧 **自定义 JSON** - 支持自定义文档格式

### 🛡️ 类型安全
- ✅ **完整 TypeScript 支持** - 编译时类型检查
- 🎨 **智能代码提示** - IDE 友好的类型定义
- 🔍 **自动类型推导** - 从 API 文档自动生成类型

### ⚡ 现代化架构
- 🏗️ **管道式处理** - 可扩展的处理流水线
- 🔌 **插件系统** - 支持自定义解析器和生成器
- 🎛️ **中间件支持** - 灵活的请求/响应处理

### 🚀 开发体验
- 📱 **CLI 工具** - 命令行快速生成客户端
- 🔄 **实时同步** - 支持文档变更的增量更新
- 📊 **详细日志** - 完整的处理过程追踪
- 🧪 **内置测试** - 自动生成的客户端测试

## 🚀 快速开始

### 📦 安装

```bash
# 使用 npm
npm install fe-api-proxy

# 使用 yarn
yarn add fe-api-proxy

# 使用 pnpm
pnpm add fe-api-proxy
```

### ⚡ 30秒快速体验

```typescript
import { DocSyncPipeline } from 'fe-api-proxy';

// 创建管道实例
const pipeline = new DocSyncPipeline();

// 同步 Petstore API 文档
const result = await pipeline.run({
  invoke: {
    sources: [{
      type: 'swagger',
      name: 'petstore',
      options: { url: 'https://petstore.swagger.io/v2/swagger.json' }
    }]
  },
  output: {
    outputDir: './generated-client'
  }
});

console.log(`✅ 生成了 ${result.generatedBundle?.files.length} 个文件`);
```

### 🎯 CLI 使用

```bash
# 从 Swagger 文档生成客户端
fe-api-proxy generate -i ./swagger.json -o ./client

# 指定文档类型
fe-api-proxy generate -i ./api.json -o ./client --prefer postman
```

## 📖 使用指南

### 🏗️ 项目架构

```
fe-api-proxy
├── 📄 文档解析     → 支持多种 API 文档格式
├── 🔄 数据规范化   → 转换为统一的数据模型
├── ⚙️ 代码生成     → 生成 TypeScript 客户端
└── 📁 文件输出     → 输出到指定目录
```

### 🎨 生成的客户端使用

```typescript
import { createClient, Pet, User } from './generated-client';

// 创建客户端实例
const client = createClient({
  baseUrl: 'https://api.example.com',
  defaultHeaders: {
    'Authorization': 'Bearer your-token'
  }
});

// 类型安全的 API 调用
try {
  // 方式1：使用端点 ID 调用
  const pets = await client.call('findPetsByStatus', {
    query: { status: 'available' }
  });

  // 方式2：使用生成的方法
  const pet = await client.byId.getPetById({ 
    path: { petId: 123 } 
  });

  // 方式3：使用具名函数
  const newPet: Pet = {
    name: 'Fluffy',
    photoUrls: ['https://example.com/photo.jpg']
  };
  const createdPet = await client.byId.addPet({ body: newPet });

} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API 错误: ${error.status} - ${error.message}`);
  }
}
```

### 🔧 高级配置

#### 自定义解析器

```typescript
import { DocSourceParser } from 'fe-api-proxy';

class CustomParser implements DocSourceParser {
  name = 'custom';
  
  canParse(raw: any): boolean {
    return raw && raw.customFormat === true;
  }
  
  parse(raw: any): ServiceDefinition {
    // 自定义解析逻辑
    return {
      title: raw.title,
      endpoints: raw.apis.map(api => ({
        id: api.id,
        path: api.url,
        method: api.method
      }))
    };
  }
}

// 使用自定义解析器
const result = await pipeline.run({
  invoke: {
    sources: [{ type: 'custom', document: customDoc }],
    parsers: [new CustomParser()]
  }
});
```

#### 中间件系统

```typescript
// 请求日志中间件
const loggingMiddleware = async (next, args) => {
  console.log(`🚀 开始执行阶段: ${args.stage.name}`);
  const start = Date.now();
  
  try {
    const result = await next(args);
    console.log(`✅ 阶段完成: ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`❌ 阶段失败: ${error.message}`);
    throw error;
  }
};

// 使用中间件
const pipeline = new DocSyncPipeline(
  undefined, // 默认配置
  [loggingMiddleware] // 中间件列表
);
```

## 🛠️ 配置

### 📋 完整配置选项

```typescript
interface DocSyncPipelineRunOptions {
  // 📄 文档调用配置
  invoke?: {
    sources: Array<{
      type: 'swagger' | 'postman' | 'apifox' | 'custom';
      name: string;
      options?: { url?: string };
      document?: any;
      metadata?: { primary?: boolean };
    }>;
    parsers?: DocSourceParser[];
  };
  
  // 🔄 规范化配置
  normalizer?: {
    transforms?: Array<(service: ServiceDefinition) => ServiceDefinition>;
    extensions?: NormalizerExtension[];
  };
  
  // ⚙️ 代码生成配置
  generator?: {
    options?: {
      entryFileName?: string;
      fileExtension?: 'ts' | 'js';
    };
  };
  
  // 📁 输出配置
  output?: {
    outputDir: string;
    mapFilePath?: (file: GeneratedFile) => string;
    extraFiles?: Array<{ path: string; content: string }>;
  };
  
  // 🎛️ 运行时配置
  stageMiddlewares?: StageMiddleware[];
  stageLogger?: StageLogger | false;
}
```

### 🌐 客户端配置

```typescript
interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  queryArrayFormat?: 'repeat' | 'comma';
  onRequest?: (ctx: RequestContext) => void | Promise<void>;
  onResponse?: (ctx: ResponseContext) => void | Promise<void>;
}
```

## 📋 支持的文档格式

| 格式 | 版本 | 导入方式 | 特性支持 |
|------|------|----------|----------|
| 🟢 **Swagger** | 2.0 | URL/文件 | ✅ 完整支持 |
| 🟢 **OpenAPI** | 3.x | URL/文件 | ✅ 完整支持 |
| 🟡 **Postman** | v2.1 | 文件 | ⚠️ 部分支持 |
| 🟡 **Apifox** | - | 文件 | ⚠️ 部分支持 |
| 🔵 **自定义** | - | 对象 | 🔧 可扩展 |

## 🔨 开发

### 📥 克隆项目

```bash
git clone <repository-url>
cd fe-api-service
```

### 🔧 安装依赖

```bash
npm install
```

### 🏃 运行示例

```bash
# 运行 Petstore 示例
npm run refresh

# 构建项目
npm run build

# 运行测试
npm test
```

### 📂 项目结构

```
src/
├── 📁 common/          # 公共工具和客户端
├── 📁 pipeline/        # 管道系统核心
├── 📁 stage/          # 处理阶段实现
│   └── 📁 extend/     # 扩展功能
│       ├── 📁 parser/     # 文档解析器
│       ├── 📁 normalizer/ # 数据规范化
│       ├── 📁 generator/  # 代码生成器
│       └── 📁 output/     # 文件输出
├── 🧪 test/           # 测试文件
└── 📄 types.ts        # 核心类型定义
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- test/swagger-parser.spec.ts

# 生成测试覆盖率报告
npm run test:coverage
```

## 📦 发布

### 🚀 发布到 NPM

项目提供了便捷的发布脚本，支持发布到不同的 NPM 注册表。

#### 📋 发布前检查

```bash
# 1. 确保所有测试通过
npm test

# 2. 构建项目
npm run build

# 3. 检查构建产物
ls -la dist/

# 4. 检查包内容
npm pack --dry-run
```

#### 🔧 配置发布注册表

**方式1：使用环境变量**

```bash
# 设置发布注册表
export PUBLISH_REGISTRY="https://registry.npmjs.org/"
# 或者
export NPM_REGISTRY="https://registry.npmjs.org/"

# 发布到指定注册表
npm run publish
```

**方式2：内网私有注册表**

```bash
# 发布到公司内网注册表
export PUBLISH_REGISTRY="https://npm.company.com/"
npm run publish

# 发布到 cnpm
export PUBLISH_REGISTRY="https://registry.npmmirror.com/"
npm run publish
```

#### 📝 发布流程

```bash
# 1. 更新版本号（根据语义化版本规范）
npm version patch   # 修复版本 0.1.1 -> 0.1.2
npm version minor   # 次要版本 0.1.1 -> 0.2.0
npm version major   # 主要版本 0.1.1 -> 1.0.0

# 2. 设置发布注册表
export PUBLISH_REGISTRY="https://registry.npmjs.org/"

# 3. 执行发布
npm run publish

# 4. 推送标签到 Git
git push origin --tags
```

#### 🏷️ Beta 版本发布

```bash
# 发布 beta 版本
npm version prerelease --preid=beta  # 0.1.1 -> 0.1.2-beta.0
npm run publish -- --tag beta

# 发布 alpha 版本
npm version prerelease --preid=alpha # 0.1.1 -> 0.1.2-alpha.0
npm run publish -- --tag alpha
```

#### 🔍 发布验证

```bash
# 检查发布状态
npm view fe-api-proxy versions --json

# 验证最新版本
npm view fe-api-proxy version

# 下载并测试发布的包
npx fe-api-proxy@latest generate --help
```

#### ⚠️ 发布注意事项

- **🔒 权限要求**：确保你有发布到目标注册表的权限
- **📋 文件检查**：只有 `files` 字段中指定的文件会被包含在发布包中
- **🏗️ 自动构建**：`prepublishOnly` 脚本会在发布前自动执行构建
- **🔖 版本管理**：遵循[语义化版本](https://semver.org/lang/zh-CN/)规范
- **🏷️ 标签管理**：使用 `--tag` 参数管理不同的发布渠道

#### 🚨 发布故障排除

```bash
# 问题1：注册表环境变量未设置
# 错误：Missing required PUBLISH_REGISTRY or NPM_REGISTRY environment variable
# 解决：设置环境变量
export PUBLISH_REGISTRY="https://registry.npmjs.org/"

# 问题2：权限不足
# 错误：403 Forbidden
# 解决：登录到目标注册表
npm login --registry=https://registry.npmjs.org/

# 问题3：版本已存在
# 错误：Cannot publish over the previously published versions
# 解决：更新版本号
npm version patch

# 问题4：包名冲突
# 错误：Package name too similar to existing package
# 解决：修改 package.json 中的 name 字段
```

## 📚 相关资源

- 📖 [Swagger/OpenAPI 规范](https://swagger.io/specification/)
- 📮 [Postman Collection 格式](https://learning.postman.com/docs/getting-started/creating-your-first-collection/)
- 🦊 [Apifox 文档](https://www.apifox.cn/)
- 🔷 [TypeScript 官方文档](https://www.typescriptlang.org/)

## 🤝 贡献

我们欢迎所有形式的贡献！请查看 [贡献指南](CONTRIBUTING.md) 了解如何参与项目。

### 🐛 报告问题

在 [Issues](https://github.com/your-repo/issues) 页面报告 bug 或提出功能请求。

### 💡 功能请求

有新想法？在 [Discussions](https://github.com/your-repo/discussions) 分享你的建议！

## 📄 许可证

本项目基于 [MIT](LICENSE) 许可证开源。

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！

---

<div align="center">
  <sub>用 ❤️ 构建，为了更好的 API 开发体验</sub>
</div>