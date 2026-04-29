/**
 * Sidebar Server Module: Read sidebar.json, resolve language aliases,
 * render to docsify-compatible markdown format.
 *
 * 侧边栏服务模块：读取 sidebar.json，解析语言别名，渲染为 docsify 兼容的 markdown 格式。
 *
 * Does NOT write any files to disk. All output is in-memory.
 * 不向磁盘写入任何文件，所有输出均在内存中。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  type SidebarItem,
  type SidebarJson,
  type FolderAliases,
  loadFolderAliases,
  resolveGroupLabel,
} from '../generation/generateSidebarJson';
import { getTocLabels } from '../utils/i18n';

// ─────────────────────────────────────────────
// Markdown rendering
// ─────────────────────────────────────────────

/**
 * Render a SidebarItem to markdown lines (recursive).
 */
function renderItem(item: SidebarItem, depth: number, lang: string, aliases: FolderAliases): string[] {
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  if (item.type === 'group') {
    const label = resolveGroupLabel(item, lang, aliases) || item.dirName || 'Group';
    if (depth === 0) {
      lines.push(`- ${label}`);
    } else {
      lines.push(`${indent}- ${label}`);
    }
    if (item.children) {
      for (const child of item.children) {
        lines.push(...renderItem(child, depth + 1, lang, aliases));
      }
    }
  } else {
    // page item
    const text = item.text || item.link || 'Page';
    const link = item.link || '/';
    if (depth === 0) {
      lines.push(`- [${text}](${link})`);
    } else {
      lines.push(`${indent}- [${text}](${link})`);
    }
  }

  return lines;
}

/**
 * Render full sidebar.json to docsify-compatible markdown string.
 */
export function renderSidebarToMarkdown(items: SidebarItem[], lang: string, aliases: FolderAliases): string {
  const lines: string[] = [];
  for (const item of items) {
    lines.push(...renderItem(item, 0, lang, aliases));
  }
  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────
// Sidebar loading
// ─────────────────────────────────────────────

/**
 * Read and parse sidebar.json from a wiki directory.
 * Returns null if the file does not exist.
 */
export function loadSidebarJson(wikiDir: string): SidebarJson | null {
  const jsonPath = path.join(wikiDir, 'sidebar.json');
  if (!fs.existsSync(jsonPath)) return null;
  try {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.items)) return parsed as SidebarJson;
    if (Array.isArray(parsed)) return { items: parsed as SidebarItem[] }; // legacy flat array
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the full sidebar markdown for a given wiki directory and language.
 * Uses sidebar.json if available; falls back to null (caller handles legacy).
 *
 * 返回渲染后的 markdown 字符串，或 null 表示需要 fallback 到旧逻辑。
 */
export function getSidebarMarkdown(wikiDir: string, lang: string): string | null {
  const aliases = loadFolderAliases(wikiDir);
  const sidebarJson = loadSidebarJson(wikiDir);
  if (!sidebarJson) return null;

  return renderSidebarToMarkdown(sidebarJson.items, lang, aliases);
}
