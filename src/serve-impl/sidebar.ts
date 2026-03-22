/**
 * Sidebar Generation: Recursively scan wiki directory, generate _sidebar.md
 * 侧边栏生成：递归扫描 wiki 目录，生成 _sidebar.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTocLabels, inferLangFromDir, type TocLabels } from '../utils/i18n';

/**
 * Extract H1 title from markdown file / 从 markdown 文件提取 H1 标题
 */
function extractTitle(filePath: string, labels: TocLabels): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.substring(2).trim();
      }
    }
  } catch { /* ignore */ }
  const base = path.basename(filePath, '.md');
  if (base === '_index' || base === 'index') return labels.overview;
  return base.replace(/[-_]/g, ' ');
}

/**
 * Recursively scan wiki directory, generate _sidebar.md content
 * 递归扫描 wiki 目录，生成 _sidebar.md 内容
 */
export function generateSidebarMd(wikiDir: string, lang?: string): string {
  const resolvedLang = lang ?? inferLangFromDir(wikiDir);
  const labels = getTocLabels(resolvedLang);
  const lines: string[] = [];

  // 顶层固定文档（按优先级排列）
  const topDocs: Array<[string, keyof TocLabels]> = [
    ['index.md', 'home'],
    ['architecture.md', 'architecture'],
    ['getting-started.md', 'gettingStarted'],
    ['doc-map.md', 'docMap'],
  ];

  for (const [filename, labelKey] of topDocs) {
    const filePath = path.join(wikiDir, filename);
    if (fs.existsSync(filePath)) {
      const title = extractTitle(filePath, labels) || labels[labelKey];
      const link = filename === 'index.md' ? '/' : `/${filename}`;
      lines.push(`- [${title}](${link})`);
    }
  }

  // 收集子目录和剩余的顶层 .md 文件
  const topLevelMdHandled = new Set(topDocs.map(d => d[0]));
  topLevelMdHandled.add('_sidebar.md');
  topLevelMdHandled.add('_navbar.md');
  topLevelMdHandled.add('.nojekyll');

  try {
    const entries = fs.readdirSync(wikiDir, { withFileTypes: true });

    // 剩余顶层 .md 文件
    const extraMds = entries
      .filter(e => e.isFile() && e.name.endsWith('.md') && !topLevelMdHandled.has(e.name) && !e.name.startsWith('_'))
      .map(e => e.name)
      .sort();

    for (const md of extraMds) {
      const title = extractTitle(path.join(wikiDir, md), labels);
      lines.push(`- [${title}](/${md})`);
    }

    // 子目录
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'assets')
      .map(e => e.name)
      .sort();

    for (const dir of dirs) {
      const dirPath = path.join(wikiDir, dir);
      const dirLabel = getDirLabel(dir, labels);
      lines.push(`- ${dirLabel}`);
      buildSidebarRecursive(dirPath, dir, lines, 1, labels);
    }
  } catch { /* ignore */ }

  return lines.join('\n') + '\n';
}

/**
 * Map directory name to display label / 目录名到显示标签的映射
 */
function getDirLabel(dirName: string, labels: TocLabels): string {
  const keyMap: Record<string, keyof TocLabels> = {
    modules: 'modules',
    api: 'api',
    guides: 'guides',
    design: 'design',
  };
  const key = keyMap[dirName.toLowerCase()];
  return key ? labels[key] : dirName;
}

/**
 * Recursively build sidebar entries / 递归构建侧边栏条目
 */
function buildSidebarRecursive(dirPath: string, relDir: string, lines: string[], depth: number, labels: TocLabels): void {
  const indent = '  '.repeat(depth);

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // _index.md 作为目录概述
    const indexPath = path.join(dirPath, '_index.md');
    if (fs.existsSync(indexPath)) {
      const title = extractTitle(indexPath, labels);
      lines.push(`${indent}- [${title}](/${relDir}/_index.md)`);
    }

    // .md 文件（排除 _index.md）
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== '_index.md' && !e.name.startsWith('_'))
      .map(e => e.name)
      .sort();

    for (const md of mdFiles) {
      const title = extractTitle(path.join(dirPath, md), labels);
      lines.push(`${indent}- [${title}](/${relDir}/${md})`);
    }

    // 子目录
    const subDirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'assets')
      .map(e => e.name)
      .sort();

    for (const sub of subDirs) {
      const subPath = path.join(dirPath, sub);
      const subRel = `${relDir}/${sub}`;
      const label = getDirLabel(sub, labels);
      lines.push(`${indent}- ${label}`);
      buildSidebarRecursive(subPath, subRel, lines, depth + 1, labels);
    }
  } catch { /* ignore */ }
}
