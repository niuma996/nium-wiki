/**
 * Generic File Traversal Utility
 * 通用文件遍历工具
 * Unifies all recursive directory traversal logic in the project
 * 统一项目中所有递归目录遍历逻辑
 */

import * as fs from 'fs';
import * as path from 'path';

export interface WalkOptions {
  /** File extension filter, e.g. ['.md', '.ts'] / 文件扩展名过滤，如 ['.md', '.ts'] */
  extensions?: string[];
  /** Directory names to exclude / 排除的目录名 */
  excludeDirs?: Set<string>;
  /** true returns relative paths, false returns absolute paths (default) / true 返回相对路径，false 返回绝对路径（默认） */
  relative?: boolean;
  /** Skip entries starting with . / 跳过 . 开头的条目 */
  skipHidden?: boolean;
}

/**
 * Recursively traverse directory, return list of matching file paths
 * 递归遍历目录，返回匹配的文件路径列表
 */
export function walkFiles(rootDir: string, options: WalkOptions = {}): string[] {
  const { extensions, excludeDirs, relative = false, skipHidden = false } = options;
  const results: string[] = [];

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skipHidden && entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!excludeDirs?.has(entry.name)) walk(fullPath);
        } else if (entry.isFile()) {
          if (!extensions || extensions.includes(path.extname(entry.name))) {
            results.push(
              relative
                ? path.relative(rootDir, fullPath).replace(/\\/g, '/')
                : fullPath,
            );
          }
        }
      }
    } catch { /* ignore unreadable dirs */ }
  }

  walk(rootDir);
  return results;
}
