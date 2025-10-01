/**
 * 文件：src/common/tools.ts
 * 作用：为生成的客户端提供格式化请求数据的工具函数
 * 
 * 核心功能设计：
 * 1. 序列化查询参数：处理数组、对象等复杂类型
 * 2. 应用路径参数：替换URL模板中的占位符
 * 3. 支持多种参数编码格式，兼容不同的后端实现
 * 
 * 数据流转：
 * 原始参数 → 序列化/编码 → URL构建 → HTTP请求
 */

/**
 * 从普通对象构建查询字符串
 * 
 * 处理特性：
 * 1. 自动过滤undefined和null值
 * 2. 支持数组的多种序列化方式：
 *    - repeat: 重复键名（key=value1&key=value2）
 *    - comma: 逗号分隔（key=value1,value2）
 * 3. 对象类型值自动JSON序列化
 * 4. 所有值都进行URL编码，防止特殊字符影响
 * 
 * @param params 应该出现在查询字符串中的键值对
 * @param arrayFormat 控制数组值如何序列化
 * @returns 查询字符串，以?开头，空参数时返回空字符串
 */
export function serializeQuery(params: Record<string, unknown> | undefined, arrayFormat: 'repeat' | 'comma' = 'repeat') {
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
 * 将路径参数注入到模板路径中
 * 
 * 处理特性：
 * 1. 识别路径中的{name}占位符
 * 2. 使用提供的参数值进行替换
 * 3. 所有值都进行URL编码，防止路径注入攻击
 * 4. 缺失的参数替换为空字符串，保证URL的可用性
 * 
 * 示例：
 * applyPathParams('/users/{id}/posts/{postId}', {id: '123', postId: '456'})
 * → '/users/123/posts/456'
 * 
 * @param path 包含`{name}`占位符的路径模板
 * @param params 用于替换占位符的值，支持字符串和数字
 * @returns 替换参数后的路径，已进行URL编码
 */
export function applyPathParams(path: string, params?: Record<string, string | number>) {
  if (!params) return path;
  return path.replace(/\{(.*?)\}/g, (_, key: string) => {
    const value = params[key];
    return encodeURIComponent(value === undefined ? '' : String(value));
  });
}