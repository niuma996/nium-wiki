/**
 * Configuration File Reading and Exclusion Rule Merging
 * 配置文件读取与排除规则合并
 * Reads .nium-wiki/config.json, merges user-defined exclude with built-in exclusion directories
 * 读取 .nium-wiki/config.json，将用户自定义 exclude 与内置排除目录合并
 * Supports reading directory exclusion rules from .gitignore via the `ignore` package
 * 支持通过 `ignore` 包读取 .gitignore 中的目录排除规则
 */

import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import { DEFAULT_EXCLUDE_DIRS } from './patterns';

export interface NiumWikiConfig {
  language: string;
  exclude: string[];
  useGitignore: boolean;
  /** Enable copying scanned files to .nium-wiki/raw/ (default: true) */
  syncRaw: boolean;
}

const DEFAULT_CONFIG: NiumWikiConfig = {
  language: 'zh',
  exclude: [],
  useGitignore: true,
  syncRaw: true,
};

/** Read .nium-wiki/config.json, return default value if not exists / 读取 .nium-wiki/config.json，不存在则返回默认值 */
export function loadConfig(projectRoot: string): NiumWikiConfig {
  const configPath = path.join(projectRoot, '.nium-wiki', 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      language: raw?.language ?? DEFAULT_CONFIG.language,
      exclude: Array.isArray(raw?.exclude) ? raw.exclude : DEFAULT_CONFIG.exclude,
      useGitignore: raw?.useGitignore ?? DEFAULT_CONFIG.useGitignore,
      syncRaw: raw?.syncRaw ?? DEFAULT_CONFIG.syncRaw,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Create an `ignore` instance loaded with all .gitignore files from projectRoot up to
 * the filesystem root, plus config.json user-defined excludes.
 *
 * The `ignore` package implements full gitignore semantics (negation !, glob *, **, etc.)
 * and is used by eslint, gitbook, and others.
 *
 * 构建一个 `ignore` 实例，加载从 projectRoot 到根目录的所有 .gitignore 文件
 * 以及 config.json 中的用户自定义排除规则。
 */
export function createIgnore(projectRoot: string): Ignore {
  const ig = ignore();
  const config = loadConfig(projectRoot);

  if (config.useGitignore) {
    // Walk up from projectRoot to filesystem root, loading .gitignore at each level
    let currentDir = path.resolve(projectRoot);
    const rootMarker = path.resolve('/');

    while (true) {
      const gitignorePath = path.join(currentDir, '.gitignore');
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        ig.add(content);
      }

      if (currentDir === rootMarker) break;
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  }

  // Add config.json user-defined excludes (each as a directory pattern)
  for (const pattern of config.exclude) {
    ig.add(pattern);
  }

  return ig;
}

/** Module-level cache for getExcludeDirs results, keyed by resolved projectRoot. */
const _excludeCache = new Map<string, ExcludeResult>();

/**
 * Return type for getExcludeDirs.
 * - dirs: Set of directory names for walkFiles (exact-match optimization)
 * - ig: fully-initialized ignore instance for pattern-based filtering
 */
export interface ExcludeResult {
  /** Simple directory names (exact-match, used by walkFiles for speed) */
  dirs: Set<string>;
  /** ignore instance with full gitignore semantics */
  ig: Ignore;
}

/**
 * Merge built-in exclusion dirs + config.json user-defined exclude + .gitignore.
 * Results are cached per resolved projectRoot.
 * / 合并内置排除目录 + config.json 用户自定义 exclude + .gitignore 目录。按 resolved projectRoot 缓存。
 */
export function getExcludeDirs(projectRoot: string): ExcludeResult {
  const key = path.resolve(projectRoot);
  if (_excludeCache.has(key)) return _excludeCache.get(key)!;

  const config = loadConfig(key);
  const ig = createIgnore(key);

  const result: ExcludeResult = {
    dirs: new Set([...DEFAULT_EXCLUDE_DIRS, ...config.exclude]),
    ig,
  };
  _excludeCache.set(key, result);
  return result;
}
