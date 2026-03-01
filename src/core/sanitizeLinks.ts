/**
 * Wiki 链接路径清洗模块 / Wiki link path sanitizer
 * 遍历 wiki 目录，将 file:// 绝对路径和裸绝对路径替换为项目根相对路径
 * Scans wiki .md files and converts absolute paths to project-root-relative paths
 */

import * as fs from 'fs';
import * as path from 'path';
import { walkFiles } from '../utils/fileWalker';

export interface SanitizeResult {
  /** 扫描的文件数 / Total files scanned */
  totalFiles: number;
  /** 修改的文件数 / Files that were modified */
  modifiedFiles: number;
  /** 总替换次数 / Total replacements made */
  totalReplacements: number;
  /** 每个文件的替换详情 / Per-file details */
  details: { file: string; replacements: number }[];
}

/**
 * 清洗单个 markdown 文件中的链接路径 / Sanitize link paths in a single markdown string
 * 处理三种情况：
 * 1. file:///absolute/path/to/project/src/foo.ts → /src/foo.ts
 * 2. 裸绝对路径 /Users/.../project/src/foo.ts → /src/foo.ts (在 markdown 链接内)
 * 3. 缺少 / 前缀的相对路径 (src/foo.ts) → (/src/foo.ts)
 */
export function sanitizeContent(content: string, projectRoot: string): { result: string; count: number } {
  let count = 0;
  const normalizedRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');

  // Pattern 1: file:// URI in markdown links
  // [label](file:///Users/x/project/src/foo.ts#L1-L50)
  let result = content.replace(
    /(\[.*?\]\()file:\/\/\/(.*?)((?:#[^)]*)?)\)/g,
    (_match, prefix: string, absPath: string, fragment: string) => {
      const normalized = '/' + absPath;
      const idx = normalized.indexOf(normalizedRoot);
      if (idx !== -1) {
        const relative = normalized.slice(idx + normalizedRoot.length);
        count++;
        return `${prefix}${relative}${fragment})`;
      }
      return _match;
    },
  );

  // Pattern 2: bare absolute paths in markdown links (non-file:// but still absolute)
  // [label](/Users/x/project/src/foo.ts#L1-L50)
  const absPathPattern = new RegExp(
    `(\\[.*?\\]\\()${escapeRegex(normalizedRoot)}(/[^)]*\\))`,
    'g',
  );
  result = result.replace(absPathPattern, (_match, prefix: string, rest: string) => {
    count++;
    return `${prefix}${rest}`;
  });

  // Pattern 3: relative source paths missing leading /
  // [label](src/foo.ts#L1-L50) → [label](/src/foo.ts#L1-L50)
  // Also handles lib/, app/, packages/ prefixes
  result = result.replace(
    /(\[.*?\]\()((?:src|lib|app|packages)\/[^)]+\))/g,
    (_match, prefix: string, relPath: string) => {
      count++;
      return `${prefix}/${relPath}`;
    },
  );

  return { result, count };
}

/**
 * 遍历 wiki 目录，清洗所有 .md 文件中的链接路径
 * Scan all .md files in wiki dirs and sanitize link paths
 */
export function sanitizeLinks(projectRoot: string): SanitizeResult {
  const niumWikiDir = path.join(projectRoot, '.nium-wiki');
  const details: { file: string; replacements: number }[] = [];
  let totalFiles = 0;
  let modifiedFiles = 0;
  let totalReplacements = 0;

  // 扫描 wiki/ 和所有 wiki_*/ 目录 / Scan wiki/ and all wiki_*/ dirs
  const wikiDirs: string[] = [];
  const mainWiki = path.join(niumWikiDir, 'wiki');
  if (fs.existsSync(mainWiki)) wikiDirs.push(mainWiki);

  try {
    for (const entry of fs.readdirSync(niumWikiDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('wiki_')) {
        wikiDirs.push(path.join(niumWikiDir, entry.name));
      }
    }
  } catch { /* ignore */ }

  for (const wikiDir of wikiDirs) {
    const mdFiles = walkFiles(wikiDir, { extensions: ['.md'] });

    for (const mdFile of mdFiles) {
      totalFiles++;
      const content = fs.readFileSync(mdFile, 'utf-8');
      const { result, count } = sanitizeContent(content, projectRoot);

      if (count > 0) {
        fs.writeFileSync(mdFile, result, 'utf-8');
        modifiedFiles++;
        totalReplacements += count;
        const relPath = path.relative(niumWikiDir, mdFile).replace(/\\/g, '/');
        details.push({ file: relPath, replacements: count });
      }
    }
  }

  return { totalFiles, modifiedFiles, totalReplacements, details };
}

export function printSanitizeResult(result: SanitizeResult): void {
  if (result.totalReplacements === 0) {
    console.log(`✅ Scanned ${result.totalFiles} files, no invalid paths found`);
    return;
  }

  console.log(`🔧 Sanitized ${result.totalReplacements} link(s) in ${result.modifiedFiles} file(s):`);
  for (const d of result.details) {
    console.log(`   ${d.file} (${d.replacements} replaced)`);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
