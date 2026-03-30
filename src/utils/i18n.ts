/**
 * i18n - 多语言文档管理 / Multi-language documentation management
 * 配置格式 / Config format: language: "zh/en" (斜杠分隔，第一个为主语言 / slash-separated, first is primary)
 * 目录约定 / Directory convention: wiki/ (主语言 / primary language), wiki_{lang}/ (副语言 / secondary languages)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { walkFiles } from './fileWalker';
import { loadCache, saveCache } from './cache';

export interface I18nConfig {
  primaryLang: string | undefined;
  secondaryLangs: string[];
  allLangs: string[];
}

interface SyncStatus {
  lang: string;
  total: number;
  synced: number;
  outdated: number;
  missing: number;
  details: SyncDetail[];
}

interface SyncDetail {
  file: string;
  status: 'synced' | 'outdated' | 'missing';
  sourceHash?: string;
  translatedHash?: string;
}

interface I18nMemory {
  entries: Record<string, { hash: string; lang: string; createdAt?: string; updatedAt: string }>;
}

// ── 内置 UI 标签表（sidebar / toc 等结构性文本）/ Built-in UI labels (sidebar / toc and other structural text)
// 以及质量检查关键词（auditDocs 使用的章节匹配正则）/ Quality check keywords used by auditDocs for section matching
export interface TocLabels {
  toc: string;
  empty: string;
  home: string;
  gettingStarted: string;
  architecture: string;
  configuration: string;
  modules: string;
  api: string;
  guides: string;
  design: string;
  docMap: string;
  overview: string;
  // 质量检查关键词（小写数组，供 audit 使用）/ Quality check keywords (lowercased arrays, used by audit)
  bestPractices: string[];
  performance: string[];
  troubleshooting: string[];
}

const BUILTIN_LABELS: Record<string, TocLabels> = {
  zh: {
    toc: '目录', empty: '目录为空',
    home: '首页', gettingStarted: '快速开始',
    architecture: '架构概览', configuration: '配置说明',
    modules: '模块文档', api: 'API 参考',
    guides: '使用指南', design: '设计文档',
    docMap: '文档地图', overview: '概述',
    bestPractices: ['最佳实践', 'best practice'],
    performance: ['性能优化', '性能考量', 'performance'],
    troubleshooting: ['错误处理', '调试', '故障排除', 'troubleshoot', 'debug'],
  },
  en: {
    toc: 'Table of Contents', empty: 'Empty',
    home: 'Home', gettingStarted: 'Getting Started',
    architecture: 'Architecture', configuration: 'Configuration',
    modules: 'Modules', api: 'API Reference',
    guides: 'Guides', design: 'Design',
    docMap: 'Doc Map', overview: 'Overview',
    bestPractices: ['best practice', 'best practices'],
    performance: ['performance', 'performance optimization', 'performance considerations'],
    troubleshooting: ['troubleshoot', 'troubleshooting', 'debug', 'error handling', 'debugging'],
  },
  ja: {
    toc: '目次', empty: '空です',
    home: 'ホーム', gettingStarted: 'はじめに',
    architecture: 'アーキテクチャ', configuration: '設定',
    modules: 'モジュール', api: 'APIリファレンス',
    guides: 'ガイド', design: '設計ドキュメント',
    docMap: 'ドキュメントマップ', overview: '概要',
    bestPractices: ['ベストプラクティス', 'best practice'],
    performance: ['パフォーマンス', '性能最適化', 'performance'],
    troubleshooting: ['エラー処理', 'デバッグ', 'トラブルシューティング', 'troubleshoot'],
  },
  ko: {
    toc: '목차', empty: '비어 있음',
    home: '홈', gettingStarted: '시작하기',
    architecture: '아키텍처', configuration: '설정',
    modules: '모듈', api: 'API 참조',
    guides: '가이드', design: '설계 문서',
    docMap: '문서 맵', overview: '개요',
    bestPractices: ['모범 사례', 'best practice'],
    performance: ['성능', '성능 최적화', 'performance'],
    troubleshooting: ['오류 처리', '디버깅', '트러블슈팅', 'troubleshoot'],
  },
  fr: {
    toc: 'Table des matières', empty: 'Vide',
    home: 'Accueil', gettingStarted: 'Démarrage rapide',
    architecture: 'Architecture', configuration: 'Configuration',
    modules: 'Modules', api: 'Référence API',
    guides: 'Guides', design: 'Conception',
    docMap: 'Carte des documents', overview: 'Aperçu',
    bestPractices: ['meilleures pratiques', 'best practice'],
    performance: ['performance', 'optimisation des performances'],
    troubleshooting: ['dépannage', 'débogage', 'gestion des erreurs', 'troubleshoot'],
  },
  de: {
    toc: 'Inhaltsverzeichnis', empty: 'Leer',
    home: 'Startseite', gettingStarted: 'Schnellstart',
    architecture: 'Architektur', configuration: 'Konfiguration',
    modules: 'Module', api: 'API-Referenz',
    guides: 'Anleitungen', design: 'Design',
    docMap: 'Dokumentenkarte', overview: 'Überblick',
    bestPractices: ['best Practices', 'best practice'],
    performance: ['leistung', 'leistungsoptimierung', 'performance'],
    troubleshooting: ['fehlerbehandlung', 'debugging', 'troubleshooting', 'troubleshoot'],
  },
};

/** 内置支持的语言代码集合 / Built-in supported language codes set */
const SUPPORTED_LANGS = new Set(Object.keys(BUILTIN_LABELS));

/** 检查语言代码是否在内置支持列表中 / Check if language code is in the built-in support list */
export function isSupportedLang(lang: string): boolean {
  return SUPPORTED_LANGS.has(lang);
}

/** 从操作系统环境变量推断语言代码，未命中内置语言则返回 'en' / Infer language code from OS environment variables, fallback to 'en' if not in built-in list */
export function getOsLang(): string {
  try {
    const raw = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';
    const code = raw.split('.')[0].split('_')[0].toLowerCase();
    return (code && isSupportedLang(code)) ? code : 'en';
  } catch {
    return 'en';
  }
}

/** 获取指定语言的 UI 标签，未命中回退到 en / Get UI labels for specified language, fallback to en if not found */
export function getTocLabels(lang: string): TocLabels {
  return BUILTIN_LABELS[lang] ?? BUILTIN_LABELS['en'];
}

/** 从 wiki 目录路径推断语言代码: wiki_en → en, wiki → fallback(默认 en) / Infer language code from wiki directory path: wiki_en → en, wiki → fallback(defaults to en) */
export function inferLangFromDir(wikiDir: string, fallback = 'en'): string {
  const dirName = path.basename(wikiDir);
  const match = dirName.match(/^wiki_(\w+)$/);
  return match ? match[1] : fallback;
}

/** 从 config.json 读取 primary language（仅从 .nium-wiki/config.json，不 fallback）/ Read primary language from config.json only — no fallback */
export function getPrimaryLangFromConfig(wikiDir: string): string | undefined {
  const wikiPath = path.isAbsolute(wikiDir) ? wikiDir : path.resolve(wikiDir);
  const niumWikiDir = path.dirname(wikiPath); // wiki/ → .nium-wiki/, .nium-wiki/ → projectRoot
  const configPath = path.join(niumWikiDir, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const langStr: string = config?.language ?? '';
      if (langStr) {
        const parts = langStr.split('/');
        const lang = parts[0].trim();
        if (lang && isSupportedLang(lang)) return lang;
      }
    } catch { /* ignore */ }
  }
  return undefined;
}

/** 解析语言配置: "zh/en" → primaryLang='zh', secondaryLangs=['en']；config.json 不存在时返回 undefined / Parse language config, returns undefined if config.json is absent */
export function loadI18nConfig(wikiPath: string): I18nConfig | undefined {
  const configPath = path.join(wikiPath, 'config.json');
  if (!fs.existsSync(configPath)) return undefined;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const langStr: string = config?.language ?? '';
    if (langStr) {
      const parts = langStr.split('/');
      const primaryLang = parts[0].trim() || undefined;
      const secondaryLangs = parts.slice(1);
      return { primaryLang, secondaryLangs, allLangs: primaryLang ? [primaryLang, ...secondaryLangs] : secondaryLangs };
    }
  } catch { /* ignore */ }

  return undefined;
}

/** 获取指定语言的 wiki 目录路径 / Get wiki directory path for specified language */
export function getWikiDir(wikiBasePath: string, lang: string, config: I18nConfig): string {
  if (lang === config.primaryLang) {
    return path.join(wikiBasePath, 'wiki');
  }
  return path.join(wikiBasePath, `wiki_${lang}`);
}

/** 扫描磁盘上实际存在的语言目录 / Scan for language directories that actually exist on disk */
export function getAvailableLanguages(wikiBasePath: string): Array<{ lang: string; dir: string }> {
  const config = loadI18nConfig(wikiBasePath);
  const results: Array<{ lang: string; dir: string }> = [];

  const primaryDir = path.join(wikiBasePath, 'wiki');
  if (fs.existsSync(primaryDir)) {
    results.push({ lang: config?.primaryLang ?? 'en', dir: primaryDir });
  }

  for (const lang of config?.secondaryLangs ?? []) {
    const langDir = path.join(wikiBasePath, `wiki_${lang}`);
    if (fs.existsSync(langDir)) {
      results.push({ lang, dir: langDir });
    }
  }

  return results;
}

/** 递归收集目录下的 .md 文件（相对路径）/ Recursively collect .md files in directory (relative paths) */
function collectLangFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return walkFiles(dir, { extensions: ['.md'], relative: true, skipHidden: true });
}

function fileHash(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function loadMemory(wikiPath: string): I18nMemory {
  return loadCache<I18nMemory>(wikiPath, 'i18n-memory.json', { entries: {} });
}

function saveMemory(wikiPath: string, memory: I18nMemory): void {
  saveCache(wikiPath, 'i18n-memory.json', memory);
}

/** 检查副语言翻译同步状态（源: wiki/, 目标: wiki_{lang}/）/ Check secondary language translation sync status (source: wiki/, target: wiki_{lang}/) */
export function checkSyncStatus(wikiPath: string, targetLang?: string): SyncStatus[] {
  const config = loadI18nConfig(wikiPath);
  const langs = targetLang ? [targetLang] : (config?.secondaryLangs ?? []);
  const memory = loadMemory(wikiPath);

  const sourceDir = path.join(wikiPath, 'wiki');
  if (!fs.existsSync(sourceDir)) return [];

  const sourceFiles = collectLangFiles(sourceDir);
  const results: SyncStatus[] = [];

  for (const lang of langs) {
    const langDir = path.join(wikiPath, `wiki_${lang}`);
    const details: SyncDetail[] = [];
    let synced = 0, outdated = 0, missing = 0;

    for (const file of sourceFiles) {
      const srcPath = path.join(sourceDir, file);
      const tgtPath = path.join(langDir, file);
      const srcHash = fileHash(srcPath);

      if (!fs.existsSync(tgtPath)) {
        details.push({ file, status: 'missing', sourceHash: srcHash });
        missing++;
      } else {
        const memKey = `${lang}:${file}`;
        const memEntry = memory.entries[memKey];
        if (memEntry && memEntry.hash === srcHash) {
          details.push({ file, status: 'synced', sourceHash: srcHash });
          synced++;
        } else {
          details.push({ file, status: 'outdated', sourceHash: srcHash, translatedHash: fileHash(tgtPath) });
          outdated++;
        }
      }
    }

    results.push({ lang, total: sourceFiles.length, synced, outdated, missing, details });
  }

  return results;
}

export function printSyncStatus(statuses: SyncStatus[]): number {
  let hasIssues = false;
  for (const s of statuses) {
    console.log(`\n🌐 Language: ${s.lang}`);
    console.log(`  Total files: ${s.total} | ✅ Synced: ${s.synced} | ⚠️ Outdated: ${s.outdated} | ❌ Missing: ${s.missing}`);

    const problems = s.details.filter(d => d.status !== 'synced');
    if (problems.length > 0) {
      hasIssues = true;
      for (const d of problems) {
        const icon = d.status === 'missing' ? '❌' : '⚠️';
        const label = d.status === 'missing' ? 'Missing' : 'Outdated';
        console.log(`  ${icon} [${label}] ${d.file}`);
      }
    }
  }
  return hasIssues ? 1 : 0;
}

/** 更新翻译记忆（源: wiki/, 目标: wiki_{lang}/）/ Update translation memory (source: wiki/, target: wiki_{lang}/) */
export function syncMemory(wikiPath: string): void {
  const config = loadI18nConfig(wikiPath);
  const sourceDir = path.join(wikiPath, 'wiki');
  if (!fs.existsSync(sourceDir)) {
    console.log('⚠️  wiki/ directory does not exist, skipping');
    return;
  }

  const sourceFiles = collectLangFiles(sourceDir);
  const memory = loadMemory(wikiPath);
  const now = new Date().toISOString();

  let updated = 0;
  for (const lang of config?.secondaryLangs ?? []) {
    const langDir = path.join(wikiPath, `wiki_${lang}`);
    for (const file of sourceFiles) {
      const tgtPath = path.join(langDir, file);
      if (fs.existsSync(tgtPath)) {
        const srcHash = fileHash(path.join(sourceDir, file));
        const memKey = `${lang}:${file}`;
        const oldEntry = memory.entries[memKey];
        memory.entries[memKey] = {
          hash: srcHash,
          lang,
          createdAt: oldEntry?.createdAt || now,
          updatedAt: now,
        };
        updated++;
      }
    }
  }

  saveMemory(wikiPath, memory);
  console.log(`✅ Translation memory updated, ${updated} records total`);
}
