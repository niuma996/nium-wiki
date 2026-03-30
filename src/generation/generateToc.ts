/**
 * Table of Contents Generation Module
 * 目录生成模块
 * Generates navigation TOC for wiki
 * 为 wiki 生成导航目录
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTocLabels, inferLangFromDir, getPrimaryLangFromConfig } from '../utils/i18n';

function extractTitleFromMarkdown(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        return trimmed.substring(2).trim();
      }
    }
    return path.basename(filePath, '.md').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return path.basename(filePath, '.md');
  }
}

function listMdFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .sort();
  } catch {
    return [];
  }
}

export function generateToc(wikiDir: string, baseUrl = '/', lang?: string): string {
  const wikiPath = wikiDir;
  const resolvedLang = lang ?? getPrimaryLangFromConfig(wikiPath) ?? inferLangFromDir(wikiPath);

  if (!fs.existsSync(wikiPath)) {
    const labels = getTocLabels(resolvedLang);
    return labels.empty;
  }

  const labels = getTocLabels(resolvedLang);
  const tocLines = [`# ${labels.toc}\n`];

  // 主要文档
  const mainDocs: Array<[string, keyof typeof labels]> = [
    ['index.md', 'home'],
    ['getting-started.md', 'gettingStarted'],
    ['architecture.md', 'architecture'],
    ['configuration.md', 'configuration'],
  ];

  for (const [filename, labelKey] of mainDocs) {
    const filePath = path.join(wikiPath, filename);
    if (fs.existsSync(filePath)) {
      const title = extractTitleFromMarkdown(filePath) || labels[labelKey];
      tocLines.push(`- [${title}](${baseUrl}${filename})`);
    }
  }

  tocLines.push('');

  // 模块文档
  const modulesDir = path.join(wikiPath, 'modules');
  if (fs.existsSync(modulesDir)) {
    tocLines.push(`## ${labels.modules}\n`);
    for (const mdFile of listMdFiles(modulesDir)) {
      if (mdFile !== 'index.md' && mdFile !== '_index.md') {
        const title = extractTitleFromMarkdown(path.join(modulesDir, mdFile));
        tocLines.push(`- [${title}](${baseUrl}modules/${mdFile})`);
      }
    }
    tocLines.push('');
  }

  // API 文档
  const apiDir = path.join(wikiPath, 'api');
  if (fs.existsSync(apiDir)) {
    tocLines.push(`## ${labels.api}\n`);
    for (const mdFile of listMdFiles(apiDir)) {
      if (mdFile !== 'index.md' && mdFile !== '_index.md') {
        const title = extractTitleFromMarkdown(path.join(apiDir, mdFile));
        tocLines.push(`- [${title}](${baseUrl}api/${mdFile})`);
      }
    }
    tocLines.push('');
  }

  // 指南文档
  const guidesDir = path.join(wikiPath, 'guides');
  if (fs.existsSync(guidesDir)) {
    tocLines.push(`## ${labels.guides}\n`);
    for (const mdFile of listMdFiles(guidesDir)) {
      const title = extractTitleFromMarkdown(path.join(guidesDir, mdFile));
      tocLines.push(`- [${title}](${baseUrl}guides/${mdFile})`);
    }
    tocLines.push('');
  }

  // 设计文档
  const designDir = path.join(wikiPath, 'design');
  if (fs.existsSync(designDir)) {
    tocLines.push(`## ${labels.design}\n`);
    for (const mdFile of listMdFiles(designDir)) {
      const title = extractTitleFromMarkdown(path.join(designDir, mdFile));
      tocLines.push(`- [${title}](${baseUrl}design/${mdFile})`);
    }
  }

  return tocLines.join('\n');
}

interface SidebarItem {
  text: string;
  link: string;
}

export function generateSidebar(wikiDir: string, lang?: string): string {
  const resolvedLang = lang ?? getPrimaryLangFromConfig(wikiDir) ?? inferLangFromDir(wikiDir);
  const labels = getTocLabels(resolvedLang);

  const sidebar: Record<string, SidebarItem[]> = {
    '/': [
      { text: labels.home, link: '/' },
      { text: labels.gettingStarted, link: '/getting-started' },
      { text: labels.architecture, link: '/architecture' },
    ],
  };

  const modulesDir = path.join(wikiDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    const moduleItems: SidebarItem[] = [];
    for (const mdFile of listMdFiles(modulesDir)) {
      if (mdFile !== 'index.md' && mdFile !== '_index.md') {
        const title = extractTitleFromMarkdown(path.join(modulesDir, mdFile));
        moduleItems.push({
          text: title,
          link: `/modules/${path.basename(mdFile, '.md')}`,
        });
      }
    }
    if (moduleItems.length) {
      sidebar['/modules/'] = moduleItems;
    }
  }

  return JSON.stringify(sidebar, null, 2);
}
