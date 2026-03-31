/**
 * Documentation Index Building Module
 * 文档索引构建模块
 * Builds bidirectional mapping between source files and Wiki documents
 * 构建源文件 ↔ Wiki 文档的双向映射
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index';
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
 * Parse source file references from markdown content
 * 从 markdown 内容中解析源文件引用
 * Matches project-root-relative paths in format [label](/src/path#L1-L100)
 * and relative paths [label](../src/path) and import statements in code blocks
 */
export function parseSourceReferences(
  mdContent: string,
  projectRoot: string,
): SourceReference[] {
  const refs: SourceReference[] = [];
  const seen = new Set<string>();

  function addRef(file: string, lineStart?: number, lineEnd?: number) {
    const key = `${file}:${lineStart}-${lineEnd}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Skip example/template paths
    if (
      file.startsWith('src/source.ts') ||
      file.startsWith('src/file.ts') ||
      file.startsWith('src/diagram.ts') ||
      file.startsWith('path/to/') ||
      file.includes('example') ||
      file.includes('template')
    ) {
      return;
    }

    refs.push({ file, lineStart, lineEnd });
  }

  // Strategy 1: Standard absolute paths [label](/src/path#L1-L100)
  const absPattern = /\[.*?\]\(\/((?:src|lib|app|packages)\/.+?)(?:#L(\d+)(?:-L(\d+))?)?\)/g;
  let match: RegExpExecArray | null;
  while ((match = absPattern.exec(mdContent)) !== null) {
    const rawPath = match[1];
    addRef(rawPath, match[2] ? parseInt(match[2], 10) : undefined, match[3] ? parseInt(match[3], 10) : undefined);
  }

  // Strategy 2: Relative paths [label](../src/path) or [label](./src/path)
  // These need conversion to absolute paths relative to project root
  const relPattern = /\[.*?\]\(\.\.?\/((?:src|lib|app|packages)\/.+?)(?:#L(\d+)(?:-L(\d+))?)?\)/g;
  while ((match = relPattern.exec(mdContent)) !== null) {
    const rawPath = match[1];
    addRef(rawPath, match[2] ? parseInt(match[2], 10) : undefined, match[3] ? parseInt(match[3], 10) : undefined);
  }

  // Strategy 3: Import statements inside code blocks (semantic references)
  // e.g. `import { x } from '@/core/foo'` or `from './foo'`
  const codeBlockPattern = /```(?:typescript|javascript|typescript\n[\s\S]*?)\n([\s\S]*?)```/g;
  while ((match = codeBlockPattern.exec(mdContent)) !== null) {
    const codeContent = match[1];
    // Match various import syntaxes
    const importPatterns = [
      /import\s+.*?from\s+['"]((?:src|lib|app|packages)\/[^'"]+)['"]/g,
      /import\s+['"]((?:src|lib|app|packages)\/[^'"]+)['"]/g,
      /from\s+['"]((?:src|lib|app|packages)\/[^'"]+)['"]/g,
    ];
    for (const impPattern of importPatterns) {
      let impMatch;
      while ((impMatch = impPattern.exec(codeContent)) !== null) {
        addRef(impMatch[1]);
      }
    }
  }

  return refs;
}

/**
 * Infer source file corresponding document path via naming convention
 * 通过命名约定推断源文件对应的文档路径
 * camelCase.ts → modules/kebab-case.md
 * Dynamically gets supported extensions from language handlers
 * 动态从语言处理器获取支持的扩展名
 */
export function inferDocPath(sourceFile: string): string | null {
  const allExtensions = languageHandlerManager.getAllSourceExtensions();
  const extPattern = allExtensions.map(e => e.replace('.', '\\.')).join('|');
  // Support nested paths: src/core/analyzeProject.ts → modules/core/analyze-project.md
  const regex = new RegExp(`^src[/\\\\](.+?)\\.(${extPattern})$`, 'i');
  const match = sourceFile.match(regex);
  if (!match) return null;
  const fullPath = match[1]; // e.g. "core/analyzeProject" or "core/impl/diff"
  const dirPart = path.dirname(fullPath);
  const baseName = path.basename(fullPath);

  const kebab = baseName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

  if (dirPart === '.') {
    return `modules/${kebab}.md`;
  }
  return `modules/${dirPart.replace(/\\/g, '/')}/${kebab}.md`;
}

/**
 * Build documentation index: scan wiki dirs, parse source file references, build bidirectional mapping
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

      const sourceFiles = [...new Set(refs.map(r => r.file))].filter(f => !f.endsWith('/'));
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
 * For source files without explicit mapping, supplement via naming convention inference
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
    // Only create mapping if inferred document actually exists / 仅当推断的文档确实存在时才建立映射
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
