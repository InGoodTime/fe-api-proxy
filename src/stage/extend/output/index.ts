
import type { IStage } from '../../index.js';
import type { DocSyncContext, OutputStageConfig, OutputStageResult } from '../../../pipeline/types.js';
import type { WriteOptions } from './writer.js';
import { defaultWriter } from './writer.js';
import { resolve, parse } from 'node:path';
import { rm } from 'node:fs/promises';

/**
 * 输出阶段类
 * 负责将生成的文件写入到指定目录
 */
export class OutputStage implements IStage<DocSyncContext, OutputStageConfig | undefined, OutputStageResult | undefined> {
  readonly name = 'output';

  /**
   * 执行输出阶段
   * @param context 文档同步上下文
   * @param config 输出阶段配置
   * @returns 输出阶段结果
   */
  async execute(context: DocSyncContext, config?: OutputStageConfig): Promise<OutputStageResult | undefined> {
    // 如果没有配置或配置跳过，则返回undefined
    if (!config || config.skip) {
      return undefined;
    }

    // 获取写入器
    const writer = config.writer ?? defaultWriter;
    const bundle = config.bundle ?? context.generatedBundle;
    const files: Array<{ path: string; content: string }> = [];

    // 收集需要写入的文件
    if (bundle) {
      const baseDir = config.outputDir;
      const resolver = config.mapFilePath;
      for (const file of bundle.files) {
        const targetPath = resolver ? resolver(file) : baseDir ? resolve(baseDir, file.filename) : file.filename;
        files.push({ path: targetPath, content: file.content });
      }
    }

    // 添加额外文件
    if (config.extraFiles && config.extraFiles.length) {
      for (const extra of config.extraFiles) {
        files.push({ path: extra.path, content: extra.content });
      }
    }

    // 如果没有文件需要写入，则返回空结果
    if (!files.length) {
      context.writtenFiles = [];
      return { writtenFiles: [] };
    }

    // 清理输出目录，确保不会保留历史生成结果
    const outputDir = config.outputDir?.trim();
    if (outputDir) {
      const absoluteOutputDir = resolve(outputDir);
      const { root } = parse(absoluteOutputDir);
      if (absoluteOutputDir === root) {
        throw new Error('[OutputStage] Refusing to remove root output directory.');
      }
      await rm(absoluteOutputDir, { recursive: true, force: true });
    }

    // 设置写入选项
    const writeOptions: WriteOptions = {
      overwrite: true,
      autoCreateDir: true,
      ...(config.writeOptions ?? {}),
    };

    // 批量写入文件
    await writer.writeBatch(files, writeOptions);

    // 记录写入的文件路径
    const written = files.map(file => file.path);
    context.writtenFiles = written;

    return { writtenFiles: written };
  }
}
