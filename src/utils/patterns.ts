/**
 * Unified Path Exclusion Rules, File Extension Filter Constants and Utility Functions
 * 统一的路径排除规则、文件扩展名过滤常量与工具函数
 * Exclusion directories and code extensions are dynamically derived from language handlers,
 * 排除目录和代码扩展名从语言处理器动态派生，
 * avoiding hardcoded language-specific content
 * 避免硬编码语言特定内容
 *
 * Gitignore pattern matching is delegated to the `ignore` package (full gitignore semantics),
 * gitignore 模式匹配委托给 `ignore` 包（完整 gitignore 语义）。
 */

import * as path from 'path';
import { Ignore } from 'ignore';
import { languageHandlerManager } from '../language-handlers/index';

// ─── Exclusion Directories ─────────────────────────────────────────────
// ─── 排除目录 ─────────────────────────────────────────────

/** Common exclusion directories (language-agnostic) / 通用排除目录（与语言无关） */
const COMMON_EXCLUDE_DIRS = [
  // Version control / 版本控制
  '.git', '.svn', '.hg',
  // IDE / Editor / IDE / 编辑器
  '.idea', '.vscode', '.vs', '.fleet',
  // Common build outputs / 通用构建产物
  'node_modules', 'dist', 'build', 'out', 'coverage',
  // Cache / 缓存
  '.cache', '.tmp', '.temp',
  // nium-wiki itself / nium-wiki 自身
  '.nium-wiki', '.agent',
];

/** 默认排除的目录名（通用 + 各语言处理器提供的排除目录） */
export const DEFAULT_EXCLUDE_DIRS = new Set([
  ...COMMON_EXCLUDE_DIRS,
  ...languageHandlerManager.getAllExcludeDirs(),
]);

// ─── Ignore Files ─────────────────────────────────────────────────────────
// ─── 忽略文件 ─────────────────────────────────────────────

/** Specific file names that should be skipped / 应跳过的特定文件名 */
export const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitignore', '.gitattributes',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'poetry.lock', 'Pipfile.lock', 'composer.lock',
]);

// ─── File Extensions ────────────────────────────────────────────────────────
// ─── 文件扩展名 ─────────────────────────────────────────────

/** Supported code file extensions (dynamically obtained from language handlers) / 支持的代码文件扩展名（从语言处理器动态获取） */
export const CODE_EXTENSIONS = new Set([
  ...languageHandlerManager.getAllSourceExtensions(),
  // C/C++ extensions not covered by language handlers / 语言处理器未覆盖的 C/C++ 扩展名
  '.c', '.cpp', '.h', '.hpp',
]);

/** Document file extensions / 文档文件扩展名 */
export const DOC_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.txt']);

/** Config file extensions / 配置文件扩展名 */
export const CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.cfg', '.conf']);

// ─── Exclusion List for config.json Template ──────────────────────────────
// ─── config.json 模板用的排除列表 ────────────────────────────

/** Exclusion list written to config.json by initWiki (kept concise) / initWiki 生成 config.json 时写入的排除列表（保持精简） */
export const CONFIG_EXCLUDE_LIST = [
  'node_modules', '.git', 'dist', 'build',
  'coverage', '__pycache__', 'venv', '.venv',
];

// ─── Utility Functions ────────────────────────────────────────────────────────
// ─── 工具函数 ─────────────────────────────────────────────

/**
 * Check if a path segment matches a wildcard directory pattern from config/excludes.
 * Supports suffix wildcard (e.g. "dir*") and prefix wildcard (*"dir") against a single path segment.
 *
 * @param part - single path segment, e.g. "dist", "node_modules"
 * @param pattern - a simple wildcard pattern without '/', e.g. "dir*"
 */
function matchesWildcardDir(part: string, pattern: string): boolean {
  if (pattern.startsWith('*')) {
    return part.endsWith(pattern.substring(1));
  }
  if (pattern.endsWith('*')) {
    return part.startsWith(pattern.slice(0, -1));
  }
  return false;
}

/**
 * Check if path contains directories that should be excluded.
 * Uses two layers:
 *  1. Exact match against simple directory names (fast, in hot path)
 *  2. ignore instance for full gitignore glob semantics (*, **, !, etc.)
 *
 * @param filePath  - relative path, e.g. ".gitnexus/wiki/docs.md"
 * @param excludes  - Set of simple directory names (for fast exact-match)
 * @param ig       - optional ignore instance (from createIgnore); if omitted,
 *                   falls back to DEFAULT_EXCLUDE_DIRS and no glob support
 */
export function isExcludedPath(
  filePath: string,
  excludes?: Set<string>,
  ig?: Ignore,
): boolean {
  const dirs = excludes ?? DEFAULT_EXCLUDE_DIRS;
  const parts = filePath.split(/[\\/]/);

  // Layer 1: fast exact directory-name match
  for (const part of parts) {
    if (dirs.has(part)) return true;
  }

  // Layer 2: wildcard directory patterns from excludes set (prefix/suffix *)
  for (const pattern of dirs) {
    if (pattern.includes('*')) {
      for (const part of parts) {
        if (matchesWildcardDir(part, pattern)) return true;
      }
    }
  }

  // Layer 3: full gitignore semantics via ignore package
  if (ig) {
    // ignore.filter returns [] (empty = ignored) or [path] (kept)
    if (ig.filter([filePath]).length === 0) return true;
  }

  return false;
}

/** Check if file is a code file / 判断是否为代码文件 */
export function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(path.extname(filePath));
}

/** Check if file is a document file / 判断是否为文档文件 */
export function isDocFile(filePath: string): boolean {
  return DOC_EXTENSIONS.has(path.extname(filePath));
}

/** Check if file is a config file / 判断是否为配置文件 */
export function isConfigFile(filePath: string): boolean {
  return CONFIG_EXTENSIONS.has(path.extname(filePath));
}

/**
 * Check if file should be included in scanning (code or document, and not in excluded paths).
 * Pass the ignore instance (from createIgnore) for full gitignore pattern support.
 *
 * @param filePath - relative path
 * @param excludes - Set of directory names
 * @param ig       - optional ignore instance
 */
export function shouldIncludeFile(
  filePath: string,
  excludes?: Set<string>,
  ig?: Ignore,
): boolean {
  if (isExcludedPath(filePath, excludes, ig)) return false;
  return isCodeFile(filePath) || isDocFile(filePath) || isConfigFile(filePath);
}
