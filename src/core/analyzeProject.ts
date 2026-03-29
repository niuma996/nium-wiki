/**
 * 项目结构分析模块 / Project structure analysis module
 * 扫描项目目录，识别项目类型、模块结构和文档位置 / Scan project directory, identify project type, module structure, and documentation locations
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index';
import { IGNORE_FILES } from '../utils/patterns';
import { getExcludeDirs } from '../utils/config';
import { walkFiles } from '../utils/fileWalker';
import { saveCache } from '../utils/cache';

export interface ModuleInfo {
  name: string;
  path: string;
  files: number;
  type: string;
  /** 语义角色（来自 analyze-module 的推荐，可覆盖） */
  role?: 'core' | 'api' | 'utility' | 'ui' | 'test' | 'config' | 'unknown';
  /** 推荐的文档模板（来自 analyze-module 的推荐，可覆盖） */
  template?: 'module.md' | 'module-simple.md';
  /** 复杂度评分（0-100） */
  complexity?: number;
}

export interface ProjectStats {
  totalFiles: number;
  totalModules: number;
  totalDocs: number;
}

export interface ProjectAnalysis {
  projectName: string;
  projectType: string[];
  entryPoints: string[];
  modules: ModuleInfo[];
  docsFound: string[];
  stats: ProjectStats;
  createdAt: string;
}

/**
 * 获取所有支持的代码文件扩展名 / Get all supported code file extensions
 */
function getCodeExtensions(): string[] {
  return languageHandlerManager.getAllSourceExtensions();
}

/**
 * 检测项目中的语言 / Detect languages in the project
 */
function detectProjectLanguages(rootPath: string): string[] {
  return languageHandlerManager.detectProjectLanguages(rootPath);
}

/**
 * 检测项目类型（通过语言处理器）/ Detect project types (via language handlers)
 */
async function detectProjectTypes(rootPath: string): Promise<string[]> {
  const allTypes: string[] = [];
  const languages = detectProjectLanguages(rootPath);

  for (const langId of languages) {
    const handler = languageHandlerManager.getHandler(langId);
    if (handler) {
      const detection = await handler.detectProjectTypes(rootPath);
      allTypes.push(...detection.types);
      if (detection.packageManager) allTypes.push(...detection.packageManager);
      if (detection.frameworks) allTypes.push(...detection.frameworks);
    }
  }

  // 检测 monorepo 工具 / Detect monorepo tools
  const monorepoTools = detectMonorepoTools(rootPath);
  allTypes.push(...monorepoTools);

  return [...new Set(allTypes)];
}

/**
 * 检测 monorepo 工具 / Detect monorepo tools
 */
function detectMonorepoTools(rootPath: string): string[] {
  const tools: string[] = [];

  if (fs.existsSync(path.join(rootPath, 'pnpm-workspace.yaml'))) {
    tools.push('pnpm-workspaces');
    if (!tools.includes('monorepo')) tools.push('monorepo');
  }
  if (fs.existsSync(path.join(rootPath, 'lerna.json'))) {
    tools.push('lerna');
    if (!tools.includes('monorepo')) tools.push('monorepo');
  }
  if (fs.existsSync(path.join(rootPath, 'turbo.json'))) {
    tools.push('turborepo');
    if (!tools.includes('monorepo')) tools.push('monorepo');
  }

  const pkgPath = path.join(rootPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        tools.push('npm-workspaces');
        if (!tools.includes('monorepo')) tools.push('monorepo');
      }
    } catch { /* ignore */ }
  }

  return tools;
}

/**
 * 查找入口文件（通过语言处理器）/ Find entry points (via language handlers)
 */
async function findEntryPoints(rootPath: string, projectTypes: string[], excludeDirs: Set<string>): Promise<string[]> {
  const languages = detectProjectLanguages(rootPath);
  if (languages.length === 0) {
    return [];
  }

  const allFiles = collectAllCodeFiles(rootPath, excludeDirs);
  const allEntryPoints: string[] = [];

  for (const langId of languages) {
    const entries = await languageHandlerManager.findEntryPoints(langId, allFiles, rootPath);
    allEntryPoints.push(...entries);
  }

  return [...new Set(allEntryPoints)];
}

function categorizeModule(name: string): string {
  const lower = name.toLowerCase();
  if (['component', 'ui', 'view', 'page'].some(k => lower.includes(k))) return 'ui';
  if (['api', 'service', 'handler'].some(k => lower.includes(k))) return 'api';
  if (['util', 'helper', 'common', 'shared'].some(k => lower.includes(k))) return 'utility';
  if (['core', 'lib', 'engine'].some(k => lower.includes(k))) return 'core';
  if (['config', 'setting'].some(k => lower.includes(k))) return 'config';
  if (['test', 'spec'].some(k => lower.includes(k))) return 'test';
  return 'module';
}

function countCodeFiles(dirPath: string, excludeDirs: Set<string>): number {
  return walkFiles(dirPath, { extensions: getCodeExtensions(), excludeDirs }).length;
}

function discoverModules(rootPath: string, excludeDirs: Set<string>): ModuleInfo[] {
  const modules: ModuleInfo[] = [];
  const srcDirs = ['src', 'lib', 'packages', 'apps', 'modules', 'app', 'cmd', 'internal'];

  for (const srcDir of srcDirs) {
    const srcPath = path.join(rootPath, srcDir);
    if (!fs.existsSync(srcPath)) continue;

    try {
      const entries = fs.readdirSync(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !excludeDirs.has(entry.name)) {
          const fullPath = path.join(srcPath, entry.name);
          const fileCount = countCodeFiles(fullPath, excludeDirs);
          if (fileCount > 0) {
            modules.push({
              name: entry.name,
              path: path.relative(rootPath, fullPath).replace(/\\/g, '/'),
              files: fileCount,
              type: categorizeModule(entry.name),
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  // 如果没有找到明确的模块，尝试根目录下的主要目录 / If no explicit modules found, try major directories in root
  if (modules.length === 0) {
    try {
      const entries = fs.readdirSync(rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !excludeDirs.has(entry.name) && !entry.name.startsWith('.')) {
          const fullPath = path.join(rootPath, entry.name);
          const fileCount = countCodeFiles(fullPath, excludeDirs);
          if (fileCount > 0) {
            modules.push({
              name: entry.name,
              path: entry.name,
              files: fileCount,
              type: categorizeModule(entry.name),
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  return modules;
}

function findDocumentation(rootPath: string): string[] {
  const docPatterns = [
    'README.md', 'readme.md',
    'CHANGELOG.md', 'HISTORY.md', 'changelog.md',
    'CONTRIBUTING.md', 'ARCHITECTURE.md', 'DESIGN.md',
    'API.md', 'SECURITY.md', 'LICENSE', 'LICENSE.md',
  ];
  const docs: string[] = [];

  for (const pattern of docPatterns) {
    if (fs.existsSync(path.join(rootPath, pattern))) {
      docs.push(pattern);
    }
  }

  // docs/*.md
  const docsDir = path.join(rootPath, 'docs');
  if (fs.existsSync(docsDir)) {
    try {
      const files = fs.readdirSync(docsDir);
      for (const f of files) {
        if (f.endsWith('.md')) docs.push(`docs/${f}`);
      }
    } catch { /* ignore */ }
  }

  return docs;
}

function collectAllCodeFiles(rootPath: string, excludeDirs: Set<string>): string[] {
  return walkFiles(rootPath, { extensions: getCodeExtensions(), excludeDirs, relative: true });
}

export async function analyzeProject(projectRoot: string, saveToCache = true): Promise<ProjectAnalysis> {
  const excludeDirs = getExcludeDirs(projectRoot);
  const projectTypes = await detectProjectTypes(projectRoot);
  const entryPoints = await findEntryPoints(projectRoot, projectTypes, excludeDirs);
  const modules = discoverModules(projectRoot, excludeDirs);
  const docs = findDocumentation(projectRoot);
  const codeFiles = collectAllCodeFiles(projectRoot, excludeDirs);

  const result: ProjectAnalysis = {
    projectName: path.basename(projectRoot),
    projectType: projectTypes,
    entryPoints: entryPoints,
    modules,
    docsFound: docs,
    stats: {
      totalFiles: codeFiles.length,
      totalModules: modules.length,
      totalDocs: docs.length,
    },
    createdAt: new Date().toISOString(),
  };

  if (saveToCache) {
    const wikiDir = path.join(projectRoot, '.nium-wiki');
    if (fs.existsSync(wikiDir)) {
      saveCache(wikiDir, 'structure.json', result);
    }
  }

  return result;
}

export function printAnalysis(result: ProjectAnalysis): void {
  console.log(`📁 Project: ${result.projectName}`);
  console.log(`🔧 Tech Stack: ${result.projectType.join(', ') || 'Unknown'}`);
  console.log(
    `📊 Stats: ${result.stats.totalFiles} code files, ` +
    `${result.stats.totalModules} modules, ` +
    `${result.stats.totalDocs} docs`,
  );

  if (result.entryPoints.length) {
    console.log('\n🚀 Entry Points:');
    for (const entry of result.entryPoints) {
      console.log(`  - ${entry}`);
    }
  }

  if (result.modules.length) {
    console.log('\n📦 Modules:');
    for (const mod of result.modules.slice(0, 10)) {
      console.log(`  - ${mod.name} (${mod.files} files)`);
    }
  }

  if (result.docsFound.length) {
    console.log('\n📄 Existing Docs:');
    for (const doc of result.docsFound) {
      console.log(`  - ${doc}`);
    }
  }
}
