// 文件：src/writer/index.ts
// 作用：处理生成代码的文件输出

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 文件写入选项
 */
export interface WriteOptions {
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean;
  /** 文件编码 */
  encoding?: BufferEncoding;
  /** 是否自动创建目录 */
  autoCreateDir?: boolean;
}

/**
 * 写入文件接口
 */
export interface FileWriter {
  /**
   * 将内容写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param options 写入选项
   */
  write(filePath: string, content: string, options?: WriteOptions): Promise<void>;
  
  /**
   * 批量写入文件
   * @param files 文件列表
   * @param options 写入选项
   */
  writeBatch(files: Array<{ path: string; content: string }>, options?: WriteOptions): Promise<void>;
}

/**
 * 默认文件写入器实现
 */
export class DefaultFileWriter implements FileWriter {
  /**
   * 将内容写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param options 写入选项
   */
  async write(filePath: string, content: string, options?: WriteOptions): Promise<void> {
    const opts = {
      overwrite: true,
      encoding: 'utf-8' as BufferEncoding,
      autoCreateDir: true,
      ...options
    };
    
    // 自动创建目录
    if (opts.autoCreateDir) {
      const dir = dirname(filePath);
      await mkdir(dir, { recursive: true });
    }
    
    await writeFile(filePath, content, opts.encoding);
  }
  
  /**
   * 批量写入文件
   * @param files 文件列表
   * @param options 写入选项
   */
  async writeBatch(files: Array<{ path: string; content: string }>, options?: WriteOptions): Promise<void> {
    for (const file of files) {
      await this.write(file.path, file.content, options);
    }
  }
}

// 默认文件写入器实例
export const defaultWriter = new DefaultFileWriter();

/**
 * 文件输出扩展接口
 */
export interface FileWriterExtension {
  /**
   * 写入文件
   * @param filePath 文件路径
   * @param content 文件内容
   * @param options 写入选项
   */
  write(filePath: string, content: string, options?: WriteOptions): Promise<void>;
  
  /**
   * 名称标识
   */
  name: string;
}