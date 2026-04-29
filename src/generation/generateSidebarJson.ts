/**
 * Sidebar JSON Generation: Scan wiki directory, generate sidebar.json
 * 侧边栏 JSON 生成：扫描 wiki 目录，生成 sidebar.json
 *
 * sidebar.json is the canonical source of truth for sidebar structure.
 * It is language-agnostic:
 *   - page items: text is the H1 title from the markdown file (language-specific content)
 *   - group items: dirName is the canonical directory name; display text is resolved at render time
 *     using folder-aliases.json (so sidebar.json needs no language-specific content)
 *
 * sidebar.json 是侧边栏结构的规范数据源。与语言无关：
 *   - page 条目：text 是从 markdown 文件提取的 H1 标题（语言相关的内容）
 *   - group 条目：dirName 是规范目录名；显示文本在渲染时通过 folder-aliases.json 解析
 */

import * as fs from 'fs';
import * as path from 'path';
import { getTocLabels, inferLangFromDir, getPrimaryLangFromConfig } from '../utils/i18n';

export interface SidebarItem {
  /** Display text: for pages, the H1 title from the markdown file. For groups, may be empty — server resolves from folder-aliases.json */
  text: string;
  /** Canonical directory name (groups only) */
  dirName?: string;
  /** docsify route path, e.g. /modules/auth.md or / for index — page items only */
  link?: string;
  /** page = leaf link; group = collapsible section with children */
  type: 'page' | 'group';
  children?: SidebarItem[];
  collapsed?: boolean;
  order?: number;
}

export interface SidebarJson {
  items: SidebarItem[];
}

export interface FolderAliases {
  [dirName: string]: {
    [lang: string]: string;
  } | undefined;
}

// ─────────────────────────────────────────────
// Fixed top-level docs (deterministic order)
// ─────────────────────────────────────────────

const TOP_DOCS: Array<{ filename: string; labelKey: keyof ReturnType<typeof getTocLabels>; order: number }> = [
  { filename: 'index.md',           labelKey: 'home',           order: 0 },
  { filename: 'architecture.md',    labelKey: 'architecture',   order: 1 },
  { filename: 'getting-started.md', labelKey: 'gettingStarted', order: 2 },
  { filename: 'doc-map.md',         labelKey: 'docMap',         order: 3 },
];

// ─────────────────────────────────────────────
// Directory default sort order
// ─────────────────────────────────────────────

const KNOWN_DIR_ORDER: Record<string, number> = {
  modules: 10,
  api: 20,
  guides: 30,
  design: 40,
};

// ─────────────────────────────────────────────
// Title extraction (language-specific, for page items)
// ─────────────────────────────────────────────

function extractTitle(filePath: string, fallback: string): string {
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
  if (base === '_index' || base === 'index') return fallback;
  return base.replace(/[-_]/g, ' ');
}

// ─────────────────────────────────────────────
// Scan helpers
// ─────────────────────────────────────────────

function listDirs(wikiDir: string): string[] {
  try {
    return fs.readdirSync(wikiDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'assets')
      .map(e => e.name)
      .sort((a, b) => {
        const oa = KNOWN_DIR_ORDER[a] ?? 999;
        const ob = KNOWN_DIR_ORDER[b] ?? 999;
        return oa !== ob ? oa - ob : a.localeCompare(b);
      });
  } catch {
    return [];
  }
}

function listMds(wikiDir: string, exclude = new Set<string>()): string[] {
  try {
    return fs.readdirSync(wikiDir, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_') && !exclude.has(e.name))
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Build items recursively (language-agnostic for groups)
// ─────────────────────────────────────────────

function buildItems(
  dir: string,
  relDir: string,
  lang: string,
  labels: ReturnType<typeof getTocLabels>,
): SidebarItem[] {
  const items: SidebarItem[] = [];

  // _index.md as directory overview (page item)
  const indexPath = path.join(dir, '_index.md');
  if (fs.existsSync(indexPath)) {
    const title = extractTitle(indexPath, labels.overview);
    items.push({ text: title, link: `/${relDir}/_index.md`, type: 'page' });
  }

  // Remaining .md files
  const skipSet = new Set(['_index.md']);
  const topHandled = new Set(TOP_DOCS.map(d => d.filename));

  for (const md of listMds(dir, skipSet)) {
    // Skip top-level fixed docs (handled at root level)
    if (relDir === '' && topHandled.has(md)) continue;
    const filePath = path.join(dir, md);
    const title = extractTitle(filePath, md.replace(/\.md$/, ''));
    const link = relDir === '' ? `/${md}` : `/${relDir}/${md}`;
    items.push({ text: title, link, type: 'page' });
  }

  // Subdirectories (groups)
  for (const sub of listDirs(dir)) {
    const subDir = path.join(dir, sub);
    const subRel = relDir === '' ? sub : `${relDir}/${sub}`;
    const subItems = buildItems(subDir, subRel, lang, labels);
    if (subItems.length === 0) continue;

    const order = KNOWN_DIR_ORDER[sub];
    items.push({
      // text is resolved at render time from folder-aliases.json — leave empty here
      text: '',
      dirName: sub,
      type: 'group',
      collapsed: false,
      order,
      children: subItems,
    });
  }

  return items;
}

// ─────────────────────────────────────────────
// Load folder-aliases.json
// ─────────────────────────────────────────────

export function loadFolderAliases(wikiDir: string): FolderAliases {
  const aliasPath = path.join(wikiDir, 'folder-aliases.json');
  if (fs.existsSync(aliasPath)) {
    try {
      return JSON.parse(fs.readFileSync(aliasPath, 'utf-8'));
    } catch { /* ignore */ }
  }
  return {};
}

// ─────────────────────────────────────────────
// Resolve a group item's display text for a given language
// ─────────────────────────────────────────────

export function resolveGroupLabel(
  item: SidebarItem,
  lang: string,
  aliases: FolderAliases,
): string {
  if (!item.dirName) return item.text || '';

  // 1. folder-aliases.json
  const aliasMap = aliases[item.dirName];
  if (aliasMap && aliasMap[lang]) return aliasMap[lang];

  // 2. Built-in known directory labels (look up via getTocLabels)
  const keyMap: Record<string, keyof ReturnType<typeof getTocLabels>> = {
    modules: 'modules',
    api: 'api',
    guides: 'guides',
    design: 'design',
  };
  const key = keyMap[item.dirName];
  if (key) {
    const labels = getTocLabels(lang);
    return (labels[key] as string) ?? item.dirName;
  }

  return item.dirName;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Scan wiki directory and generate language-agnostic sidebar.json content.
 * Groups have empty text; the server resolves display text at render time.
 *
 * 扫描 wiki 目录，生成语言无关的 sidebar.json 内容。
 * group 条目的 text 为空；server 在渲染时解析显示文本。
 */
export function generateSidebarJson(wikiDir: string, lang?: string): string {
  const resolvedLang = lang ?? getPrimaryLangFromConfig(wikiDir) ?? inferLangFromDir(wikiDir);
  const labels = getTocLabels(resolvedLang);
  const items: SidebarItem[] = [];

  // ── Top-level fixed docs ───────────────────
  for (const { filename, labelKey, order } of TOP_DOCS) {
    const filePath = path.join(wikiDir, filename);
    if (!fs.existsSync(filePath)) continue;

    const title = extractTitle(filePath, labels[labelKey] as string);
    const link = filename === 'index.md' ? '/' : `/${filename}`;
    items.push({ text: title, link, type: 'page', order });
  }

  // ── Remaining top-level .md files ────────────
  const topHandled = new Set(TOP_DOCS.map(d => d.filename));
  for (const md of listMds(wikiDir, topHandled)) {
    const filePath = path.join(wikiDir, md);
    const title = extractTitle(filePath, md.replace(/\.md$/, ''));
    items.push({ text: title, link: `/${md}`, type: 'page' });
  }

  // ── Subdirectories (groups) ──────────────────
  for (const dir of listDirs(wikiDir)) {
    const dirPath = path.join(wikiDir, dir);
    const subItems = buildItems(dirPath, dir, resolvedLang, labels);
    if (subItems.length === 0) continue;

    const order = KNOWN_DIR_ORDER[dir];
    items.push({
      text: '',
      dirName: dir,
      type: 'group',
      collapsed: false,
      order,
      children: subItems,
    });
  }

  return JSON.stringify({ items }, null, 2);
}

/**
 * Write sidebar.json to disk.
 *
 * 将 sidebar.json 写入磁盘。
 */
export function writeSidebarJson(wikiDir: string, lang?: string): void {
  const content = generateSidebarJson(wikiDir, lang);
  fs.writeFileSync(path.join(wikiDir, 'sidebar.json'), content, 'utf-8');
}

// ─────────────────────────────────────────────
// Parse legacy _sidebar.md to SidebarItem[]
// ─────────────────────────────────────────────

/** Infer dirName from a child link path, e.g. /modules/auth.md → modules */
function inferDirName(link: string): string {
  const match = link.match(/^\/([^/]+)/);
  return match ? match[1] : '';
}

interface ParsedLine {
  depth: number;
  text: string;
  link: string | null;
}

/** Parse a single line of markdown sidebar list */
function parseLine(line: string): ParsedLine | null {
  const m = line.match(/^(\s*)- (.*)/);
  if (!m) return null;
  const depth = Math.floor(m[1].length / 2); // 2 spaces = depth 1
  const body = m[2].trim();

  // Page item: - [text](link)
  const linkMatch = body.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (linkMatch) {
    return { depth, text: linkMatch[1], link: linkMatch[2] };
  }

  // Group item: - GroupName (no link)
  return { depth, text: body, link: null };
}

/** Convert parsed lines into a tree of SidebarItem[] */
function buildTreeFromLines(lines: ParsedLine[]): SidebarItem[] {
  const result: SidebarItem[] = [];
  const stack: Array<{ item: SidebarItem; depth: number }> = [];

  for (const line of lines) {
    const item: SidebarItem = line.link
      ? { text: line.text, link: line.link, type: 'page' }
      : { text: line.text, dirName: '', type: 'group', collapsed: false, children: [] };

    // For groups, infer dirName from first child's link later (done below)
    if (!line.link) {
      // Infer dirName from the first descendant page we find
      // We do a two-pass: first pass we don't know children yet, so we mark it
      // A simpler approach: infer from a known group name or just use empty
    }

    // Pop stack until we find a parent at depth - 1
    while (stack.length > 0 && stack[stack.length - 1].depth >= line.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      result.push(item);
    } else {
      const parent = stack[stack.length - 1].item;
      if (!parent.children) parent.children = [];
      parent.children.push(item);
    }

    if (item.type === 'group') {
      stack.push({ item, depth: line.depth });
    }
  }

  return result;
}

/**
 * Infer dirName for group items by looking at their first child's link.
 * Must be called after buildTreeFromLines.
 */
function inferGroupDirNames(items: SidebarItem[]): void {
  for (const item of items) {
    if (item.type === 'group') {
      if (item.children && item.children.length > 0) {
        const firstChild = item.children[0];
        if (firstChild.link) {
          item.dirName = inferDirName(firstChild.link);
        }
      }
      inferGroupDirNames(item.children ?? []);
    }
  }
}

/**
 * Parse legacy _sidebar.md markdown content into SidebarItem[].
 * Used for migrating from _sidebar.md to sidebar.json.
 *
 * 解析旧版 _sidebar.md markdown 内容为 SidebarItem[]。
 * 用于从 _sidebar.md 迁移到 sidebar.json。
 */
export function parseSidebarMarkdown(markdown: string): SidebarItem[] {
  const lines = markdown.split('\n');
  const parsed: ParsedLine[] = [];

  for (const line of lines) {
    const parsedLine = parseLine(line.trim());
    if (parsedLine) parsed.push(parsedLine);
  }

  const items = buildTreeFromLines(parsed);
  inferGroupDirNames(items);
  return items;
}

/**
 * Write sidebar.json from a parsed SidebarItem[] array (migration path).
 * Replaces existing _sidebar.md.
 *
 * 将 SidebarItem[] 写入 sidebar.json（迁移路径）。
 * 同时删除旧的 _sidebar.md。
 */
export function migrateFromSidebarMd(wikiDir: string, markdown: string): void {
  const items = parseSidebarMarkdown(markdown);
  const json: SidebarJson = { items };
  const sidebarJsonPath = path.join(wikiDir, 'sidebar.json');
  const legacyPath = path.join(wikiDir, '_sidebar.md');

  fs.writeFileSync(sidebarJsonPath, JSON.stringify(json, null, 2), 'utf-8');

  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
  }
}
