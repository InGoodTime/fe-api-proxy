#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { DocSyncPipeline } from './pipeline/index.js';

/**
 * 命令行工具
 * 通过命令行参数执行文档同步流水线
 */
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      prefer: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  // 显示帮助信息
  if (values.help) {
    printUsage();
    return;
  }

  const [command = 'generate'] = positionals;
  // 检查命令是否有效
  if (command !== 'generate') {
    console.error(`Unknown command: ${command}`);
    printUsage(1);
    return;
  }

  const inputPath = values.input;
  // 检查输入路径是否为空
  if (!inputPath) {
    console.error('Missing required --input argument');
    printUsage(1);
    return;
  }

  const outputPath = values.output;
  // 检查输出路径是否为空
  if (!outputPath) {
    console.error('Missing required --output argument');
    printUsage(1);
    return;
  }

  // 读取输入文件
  const resolvedInput = resolve(process.cwd(), inputPath);
  const rawContent = await readFile(resolvedInput, 'utf-8');
  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    console.error(`Failed to parse JSON from ${resolvedInput}:`, err);
    process.exitCode = 1;
    return;
  }

  try {
    const resolvedOutput = resolve(process.cwd(), outputPath);
    const outputStat = await stat(resolvedOutput).catch(() => null);
    // 检查输出路径是否为目录
    if (outputStat && !outputStat.isDirectory()) {
      console.error('Output path must be a directory when generating multiple files.');
      process.exitCode = 1;
      return;
    }

    // 执行文档同步流水线
    const pipeline = new DocSyncPipeline();
    const preferredType = typeof values.prefer === 'string' ? values.prefer.toLowerCase() : 'swagger';
    await pipeline.run({
      invoke: {
        sources: [
          {
            type: preferredType,
            name: preferredType,
            document: parsed,
            metadata: { primary: true },
          },
        ],
      },
      generator: {},
      output: {
        outputDir: resolvedOutput,
      },
    });

    console.log(`Generated API client bundle to ${resolvedOutput}`);
  } catch (err: any) {
    console.error('Failed to generate client:', err.message);
    process.exitCode = 1;
  }
}

/**
 * 打印使用说明
 * @param code 退出码
 */
function printUsage(code?: number) {
  console.log(`Usage: api-doc-sync generate [options]

Options:
  -i, --input FILE     Input API document JSON file (required)
  -o, --output DIR     Output directory for generated files (required)
  --prefer TYPE        Prefer source type (swagger, postman, apifox)
  -h, --help           Print this help message
`);
  if (typeof code === 'number') process.exit(code);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});