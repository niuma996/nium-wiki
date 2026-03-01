/**
 * 配置文件读取与排除规则合并
 * 读取 .nium-wiki/config.json，将用户自定义 exclude 与内置排除目录合并
 * 支持读取 .gitignore 中的目录排除规则
 */

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_EXCLUDE_DIRS } from './patterns';

export interface NiumWikiConfig {
  language: string;
  exclude: string[];
  useGitignore: boolean;
}

const DEFAULT_CONFIG: NiumWikiConfig = {
  language: 'zh',
  exclude: [],
  useGitignore: true,
};

/** 读取 .nium-wiki/config.json，不存在则返回默认值 */
export function loadConfig(projectRoot: string): NiumWikiConfig {
  const configPath = path.join(projectRoot, '.nium-wiki', 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      language: raw?.language ?? DEFAULT_CONFIG.language,
      exclude: Array.isArray(raw?.exclude) ? raw.exclude : DEFAULT_CONFIG.exclude,
      useGitignore: raw?.useGitignore ?? DEFAULT_CONFIG.useGitignore,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 从 .gitignore 解析出目录排除项
 * 只提取目录模式（以 / 结尾或纯名称且不含通配符和扩展名），忽略取反规则和文件通配符
 */
function parseGitignoreDirs(projectRoot: string): string[] {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];

  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const dirs: string[] = [];

    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;

      // 显式目录模式: "dist/", "node_modules/"
      if (line.endsWith('/')) {
        dirs.push(line.slice(0, -1));
        continue;
      }

      // 纯名称（无通配符、无路径分隔符、无扩展名点号）视为目录名
      if (!line.includes('*') && !line.includes('?') && !line.includes('/') && !line.includes('.')) {
        dirs.push(line);
      }
    }

    return dirs;
  } catch {
    return [];
  }
}

/** 合并内置排除目录 + config.json 用户自定义 exclude + .gitignore 目录 */
export function getExcludeDirs(projectRoot: string): Set<string> {
  const config = loadConfig(projectRoot);
  const gitignoreDirs = config.useGitignore ? parseGitignoreDirs(projectRoot) : [];
  return new Set([...DEFAULT_EXCLUDE_DIRS, ...config.exclude, ...gitignoreDirs]);
}
