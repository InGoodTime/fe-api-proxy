/**
 * 文件：vitest.config.ts
 * 作用：Vitest测试框架的配置文件
 * 
 * 配置选项：
 * 1. test.include: 指定测试文件的匹配模式
 * 2. coverage.reporter: 配置代码覆盖率报告的输出格式
 * 
 * 功能特性：
 * - 支持TypeScript测试文件
 * - 提供文本和HTML格式的覆盖率报告
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],  // 只包含.spec.ts结尾的测试文件
    coverage: {
      reporter: ['text', 'html'],     // 生成文本和HTML两种覆盖率报告
    },
  },
});
