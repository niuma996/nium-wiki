/**
 * 依赖图谱分析模块
 * 解析 import/require 语句构建依赖图，计算变更的传递性影响
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index.js';
import { loadCache, saveCache } from '../utils/cache';

export interface DependencyGraph {
  imports: Record<string, string[]>;
  importedBy: Record<string, string[]>;
  createdAt: string;
}

export interface ImpactResult {
  directChanges: string[];
  transitiveImpacts: string[];
  allAffected: string[];
  impactChains: Record<string, string[]>;
}

/**
 * 解析导入路径，尝试补全扩展名和 index 文件
 * 使用语言处理器提供的解析配置
 */
function resolveImportPath(
  specifier: string,
  fromDir: string,
  projectRoot: string,
  resolveExtensions: string[],
  indexFiles: string[],
): string | null {
  const absBase = path.resolve(projectRoot, fromDir, specifier);

  // 直接匹配（带扩展名）
  if (fs.existsSync(absBase) && fs.statSync(absBase).isFile()) {
    return path.relative(projectRoot, absBase).replace(/\\/g, '/');
  }

  // 尝试补全扩展名
  for (const ext of resolveExtensions) {
    const candidate = absBase + ext;
    if (fs.existsSync(candidate)) {
      return path.relative(projectRoot, candidate).replace(/\\/g, '/');
    }
  }

  // 尝试目录下的 index 文件
  if (fs.existsSync(absBase) && fs.statSync(absBase).isDirectory()) {
    for (const idx of indexFiles) {
      const candidate = path.join(absBase, idx);
      if (fs.existsSync(candidate)) {
        return path.relative(projectRoot, candidate).replace(/\\/g, '/');
      }
    }
  }

  return null;
}

/**
 * 从文件内容中解析相对路径的 import 语句
 * 通过语言处理器自动适配不同语言的 import 语法
 */
export function parseImports(
  content: string,
  filePath: string,
  projectRoot: string,
): string[] {
  const config = languageHandlerManager.getImportResolveConfigForFile(filePath);
  if (!config || config.importPatterns.length === 0) {
    return [];
  }

  const dir = path.dirname(filePath);
  const imports: string[] = [];

  for (const pattern of config.importPatterns) {
    // 重置 lastIndex 以确保全局正则从头匹配
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const specifier = match[1];
      const cleaned = config.cleanSpecifier ? config.cleanSpecifier(specifier) : specifier;
      const resolved = resolveImportPath(cleaned, dir, projectRoot, config.resolveExtensions, config.indexFiles);
      if (resolved) imports.push(resolved);
    }
  }

  return [...new Set(imports)];
}

/**
 * 构建项目依赖图
 */
export function buildDependencyGraph(
  projectRoot: string,
  sourceFiles: string[],
): DependencyGraph {
  const imports: Record<string, string[]> = {};
  const importedBy: Record<string, string[]> = {};

  // 初始化所有文件
  for (const file of sourceFiles) {
    imports[file] = [];
    if (!importedBy[file]) importedBy[file] = [];
  }

  for (const file of sourceFiles) {
    const absPath = path.join(projectRoot, file);
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    const deps = parseImports(content, file, projectRoot);
    imports[file] = deps;

    for (const dep of deps) {
      if (!importedBy[dep]) importedBy[dep] = [];
      if (!importedBy[dep].includes(file)) {
        importedBy[dep].push(file);
      }
    }
  }

  return {
    imports,
    importedBy,
    createdAt: new Date().toISOString(),
  };
}

/**
 * BFS 计算变更文件的传递性影响
 */
export function computeTransitiveImpact(
  changedFiles: string[],
  graph: DependencyGraph,
  maxDepth = 3,
): ImpactResult {
  const directChanges = new Set(changedFiles);
  const transitiveImpacts = new Set<string>();
  const impactChains: Record<string, string[]> = {};

  for (const file of changedFiles) {
    impactChains[file] = [file];
  }

  const queue: Array<{ file: string; depth: number; chain: string[] }> = [];
  const visited = new Set(changedFiles);

  for (const file of changedFiles) {
    for (const dependent of (graph.importedBy[file] || [])) {
      if (!visited.has(dependent)) {
        queue.push({ file: dependent, depth: 1, chain: [file, dependent] });
      }
    }
  }

  while (queue.length > 0) {
    const { file, depth, chain } = queue.shift()!;
    if (visited.has(file) || depth > maxDepth) continue;
    visited.add(file);

    if (!directChanges.has(file)) {
      transitiveImpacts.add(file);
      impactChains[file] = chain;
    }

    for (const dependent of (graph.importedBy[file] || [])) {
      if (!visited.has(dependent)) {
        queue.push({ file: dependent, depth: depth + 1, chain: [...chain, dependent] });
      }
    }
  }

  return {
    directChanges: changedFiles,
    transitiveImpacts: [...transitiveImpacts],
    allAffected: [...directChanges, ...transitiveImpacts],
    impactChains,
  };
}

export function saveDependencyGraph(projectRoot: string, graph: DependencyGraph): void {
  const wikiDir = path.join(projectRoot, '.nium-wiki');
  saveCache(wikiDir, 'dep-graph.json', graph);
}

export function loadDependencyGraph(projectRoot: string): DependencyGraph | null {
  const wikiDir = path.join(projectRoot, '.nium-wiki');
  return loadCache<DependencyGraph | null>(wikiDir, 'dep-graph.json', null);
}
