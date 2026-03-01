/**
 * 文档索引构建模块
 * 构建源文件 ↔ Wiki 文档的双向映射
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index.js';
import { walkFiles } from '../utils/fileWalker';
import { loadCache, saveCache } from '../utils/cache';

export interface SourceReference {
  file: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface DocIndex {
  sourceToDoc: Record<string, string[]>;
  docToSources: Record<string, string[]>;
  createdAt: string;
}

/**
 * 从 markdown 内容中解析源文件引用
 * 匹配 [label](/src/path#L1-L100) 格式的项目根相对路径
 */
export function parseSourceReferences(
  mdContent: string,
  _projectRoot: string,
): SourceReference[] {
  const refs: SourceReference[] = [];
  // 匹配 [label](/src/path#L1-L100) 格式
  const pattern = /\[.*?\]\(\/((?:src|lib|app|packages)\/.+?)(?:#L(\d+)(?:-L(\d+))?)?\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(mdContent)) !== null) {
    const rawPath = match[1];

    // 跳过示例/模板路径
    if (rawPath.startsWith('src/source.ts') || rawPath.startsWith('src/file.ts') ||
        rawPath.startsWith('src/diagram.ts') || rawPath.startsWith('path/to/')) {
      continue;
    }

    refs.push({
      file: rawPath,
      lineStart: match[2] ? parseInt(match[2], 10) : undefined,
      lineEnd: match[3] ? parseInt(match[3], 10) : undefined,
    });
  }

  return refs;
}

/**
 * 通过命名约定推断源文件对应的文档路径
 * camelCase.ts → modules/kebab-case.md
 * 动态从语言处理器获取支持的扩展名
 */
export function inferDocPath(sourceFile: string): string | null {
  // 动态构建扩展名匹配模式
  const allExtensions = languageHandlerManager.getAllSourceExtensions();
  const extPattern = allExtensions.map(e => e.replace('.', '\\.')).join('|');
  // 仅处理 src/ 下的顶层源文件
  const regex = new RegExp(`^src/([^/]+)(${extPattern})$`);
  const match = sourceFile.match(regex);
  if (!match) return null;
  const baseName = match[1];
  const kebab = baseName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return `modules/${kebab}.md`;
}

/**
 * 构建文档索引：扫描 wiki 目录，解析源文件引用，构建双向映射
 */
export function buildDocIndex(projectRoot: string): DocIndex {
  const wikiDir = path.join(projectRoot, '.nium-wiki', 'wiki');
  const sourceToDoc: Record<string, string[]> = {};
  const docToSources: Record<string, string[]> = {};

  if (fs.existsSync(wikiDir)) {
    const mdFiles = walkFiles(wikiDir, { extensions: ['.md'] });

    for (const mdFile of mdFiles) {
      const content = fs.readFileSync(mdFile, 'utf-8');
      const relDoc = path.relative(wikiDir, mdFile).replace(/\\/g, '/');
      const refs = parseSourceReferences(content, projectRoot);

      const sourceFiles = [...new Set(refs.map(r => r.file))];
      if (sourceFiles.length > 0) {
        docToSources[relDoc] = sourceFiles;
      }

      for (const src of sourceFiles) {
        if (!sourceToDoc[src]) sourceToDoc[src] = [];
        if (!sourceToDoc[src].includes(relDoc)) {
          sourceToDoc[src].push(relDoc);
        }
      }
    }
  }

  return {
    sourceToDoc,
    docToSources,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 对没有显式映射的源文件，通过命名约定补充推断
 */
export function enrichWithInference(
  index: DocIndex,
  sourceFiles: string[],
  wikiDir: string,
): void {
  for (const src of sourceFiles) {
    if (index.sourceToDoc[src] && index.sourceToDoc[src].length > 0) continue;
    const inferred = inferDocPath(src);
    if (!inferred) continue;
    // 仅当推断的文档确实存在时才建立映射
    const fullPath = path.join(wikiDir, inferred);
    if (!fs.existsSync(fullPath)) continue;

    if (!index.sourceToDoc[src]) index.sourceToDoc[src] = [];
    index.sourceToDoc[src].push(inferred);

    if (!index.docToSources[inferred]) index.docToSources[inferred] = [];
    if (!index.docToSources[inferred].includes(src)) {
      index.docToSources[inferred].push(src);
    }
  }
}

export function saveDocIndex(projectRoot: string, index: DocIndex): void {
  const wikiDir = path.join(projectRoot, '.nium-wiki');
  saveCache(wikiDir, 'doc-index.json', index);
}

export function loadDocIndex(projectRoot: string): DocIndex | null {
  const wikiDir = path.join(projectRoot, '.nium-wiki');
  return loadCache<DocIndex | null>(wikiDir, 'doc-index.json', null);
}
