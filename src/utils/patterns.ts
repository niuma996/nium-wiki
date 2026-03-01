/**
 * 统一的路径排除规则、文件扩展名过滤常量与工具函数
 * 排除目录和代码扩展名从语言处理器动态派生，避免硬编码语言特定内容
 */

import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index.js';

// ─── 排除目录 ───────────────────────────────────────────────

/** 通用排除目录（与语言无关） */
const COMMON_EXCLUDE_DIRS = [
  // 版本控制
  '.git', '.svn', '.hg',
  // IDE / 编辑器
  '.idea', '.vscode', '.vs', '.fleet',
  // 通用构建产物
  'node_modules', 'dist', 'build', 'out', 'coverage',
  // 缓存
  '.cache', '.tmp', '.temp',
  // nium-wiki 自身
  '.nium-wiki', '.agent',
];

/** 默认排除的目录名（通用 + 各语言处理器提供的排除目录） */
export const DEFAULT_EXCLUDE_DIRS = new Set([
  ...COMMON_EXCLUDE_DIRS,
  ...languageHandlerManager.getAllExcludeDirs(),
]);

// ─── 忽略文件 ───────────────────────────────────────────────

/** 应跳过的特定文件名 */
export const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitignore', '.gitattributes',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'poetry.lock', 'Pipfile.lock', 'composer.lock',
]);

// ─── 文件扩展名 ─────────────────────────────────────────────

/** 支持的代码文件扩展名（从语言处理器动态获取） */
export const CODE_EXTENSIONS = new Set([
  ...languageHandlerManager.getAllSourceExtensions(),
  // 语言处理器未覆盖的 C/C++ 扩展名
  '.c', '.cpp', '.h', '.hpp',
]);

/** 文档文件扩展名 */
export const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt']);

// ─── config.json 模板用的排除列表 ────────────────────────────

/** initWiki 生成 config.json 时写入的排除列表（保持精简） */
export const CONFIG_EXCLUDE_LIST = [
  'node_modules', '.git', 'dist', 'build',
  'coverage', '__pycache__', 'venv', '.venv',
];

// ─── 工具函数 ───────────────────────────────────────────────

/** 判断路径中是否包含应排除的目录 */
export function isExcludedPath(filePath: string, excludes?: Set<string>): boolean {
  const dirs = excludes ?? DEFAULT_EXCLUDE_DIRS;
  const parts = filePath.split(/[\\/]/);
  for (const part of parts) {
    if (dirs.has(part)) return true;
    // 支持通配符模式，如 *.log
    for (const pattern of dirs) {
      if (pattern.startsWith('*') && part.endsWith(pattern.substring(1))) return true;
    }
  }
  return false;
}

/** 判断是否为代码文件 */
export function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

/** 判断是否为文档文件 */
export function isDocFile(filePath: string): boolean {
  return DOC_EXTENSIONS.has(path.extname(filePath));
}

/** 判断文件是否应被纳入扫描（代码或文档，且不在排除路径中） */
export function shouldIncludeFile(filePath: string, excludes?: Set<string>): boolean {
  if (isExcludedPath(filePath, excludes)) return false;
  return isCodeFile(filePath) || isDocFile(filePath);
}
