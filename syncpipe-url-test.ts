/**
 * Petstore Swagger API 文档同步管道测试文件
 * 该测试验证了从URL获取完整的Swagger文档并生成客户端代码的功能
 * 
 * @file syncpipe-url-test.ts
 * @author 测试开发团队
 */

// 导入Node.js内置的测试模块，用于编写和运行测试用例
import test from 'node:test';
// 导入Node.js内置的严格断言模块，用于测试断言判断
import assert from 'node:assert/strict';

// 导入文档同步管道核心类，用于创建和运行文档同步流程
import { DocSyncPipeline } from './src/pipeline/index.js';
// 导入管道运行选项和结果相关的类型定义
import type {
  DocSyncPipelineRunOptions,
  DocSyncPipelineResult,
  InvokeStageResult,
} from './src/pipeline/types.js';

// 定义Petstore Swagger文档的URL地址，用于测试从远程获取Swagger文档的功能
const PETSTORE_SWAGGER_URL = 'https://petstore.swagger.io/v2/swagger.json';

// 定义期望从Petstore Swagger文档中解析出的端点ID列表
// 这些是Petstore API中定义的主要端点
const expectedEndpointIds = [
  'uploadFile',              // 上传文件接口
  'addPet',                  // 添加宠物接口
  'updatePet',               // 更新宠物接口
  'findPetsByStatus',        // 根据状态查找宠物接口
  'findPetsByTags',          // 根据标签查找宠物接口
  'getPetById',              // 根据ID获取宠物接口
  'updatePetWithForm',       // 使用表单更新宠物接口
  'deletePet',               // 删除宠物接口
  'getInventory',            // 获取库存信息接口
  'placeOrder',              // 下订单接口
  'getOrderById',            // 根据ID获取订单接口
  'deleteOrder',             // 删除订单接口
  'createUsersWithListInput', // 使用列表输入创建用户接口
  'getUserByName',           // 根据用户名获取用户接口
  'updateUser',              // 更新用户接口
  'deleteUser',              // 删除用户接口
  'loginUser',               // 用户登录接口
  'logoutUser',              // 用户登出接口
  'createUsersWithArrayInput', // 使用数组输入创建用户接口
  'createUser',              // 创建用户接口
] as const;

/**
 * 创建管道运行选项的函数
 * 配置从URL获取Swagger文档并生成客户端代码的参数
 * 
 * @returns DocSyncPipelineRunOptions 管道运行选项配置对象
 * @remarks 该函数返回一个配置对象，用于指导文档同步管道如何运行
 */
function createPipelineOptions(): DocSyncPipelineRunOptions {
  return {
    // invoke阶段配置 - 定义如何获取和解析API文档
    invoke: {
      // 定义数据源列表，可以包含多个API文档源
      sources: [
        {
          // 指定源类型为swagger，表示这是一个Swagger格式的API文档
          type: 'swagger',
          // 源名称，用于标识这个文档源
          name: 'petstore',
          // swagger源的配置选项，指定从URL获取文档
          options: { url: PETSTORE_SWAGGER_URL },
          // 元数据，标记为主要源，表示这是主要的API文档源
          metadata: { primary: true },
        },
      ],
    },
    // 输出阶段配置 - 定义如何处理生成的客户端代码
    output: {
      // 指定输出目录，生成的客户端代码将保存到此目录
      outputDir: "./client-url-swagger",
    },
    // 是否启用阶段日志，设置为false表示不记录详细处理日志
    stageLogger: false,
  };
}

/**
 * 测试用例：验证DocSyncPipeline能够从URL获取实时的Petstore Swagger文档并为每个操作生成客户端
 * 该测试主要验证以下功能：
 * 1. 从指定URL获取Swagger文档
 * 2. 正确解析Swagger文档中的各个API端点
 * 3. 为每个API端点生成对应的客户端代码文件
 * 
 * @remarks 这是一个异步测试用例，会实际访问网络获取Swagger文档
 */
test('DocSyncPipeline fetches live Petstore Swagger and generates per-operation clients', async () => {
  // 创建文档同步管道实例，使用默认配置
  // 参数：undefined(默认httpClient), undefined(默认options), false(不启用详细日志)
  const pipeline = new DocSyncPipeline(undefined, undefined, false);
  // 获取管道运行选项配置
  const options = createPipelineOptions();

  // 记录fetch调用的数组，用于验证管道是否正确发起了网络请求
  // 每个记录包含URL、HTTP方法和响应状态码
  const fetchCalls: Array<{ url: string; method: string; status?: number }> = [];
  // 保存原始的全局fetch函数，以便测试结束后恢复
  const originalFetch = globalThis.fetch;

  // 重写全局fetch函数，用于拦截和记录网络请求
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // 解析请求URL，支持多种输入类型
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);
    
    // 获取请求方法，默认为GET
    const method =
      init?.method ??
      (input instanceof Request ? input.method : 'GET');

    // 调用原始fetch函数发起实际的网络请求
    const response = await originalFetch(input as RequestInfo, init);
    // 记录本次fetch调用的URL、方法和响应状态码
    fetchCalls.push({ url: requestUrl, method, status: response.status });
    // 返回实际的响应结果
    return response;
  }) as typeof fetch;

  // 存储管道运行结果
  let result: DocSyncPipelineResult | undefined;
  try {
    // 运行管道并获取结果，这是一个异步操作
    result = await pipeline.run(options);
  } finally {
    // 测试结束后恢复原始的fetch函数，确保不会影响其他测试
    globalThis.fetch = originalFetch;
  }

  // 验证管道至少发起了一次fetch请求
  assert.ok(fetchCalls.length, 'pipeline should perform at least one fetch call');
  // 验证第一次fetch请求的URL是预期的Petstore Swagger文档URL
  assert.strictEqual(
    fetchCalls[0]?.url,
    PETSTORE_SWAGGER_URL,
    'pipeline should fetch the Swagger document from the expected URL',
  );
  // 验证第一次fetch请求使用的是GET方法
  assert.strictEqual(
    fetchCalls[0]?.method ?? 'GET',
    'GET',
    'pipeline should use GET to retrieve the Swagger document',
  );
  // 验证第一次fetch请求返回了200状态码（成功）
  assert.strictEqual(
    fetchCalls[0]?.status,
    200,
    'expected the Swagger fetch to return 200 OK',
  );

  // 验证管道生成了服务定义
  assert.ok(result?.serviceDefinition, 'pipeline should produce a service definition');
  // 获取服务定义和端点列表
  // 使用非空断言操作符(!)因为我们已经在上面验证了它的存在
  const serviceDefinition = result!.serviceDefinition!;
  const endpoints = serviceDefinition.endpoints;

  // 验证解析出的端点数量至少与期望的数量一致
  assert.ok(
    endpoints.length >= expectedEndpointIds.length,
    `expected at least ${expectedEndpointIds.length} endpoints from the Petstore Swagger`,
  );

  // 创建解析出的端点ID集合，用于快速查找
  const endpointIds = new Set(endpoints.map(endpoint => endpoint.id));
  // 验证每个期望的端点ID都存在
  for (const id of expectedEndpointIds) {
    assert.ok(endpointIds.has(id), `expected endpoint ${id} to be present`);
  }

  // 获取invoke阶段的结果并进行类型转换
  const invokeResult = result?.stageResults.invoke as InvokeStageResult | undefined;
  // 验证invoke阶段结果存在
  assert.ok(invokeResult, 'invoke stage result should be available');
  // 验证只处理了一个Swagger文档
  assert.strictEqual(
    invokeResult.documents.length,
    1,
    'exactly one Swagger document should be processed',
  );
  // 验证使用的适配器是swagger
  assert.strictEqual(
    invokeResult.documents[0]?.adapter,
    'swagger',
    'swagger adapter should be used for the fetched document',
  );

  // 获取生成的代码包
  const bundle = result?.generatedBundle;
  // 验证代码生成阶段产生了代码包
  assert.ok(bundle, 'generator stage should produce a bundle');
  
  // 定义非端点文件的文件名集合（这些文件是支持性文件，不是针对特定端点的）
  const nonSupportFiles = new Set(['types.ts', 'transport.ts', bundle!.entrypoint]);
  // 过滤出端点相关的文件
  const endpointFiles = bundle!.files.filter(file => !nonSupportFiles.has(file.filename));
  // 验证端点文件数量不少于期望的端点数量
  assert.ok(
    endpointFiles.length >= expectedEndpointIds.length,
    'bundle should contain one generated source per endpoint',
  );

  // 验证每个端点都有对应的生成代码
  for (const endpoint of endpoints) {
    // 构造每个端点代码中应该包含的签名字符串
    const signature = `Auto-generated for ${endpoint.method} ${endpoint.path}`;
    // 验证代码包中至少有一个文件包含该签名
    assert.ok(
      bundle!.files.some(file => file.content.includes(signature)),
      `expected generated bundle to include source for ${endpoint.method} ${endpoint.path}`,
    );
  }
});