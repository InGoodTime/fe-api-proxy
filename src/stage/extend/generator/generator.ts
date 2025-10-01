/**
 * 文件：src/stage/extend/generator/generator.ts
 * 作用：为服务定义生成TypeScript客户端代码
 * 
 * 核心功能设计：
 * 1. 将ServiceDefinition转换为可执行的TypeScript代码
 * 2. 生成类型定义、客户端接口和调用函数
 * 3. 支持多文件组织和模块化输出
 * 4. 提供完整的错误处理和类型安全
 * 
 * 数据流转：
 * ServiceDefinition → 类型生成 → 接口生成 → 文件组织 → GeneratedBundle
 */

import { posix as path } from 'node:path';

import type {
  ServiceDefinition,
  EndpointDefinition,
  ParameterDefinition,
  Schema,
} from '../../../types.js';

/**
 * 代码生成选项接口
 */
export interface CodegenOptions {
  /** 入口文件名 */
  entryFileName?: string;
  /** 文件扩展名 */
  fileExtension?: 'ts' | 'js';
}

/**
 * 生成的文件接口
 */
export interface GeneratedFile {
  /** 文件名 */
  filename: string;
  /** 文件内容 */
  content: string;
}

/**
 * 生成的文件包接口
 */
export interface GeneratedBundle {
  /** 入口点文件名 */
  entrypoint: string;
  /** 文件列表 */
  files: GeneratedFile[];
}

/**
 * 将ID转换为安全的标识符
 * @param id 原始ID
 * @returns 安全的标识符
 */
export function safeId(id: string) {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^\d/.test(cleaned) ? '_' + cleaned : cleaned;
}

/**
 * 将字符串转换为PascalCase格式
 * @param value 原始字符串
 * @returns PascalCase格式的字符串
 */
function toPascalCase(value: string) {
  return safeId(value)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * 将字符串转换为kebab-case格式
 * @param value 原始字符串
 * @returns kebab-case格式的字符串
 */
function toKebabCase(value: string) {
  const pascal = toPascalCase(value);
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function normalizePathSegment(segment: string, index: number): string {
  const unwrapped = segment
    .replace(/^\{+/, '')
    .replace(/\}+$/, '')
    .replace(/^:+/, '')
    .trim();
  if (!unwrapped) {
    return `part-${index + 1}`;
  }

  const cleaned = unwrapped
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  const kebab = cleaned ? toKebabCase(cleaned) : '';
  return kebab || `part-${index + 1}`;
}

function extractPathSegments(pathValue: string, fallbackBase: string, fallbackIndex: number): string[] {
  const rawSegments = pathValue.split('/').map(segment => segment.trim()).filter(Boolean);
  const normalized = rawSegments.map((segment, idx) => normalizePathSegment(segment, idx));

  if (normalized.length) {
    return normalized;
  }

  const fallback = toKebabCase(fallbackBase) || `endpoint-${fallbackIndex + 1}`;
  return [fallback];
}

function computeRelativeModulePath(fromFilename: string, targetFilename: string): string {
  const fromDir = path.dirname(fromFilename);
  const targetWithoutExt = targetFilename.replace(/\.ts$/, '');
  const origin = fromDir === '.' ? '.' : fromDir;
  let relative = path.relative(origin, targetWithoutExt);

  if (!relative) {
    const basename = path.basename(targetWithoutExt);
    return `./${basename}`;
  }

  if (!relative.startsWith('.')) {
    relative = `./${relative}`;
  }

  return relative;
}

/**
 * 缩进代码块
 * @param text 原始文本
 * @param level 缩进级别
 * @returns 缩进后的文本
 */
function indentBlock(text: string, level: number) {
  const pad = '  '.repeat(level);
  return text
    .split('\n')
    .map(line => (line.length ? pad + line : line))
    .join('\n');
}

/**
 * 将Schema转换为TypeScript类型
 * @param schema Schema对象
 * @param level 缩进级别
 * @returns TypeScript类型字符串
 */
function schemaToTs(schema: Schema | undefined, level = 0): string {
  if (!schema) return 'unknown';

  switch (schema.kind) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'any':
      return 'any';
    case 'unknown':
      return 'unknown';
    case 'enum':
      return schema.values.map(value => JSON.stringify(value)).join(' | ') || 'unknown';
    case 'oneOf': {
      const variants = schema.variants.map(variant => schemaToTs(variant, level));
      return variants.length ? variants.join(' | ') : 'unknown';
    }
    case 'array': {
      const elementType = schemaToTs(schema.element, level);
      return `Array<${elementType}>`;
    }
    case 'object': {
      const properties = schema.properties || {};
      const required = new Set(schema.required || []);
      const entries: string[] = [];
      for (const [key, value] of Object.entries(properties)) {
        const optional = !required.has(key);
        const description = value?.description ? `/** ${value.description} */\n` : '';
        const propType = schemaToTs(value, level + 1);
        const propLines = `${JSON.stringify(key)}${optional ? '?' : ''}: ${propType};`;
        entries.push(`${description}${propLines}`);
      }

      if (schema.additionalProperties) {
        if (schema.additionalProperties === true) {
          entries.push('[key: string]: unknown;');
        } else {
          const additionalType = schemaToTs(schema.additionalProperties as Schema, level + 1);
          entries.push(`[key: string]: ${additionalType};`);
        }
      }

      if (!entries.length) return '{}';
      return `{
${indentBlock(entries.join('\n'), level + 1)}
${'  '.repeat(level)}}`;
    }
    default:
      return 'unknown';
  }
}

/**
 * 请求属性接口
 */
interface RequestProperty {
  /** 属性文本 */
  text: string;
  /** 是否必需 */
  isRequired: boolean;
}

/**
 * 渲染参数对象
 * @param params 参数定义数组
 * @param level 缩进级别
 * @returns 渲染后的参数对象字符串
 */
function renderParameterObject(params: ParameterDefinition[] | undefined, level: number) {
  if (!params || !params.length) return undefined;
  const lines: string[] = [];
  for (const prm of params) {
    const description = prm.description ? `/** ${prm.description} */\n` : '';
    const type = schemaToTs(prm.schema, level + 1);
    const optional = !prm.required;
    lines.push(`${description}${JSON.stringify(prm.name)}${optional ? '?' : ''}: ${type};`);
  }
  return `{
${indentBlock(lines.join('\n'), level + 1)}
${'  '.repeat(level)}}`;
}

/**
 * 创建属性对象
 * @param name 属性名
 * @param type 属性类型
 * @param optional 是否可选
 * @returns 请求属性对象
 */
function makeProperty(name: string, type: string, optional: boolean): RequestProperty {
  const formattedType = type.includes('\n')
    ? type.replace(/\n/g, '\n  ')
    : type;
  return {
    text: `  ${JSON.stringify(name)}${optional ? '?' : ''}: ${formattedType};`,
    isRequired: !optional,
  };
}

/**
 * 渲染请求类型
 * @param className 类名
 * @param endpoint 端点定义
 * @returns 渲染结果对象
 */
function renderRequestType(className: string, endpoint: EndpointDefinition) {
  const props: RequestProperty[] = [];
  const pathType = renderParameterObject(endpoint.parameters?.path, 1);
  const queryType = renderParameterObject(endpoint.parameters?.query, 1);
  const headerType = renderParameterObject(endpoint.parameters?.header, 1);
  if (pathType) props.push(makeProperty('path', pathType, false));
  if (queryType) props.push(makeProperty('query', queryType, true));
  if (headerType) props.push(makeProperty('headers', headerType, true));
  if (endpoint.body?.schema) {
    const bodyType = schemaToTs(endpoint.body.schema, 1);
    props.push(makeProperty('body', bodyType, !endpoint.body.required));
  }

  props.push(makeProperty('signal', 'AbortSignal', true));

  const hasProperties = props.length > 0;
  const hasRequiredFields = props.some(p => p.isRequired);
  const lines = hasProperties ? props.map(p => p.text) : ['  // No request parameters required.'];

  const code = `export interface ${className}Request {
${lines.join('\n')}
}`;

  return { code, hasRequiredFields };
}

/**
 * 选择成功的响应定义
 * @param endpoint 端点定义
 * @returns 成功的响应定义
 */
function pickSuccessResponse(endpoint: EndpointDefinition) {
  if (!endpoint.responses || !endpoint.responses.length) return undefined;
  const success = endpoint.responses.find(r => typeof r.status === 'number' && r.status >= 200 && r.status < 300);
  return success ?? endpoint.responses[0];
}

/**
 * 渲染响应类型
 * @param className 类名
 * @param endpoint 端点定义
 * @returns 渲染结果对象
 */
function renderResponseType(className: string, endpoint: EndpointDefinition) {
  const success = pickSuccessResponse(endpoint);
  const typeName = `${className}Response`;
  if (!success || !success.schema) {
    return {
      code: `export type ${typeName} = void;`,
      contentType: success?.contentType,
    };
  }
  const tsType = schemaToTs(success.schema, 0);
  return {
    code: `export type ${typeName} = ${tsType};`,
    contentType: success.contentType,
  };
}

/**
 * 渲染执行器接口
 * @param className 类名
 * @param hasRequiredFields 是否有必需字段
 * @returns 渲染后的执行器接口字符串
 */
function renderExecutorInterface(className: string, hasRequiredFields: boolean) {
  const executorType = hasRequiredFields
    ? `EndpointExecutor<${className}Request, ${className}Response>`
    : `EndpointExecutor<${className}Request, ${className}Response, false>`;
  return `export type ${className}Executor = ${executorType};`;
}

/**
 * 渲染客户端类
 * @param className 类名
 * @param endpoint 端点定义
 * @param hasRequiredFields 是否有必需字段
 * @param responseContentType 响应内容类型
 * @returns 渲染后的客户端类字符串
 */
function renderClientClass(
  className: string,
  endpoint: EndpointDefinition,
  hasRequiredFields: boolean,
  responseContentType: string | undefined,
) {
  const paramSignature = hasRequiredFields
    ? `request: ${className}Request`
    : `request: ${className}Request = {} as ${className}Request`;

  const specFields = [
    `method: ${JSON.stringify(endpoint.method)}`,
    `path: ${JSON.stringify(endpoint.path)}`,
  ];
  if (endpoint.body?.required) specFields.push('bodyRequired: true');
  if (endpoint.body?.contentType) specFields.push(`bodyContentType: ${JSON.stringify(endpoint.body.contentType)}`);
  if (responseContentType) specFields.push(`responseContentType: ${JSON.stringify(responseContentType)}`);

  const specObject = `{
      ${specFields.join(',\n      ')}
    }`;

  const ctor = `  constructor(config: FetchClientConfig = {}) {
    super(config);
  }`;

  const method = `  async fetch(${paramSignature}, init?: RequestInit): Promise<${className}Response> {
    return this.request<${className}Response>(
      ${specObject},
      request,
      init
    );
  }`;

  const docs: string[] = [];
  if (endpoint.name) docs.push(endpoint.name);
  if (endpoint.description) docs.push(endpoint.description);
  const header = docs.length ? `/** ${docs.join(' - ')} */\n` : '';

  return `${header}export class ${className} extends BaseFetchClient implements ${className}Executor {
${ctor}

${method}
}`;
}

/**
 * 渲染端点文件
 * @param endpoint 端点定义
 * @returns 生成的文件对象
 */
interface EndpointFileRenderConfig {
  filename: string;
  transportImportPath: string;
}

function renderEndpointFile(endpoint: EndpointDefinition, config: EndpointFileRenderConfig) {
  const baseName = endpoint.name || endpoint.id;
  const className = toPascalCase(baseName);
  const { filename, transportImportPath } = config;

  const request = renderRequestType(className, endpoint);
  const response = renderResponseType(className, endpoint);
  const executor = renderExecutorInterface(className, request.hasRequiredFields);
  const clientClass = renderClientClass(className, endpoint, request.hasRequiredFields, response.contentType);

  const parts = [
    '/**',
    ` * Auto-generated for ${endpoint.method} ${endpoint.path}`,
    ' */',
    '',
    `import { BaseFetchClient, type EndpointExecutor, type FetchClientConfig } from '${transportImportPath}';`,
    '',
    request.code,
    '',
    response.code,
    '',
    executor,
    '',
    clientClass,
    '',
  ];

  return {
    filename,
    content: parts.join('\n'),
  };
}

/**
 * 渲染类型文件
 * @param service 服务定义
 * @returns 生成的文件对象或undefined
 */
function renderTypesFile(service: ServiceDefinition): GeneratedFile | undefined {
  const entries = service.types ? Object.entries(service.types) : [];
  if (!entries.length) return undefined;
  const parts: string[] = ['/**', ' * Normalized component schemas.', ' */', ''];
  for (const [name, schema] of entries) {
    const typeName = toPascalCase(name);
    const tsType = schemaToTs(schema, 0);
    parts.push(`export type ${typeName} = ${tsType};`, '');
  }
  return {
    filename: 'types.ts',
    content: parts.join('\n'),
  };
}

/**
 * 渲染传输文件
 * @returns 生成的文件对象
 */
function renderTransportFile(): GeneratedFile {
  const content = `/**
 * Shared runtime helpers that power the generated fetch client.
 */
export type QueryArrayFormat = 'repeat' | 'comma';

export interface FetchClientConfig {
  // Base URL that will be prefixed to every request path.
  baseUrl?: string;
  // Custom fetch implementation (pass polyfills when running outside the browser).
  fetch?: typeof fetch;
  // Headers merged into every request before it is dispatched.
  defaultHeaders?: Record<string, string>;
  // Controls how array values are serialized in the query string.
  queryArrayFormat?: QueryArrayFormat;
  // Lifecycle hook fired right before sending a request.
  onRequest?: (ctx: RequestContext) => void | Promise<void>;
  // Lifecycle hook fired after the response is received (ideal for logging or metrics).
  onResponse?: (ctx: ResponseContext) => void | Promise<void>;
}

export interface RequestContext {
  // Fully resolved URL including baseUrl, path parameters, and query string.
  url: string;
  method: string;
  init: RequestInit;
}

export interface ResponseContext extends RequestContext {
  status: number;
  statusText: string;
  data: unknown;
}

export class HttpError extends Error {
  constructor(message: string, public readonly status: number, public readonly data: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface EndpointSpec {
  // Metadata that mirrors the underlying OpenAPI operation.
  method: string;
  path: string;
  bodyRequired?: boolean;
  bodyContentType?: string;
  responseContentType?: string;
}

export interface EndpointRequestParts {
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

// Generic executor signature implemented by generated client classes.
export type EndpointExecutor<Request, Response, RequireRequest extends boolean = true> =
  RequireRequest extends true
    ? {
        fetch(request: Request, init?: RequestInit): Promise<Response>;
      }
    : {
        fetch(request?: Request, init?: RequestInit): Promise<Response>;
      };

/**
 * Serializes query parameters into a query string.
 */
function serializeQuery(params: Record<string, unknown> | undefined, arrayFormat: QueryArrayFormat = 'repeat') {
  if (!params) return '';
  const parts: string[] = [];
  const append = (key: string, value: unknown) => {
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (arrayFormat === 'repeat') {
        for (const item of value) append(key, item);
      } else {
        append(key, value.join(','));
      }
      continue;
    }

    if (typeof value === 'object') {
      append(key, JSON.stringify(value));
      continue;
    }

    append(key, value);
  }

  return parts.length ? '?' + parts.join('&') : '';
}

/**
 * Applies path parameters to templated routes such as /users/{id}.
 */
function applyPathParams(path: string, params?: Record<string, string | number>) {
  if (!params) return path;
  return path.replace(/{(.*?)}/g, (_, key: string) => {
    const value = params[key];
    return encodeURIComponent(value === undefined ? '' : String(value));
  });
}

/**
 * Normalizes the various HeadersInit shapes into a plain object for merging.
 */
function headersToRecord(input?: HeadersInit): Record<string, string> {
  if (!input) return {};
  if (input instanceof Headers) {
    const out: Record<string, string> = {};
    input.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(input)) {
    const out: Record<string, string> = {};
    for (const [key, value] of input) {
      out[key] = value;
    }
    return out;
  }
  return { ...input } as Record<string, string>;
}

/**
 * Base class used by generated clients to encapsulate shared request/response plumbing.
 */
export class BaseFetchClient {
  constructor(protected readonly config: FetchClientConfig = {}) {}

  /**
   * Builds the final request URL from the endpoint spec and caller input.
   */
  protected buildUrl(spec: EndpointSpec, request: EndpointRequestParts | undefined) {
    const baseUrl = this.config.baseUrl?.replace(/[/]$/, '') || '';
    const path = applyPathParams(spec.path, request?.path);
    const qs = serializeQuery(request?.query, this.config.queryArrayFormat);
    return baseUrl + path + qs;
  }

  /**
   * Performs the fetch call and handles headers, body, and response decoding.
   */
  protected async request<Response>(
    spec: EndpointSpec,
    request: EndpointRequestParts | undefined,
    init?: RequestInit
  ): Promise<Response> {
    const fetchImpl = (this.config.fetch ?? globalThis.fetch) as typeof fetch | undefined;
    if (typeof fetchImpl !== 'function') {
      throw new Error('No fetch implementation available. Provide FetchClientConfig.fetch in non-browser environments.');
    }

    if (spec.bodyRequired && (request?.body === undefined || request.body === null)) {
      throw new Error('Request body is required for this endpoint.');
    }

    const url = this.buildUrl(spec, request);
    const headers: Record<string, string> = {
      ...(this.config.defaultHeaders ?? {}),
      ...(request?.headers ?? {}),
      ...headersToRecord(init?.headers),
    };

    const method = spec.method.toUpperCase();
    const bodySource = init?.body ?? request?.body;
    let finalBody: BodyInit | undefined;

    if (bodySource !== undefined && bodySource !== null && !['GET', 'HEAD'].includes(method)) {
      if (typeof Blob !== 'undefined' && bodySource instanceof Blob) {
        finalBody = bodySource;
      } else if (typeof FormData !== 'undefined' && bodySource instanceof FormData) {
        finalBody = bodySource;
      } else if (typeof URLSearchParams !== 'undefined' && bodySource instanceof URLSearchParams) {
        finalBody = bodySource;
      } else if (typeof ArrayBuffer !== 'undefined' && bodySource instanceof ArrayBuffer) {
        finalBody = bodySource;
      } else if (typeof ReadableStream !== 'undefined' && bodySource instanceof ReadableStream) {
        // ReadableStream may need a polyfill in Node.js; treat it as BodyInit when available.
        finalBody = bodySource as BodyInit;
      } else if (typeof bodySource === 'string') {
        finalBody = bodySource;
      } else {
        const declared = spec.bodyContentType || headers['Content-Type'] || headers['content-type'];
        if (!declared || declared.includes('application/json')) {
          headers['Content-Type'] = 'application/json';
          finalBody = JSON.stringify(bodySource);
        } else if (declared.includes('application/x-www-form-urlencoded')) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(bodySource as Record<string, unknown>)) {
            if (value !== undefined && value !== null) params.append(key, String(value));
          }
          finalBody = params as any;
        } else {
          finalBody = String(bodySource);
        }
      }
    }

    const finalInit: RequestInit = {
      ...init,
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : finalBody,
      signal: request?.signal ?? init?.signal,
    };

    const requestCtx: RequestContext = { url, method, init: finalInit };
    if (this.config.onRequest) await this.config.onRequest(requestCtx);

    const response = await fetchImpl(url, finalInit);

    const declaredResponseType = spec.responseContentType;
    let data: unknown;
    try {
      if (response.status === 204 || method === 'HEAD') {
        data = undefined;
      } else {
        const headerType = response.headers.get('content-type') || '';
        const contentType = declaredResponseType || headerType;
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else if (contentType.startsWith('text/')) {
          data = await response.text();
        } else {
          data = await response.arrayBuffer();
        }
      }
    } catch (err) {
      data = undefined;
    }

    const responseCtx: ResponseContext = {
      url,
      method,
      init: finalInit,
      status: response.status,
      statusText: response.statusText,
      data,
    };
    if (this.config.onResponse) await this.config.onResponse(responseCtx);

    if (!response.ok) {
      throw new HttpError('HTTP ' + response.status + ' ' + response.statusText, response.status, data);
    }

    return data as Response;
  }
}
`;

  return {
    filename: 'transport.ts',
    content,
  };
}

/**
 * 生成客户端源代码
 * @param service 服务定义
 * @param options 代码生成选项
 * @returns 生成的文件包
 */
export function generateClientSource(service: ServiceDefinition, options?: CodegenOptions): GeneratedBundle {
  const entryFileName = options?.entryFileName || 'index.ts';
  const extension = options?.fileExtension || 'ts';

  const transportFile = renderTransportFile();
  const endpointInfos = service.endpoints.map((endpoint, index) => {
    const fallbackBase = endpoint.name || endpoint.id;
    const segments = extractPathSegments(endpoint.path, fallbackBase, index);
    return { endpoint, segments };
  });

  const pathUsageCounts = new Map<string, number>();
  for (const info of endpointInfos) {
    const key = info.segments.join('/');
    pathUsageCounts.set(key, (pathUsageCounts.get(key) ?? 0) + 1);
  }

  const endpointFiles = endpointInfos.map(info => {
    const { endpoint, segments } = info;
    const key = segments.join('/');
    const occurrence = pathUsageCounts.get(key) ?? 0;

    const dirSegments = segments.length > 1
      ? segments.slice(0, -1)
      : segments.slice();
    const baseSegment = segments[segments.length - 1] ?? 'endpoint';
    let fileBase = baseSegment;

    if (occurrence > 1) {
      // Append the HTTP method when multiple operations share the same path to avoid filename collisions.
      const methodSuffix = endpoint.method.toLowerCase();
      fileBase = `${fileBase}-${methodSuffix}`;
    }

    const filename = dirSegments.length
      ? path.join(...dirSegments, `${fileBase}.ts`)
      : `${fileBase}.ts`;
    const transportImportPath = computeRelativeModulePath(filename, transportFile.filename);

    return renderEndpointFile(endpoint, { filename, transportImportPath });
  });

  const exportLines = endpointFiles.map(file => {
    const base = file.filename.replace(/\.ts$/, '');
    return `export * from './${base}';`;
  });

  const files: GeneratedFile[] = [transportFile, ...endpointFiles.map(({ filename, content }) => ({ filename, content }))];
  const typesFile = renderTypesFile(service);
  if (typesFile) {
    files.splice(1, 0, typesFile);
    exportLines.unshift(`export * from './${typesFile.filename.replace(/\.ts$/, '')}';`);
  }
  exportLines.unshift(`export * from './${transportFile.filename.replace(/\.ts$/, '')}';`);

  const entryFile: GeneratedFile = {
    filename: entryFileName.endsWith(`.${extension}`) ? entryFileName : `${entryFileName}.${extension}`,
    content: exportLines.join('\n') + '\n',
  };

  return {
    entrypoint: entryFile.filename,
    files: [entryFile, ...files],
  };
}

/**
 * 代码生成器扩展接口
 */
export interface CodeGeneratorExtension {
  /**
   * 生成代码
   * @param service 服务定义
   * @param options 代码生成选项
   * @returns 生成的文件包
   */
  generate(service: ServiceDefinition, options?: CodegenOptions): GeneratedBundle;
  /** 生成器名称 */
  name: string;
  /** 支持的模板 */
  supportedTemplates?: string[];
}

/**
 * 默认代码生成器
 */
export const defaultGenerator: CodeGeneratorExtension = {
  name: 'default',
  generate: generateClientSource,
};
