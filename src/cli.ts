#!/usr/bin/env node
/**
 * Nium-Wiki CLI 入口 / CLI Entry Point
 * 提供所有子命令 / Provides all subcommands: init, analyze, diff-index, extract-docs,
 * audit-docs, generate-toc
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getVersion } from './utils/version';

/** 验证项目根目录：确认 .nium-wiki 目录存在 / Validate project root: confirm .nium-wiki directory exists */
function requireWikiDir(resolvedProjectRoot: string): boolean {
  const wikiDir = path.join(resolvedProjectRoot, '.nium-wiki');
  if (fs.existsSync(wikiDir)) return true;

  // Normalize path: strip trailing slash to avoid path.dirname inconsistency
  // 标准化路径：去除末尾斜杠，避免 path.dirname 对 /root/skills/ 和 /root/skills 处理不一致
  const normalized = resolvedProjectRoot.replace(/\/$/, '');
  const parentDir = path.dirname(normalized);
  const parentWiki = path.join(parentDir, '.nium-wiki');

  if (fs.existsSync(parentWiki)) {
    // .nium-wiki exists in parent dir — check if user is inside it
    const normalizedResolved = resolvedProjectRoot.replace(/\/$/, '');
    if (normalizedResolved === parentWiki || normalizedResolved.startsWith(parentWiki + '/')) {
      // .nium-wiki in parent dir, user is inside it — block execution
      // 用户在 .nium-wiki/ 内执行（或传入了 .nium-wiki/ 本身）
      console.error(`❌ Cannot run from inside .nium-wiki/ directory.`);
      console.error(`   Current directory: ${resolvedProjectRoot}`);
      console.error(`   Run from project root: ${parentDir}`);
      console.error(`   Or pass the path explicitly:  nium-wiki <command> ${parentDir}`);
    } else {
      // .nium-wiki exists in parent but resolved is outside — should not reach here (outer return handles normal case)
      console.error(`❌ .nium-wiki directory not found in: ${resolvedProjectRoot}`);
      console.error(`   Please run 'nium-wiki init' first to initialize.`);
    }
  } else {
    console.error(`❌ .nium-wiki directory not found in: ${resolvedProjectRoot}`);
    console.error(`   Please run 'nium-wiki init' first to initialize.`);
  }
  return false;
}

import { initNiumWiki, printInitResult } from './infra/initWiki';
import { getOsLang, loadI18nConfig, appendLangToConfig } from './utils/i18n';
import { analyzeProject, printAnalysis } from './core/analyzeProject';
import { diffSourceIndex, updateSourceIndex, printSourceDiff } from './core/sourceIndex';
import { extractDocsFromFile, docsToMarkdown } from './core/extractDocs';
import {
  analyzeWiki,
  printQualityReport,
  saveReportJson,
  hasMermaidErrors,
} from './core/auditDocs';
import { generateToc, generateSidebar } from './generation/generateToc';
import { buildDocIndex, enrichWithInference, saveDocIndex } from './core/buildDocIndex';
import { buildDependencyGraph, saveDependencyGraph, loadDependencyGraph } from './core/buildDeps';
import {
  buildIncrementalPlan,
  printIncrementalPlan,
} from './core/incremental';
import { sanitizeLinks, printSanitizeResult } from './core/sanitizeLinks';
import {
  checkSyncStatus,
  printSyncStatus,
  syncMemory,
  initMemory,
} from './utils/i18n';
import {
  analyzeModule,
  analyzeAllModules,
  formatModuleAnalysis,
  printBatchAnalysis,
} from './commands/analyzeModule';
const program = new Command();

program
  .name('nium-wiki')
  .description('AI-powered professional-grade structured project Wiki generator')
  .version(getVersion());

// ── init ──────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize .nium-wiki directory structure')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('-f, --force', 'Force reinitialization', false)
  .option('-l, --lang <code>', 'Primary language code (zh/en/ja/ko/fr/de), defaults to system language')
  .action(async (projectPath: string, opts: { force: boolean; lang?: string }) => {
    const resolved = path.resolve(projectPath);
    const wikiDir = path.join(resolved, '.nium-wiki');

    // Non-force: if .nium-wiki exists and --lang is given, append lang as secondary language
    if (!opts.force && opts.lang) {
      const appended = appendLangToConfig(wikiDir, opts.lang);
      if (appended) {
        console.log(`ℹ️  Language '${opts.lang}' added to config.json`);
      }
      // initNiumWiki is not needed in this path — just report success
      printInitResult({ success: true, created: [], skipped: [], message: 'Language updated in existing config' });
      process.exitCode = 0;
      return;
    }

    // Normal init path
    let primaryLang = opts.lang || getOsLang();
    // Re-init: preserve existing language from config.json instead of overwriting with system lang
    if (opts.force && !opts.lang) {
      const existing = loadI18nConfig(wikiDir);
      if (existing?.primaryLang) {
        primaryLang = existing.primaryLang;
      }
    }
    const result = await initNiumWiki(resolved, opts.force, primaryLang);
    printInitResult(result);
    process.exitCode = result.success ? 0 : 1;
  });

// ── analyze ───────────────────────────────────────────────
program
  .command('analyze')
  .description('Analyze project structure, tech stack, and modules')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--no-cache', 'Do not save to cache')
  .option('--verbose', 'Show file list per module')
  .action(async (projectPath: string, opts: { cache: boolean; verbose: boolean }) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }
    const importedBy = opts.verbose ? loadDependencyGraph(resolved)?.importedBy : undefined;
    const result = await analyzeProject(resolved, opts.cache, importedBy);
    printAnalysis(result, opts.verbose);
  });

// ── analyze-module ───────────────────────────────────────────
program
  .command('analyze-module')
  .description('Analyze a specific module: classify role, recommend template, estimate complexity')
  .argument('[module-path]', 'Module directory path (relative to project root, or absolute)', '')
  .option('--batch', 'Analyze all modules in src/ (default: discover src directories automatically)', false)
  .option('--json', 'Output structured JSON for machine consumption', false)
  .action((modulePath: string, opts: { batch: boolean; json: boolean }) => {
    const projectRoot = process.cwd();

    if (opts.batch) {
      const result = analyzeAllModules(projectRoot);
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printBatchAnalysis(result);
      }
      return;
    }

    if (!modulePath) {
      console.error('Error: module-path is required (or use --batch to analyze all modules)');
      console.log('Usage: nium-wiki analyze-module <module-path> [--batch|--json]');
      process.exitCode = 1;
      return;
    }

    const resolved = path.isAbsolute(modulePath)
      ? path.resolve(modulePath)
      : path.resolve(projectRoot, modulePath);

    if (!fs.existsSync(resolved)) {
      console.error(`Error: Module path does not exist: ${resolved}`);
      process.exitCode = 1;
      return;
    }

    const analysis = analyzeModule(resolved, projectRoot);
    if (opts.json) {
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log(formatModuleAnalysis(analysis));
    }
  });

// ── diff-index ────────────────────────────────────────────
program
  .command('diff-index')
  .description('Compare source file index and detect project file changes')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--no-update', 'Only detect changes, do not update hash cache')
  .action((projectPath: string, opts: { update: boolean }) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }
    const changes = diffSourceIndex(resolved);
    printSourceDiff(changes);
    if (opts.update) {
      updateSourceIndex(resolved, changes.currentHashes);
      console.log('\n✅ Hash cache updated');
    } else {
      console.log('\n⚠️  Hash cache not updated (--no-update)');
    }
  });

// ── incremental ─────────────────────────────────────────
program
  .command('incremental')
  .description('Build incremental update plan: diff → dep-graph → doc-index → affected docs')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--no-commit', 'Do not update hash cache after analysis')
  .option('--max-depth <n>', 'Maximum BFS depth for transitive impact (default: 3)', '3')
  .option('-v, --verbose', 'Show preserved docs list')
  .action((projectPath: string, opts: { commit: boolean; maxDepth: string; verbose: boolean }) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }

    const plan = buildIncrementalPlan({
      projectRoot: resolved,
      commitHashes: opts.commit !== false,
      maxImpactDepth: parseInt(opts.maxDepth, 10),
      fallbackToFull: true,
    });

    printIncrementalPlan(plan, opts.verbose);
    process.exitCode = plan.hasChanges ? 0 : 0;
  });

// ── build-index ──────────────────────────────────────────
program
  .command('build-index')
  .description('Scan wiki for source path references, build bidirectional index between source files and docs')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .action((projectPath: string) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }
    const wikiDir = path.join(resolved, '.nium-wiki');
    if (!fs.existsSync(path.join(wikiDir, 'wiki'))) {
      console.error('❌ wiki directory does not exist, please generate docs first');
      process.exitCode = 1;
      return;
    }

    const docIndex = buildDocIndex(resolved);

    // 用变更检测获取所有源文件列表，用于命名约定推断
    // Use change detection to get all source file list for naming convention inference
    const changes = diffSourceIndex(resolved);
    const allSourceFiles = [...new Set([
      ...changes.added, ...changes.modified, ...changes.unchanged,
    ])];
    enrichWithInference(docIndex, allSourceFiles, path.join(wikiDir, 'wiki'));

    saveDocIndex(resolved, docIndex);

    const srcCount = Object.keys(docIndex.sourceToDoc).length;
    const docCount = Object.keys(docIndex.docToSources).length;
    console.log(`✅ Doc index built: ${srcCount} source files ↔ ${docCount} docs`);
  });

// ── build-deps ───────────────────────────────────────────
program
  .command('build-deps')
  .description('Parse import/require statements, build project dependency graph')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .action((projectPath: string) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }

    const changes = diffSourceIndex(resolved);
    const liveFiles = [...changes.added, ...changes.modified, ...changes.unchanged];
    const depGraph = buildDependencyGraph(resolved, liveFiles);
    saveDependencyGraph(resolved, depGraph);

    const edgeCount = Object.values(depGraph.imports).reduce((s, v) => s + v.length, 0);
    console.log(`✅ Dependency graph built: ${liveFiles.length} files, ${edgeCount} edges`);
  });

// ── sanitize-links ──────────────────────────────────────
program
  .command('sanitize-links')
  .description('Scan wiki docs and fix file:// absolute paths to project-root-relative paths')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .action((projectPath: string) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }
    const wikiDir = path.join(resolved, '.nium-wiki', 'wiki');
    if (!fs.existsSync(wikiDir)) {
      console.error('❌ wiki directory does not exist, please generate docs first');
      process.exitCode = 1;
      return;
    }

    const result = sanitizeLinks(resolved);
    printSanitizeResult(result);
  });

// ── extract-docs ──────────────────────────────────────────
program
  .command('extract-docs')
  .description('Extract JSDoc/DocString comments from code files')
  .argument('<file>', 'File path to extract')
  .action((file: string) => {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ File does not exist: ${resolved}`);
      process.exitCode = 1;
      return;
    }
    const entries = extractDocsFromFile(resolved);
    if (entries.length === 0) {
      console.log('No documentation comments found');
      return;
    }
    console.log(docsToMarkdown(entries));
  });

// ── audit-docs ─────────────────────────────────────────
program
  .command('audit-docs')
  .description('Check Wiki documentation quality')
  .argument('[wiki-path]', '.nium-wiki directory path (or project root to auto-detect)', '.nium-wiki')
  .option('-v, --verbose', 'Show detailed issue list', false)
  .option('--json <file>', 'Save report as JSON file')
  .option('--mermaid-strict', 'Exit with non-zero code when Mermaid syntax errors are found (for CI)', false)
  .option('--role <role>', 'Default module role for quality expectations (overrides auto-detection): core | utility | index | auto', 'auto')
  .action((wikiPath: string, opts: { verbose: boolean; json?: string; mermaidStrict: boolean; role: string }) => {
    let resolved = path.resolve(wikiPath);
    // 如果传入的是项目根目录（没有 wiki/ 子目录），尝试向上找 .nium-wiki
    // If passed project root (no wiki/ subdir), try to find .nium-wiki in parent
    if (!fs.existsSync(path.join(resolved, 'wiki'))) {
      const candidate = path.join(resolved, '.nium-wiki');
      if (fs.existsSync(candidate)) {
        resolved = candidate;
      } else if (!fs.existsSync(resolved)) {
        console.error(`❌ Path does not exist: ${resolved}`);
        process.exitCode = 1;
        return;
      }
    }
    const role = opts.role === 'auto' ? undefined : opts.role;
    const report = analyzeWiki(resolved, role);
    const exitCode = printQualityReport(report, opts.verbose);
    if (opts.json) {
      saveReportJson(report, opts.json);
    }
    if (opts.mermaidStrict && hasMermaidErrors(report)) {
      console.error('\n🔴 Mermaid syntax errors detected. Fix all error-level issues before merging.');
      process.exitCode = 1;
      return;
    }
    process.exitCode = exitCode;
  });

// ── generate-toc ──────────────────────────────────────────
program
  .command('generate-toc')
  .description('Generate Wiki table of contents navigation')
  .argument('[wiki-dir]', 'wiki directory path')
  .option('--sidebar', 'Also generate sidebar JSON', false)
  .option('--lang <code>', 'Specify language code (defaults to directory name inference)')
  .action((wikiDir: string, opts: { sidebar: boolean; lang?: string }) => {
    const wikiRoot = path.resolve(wikiDir || path.join('.nium-wiki'));
    const resolved = path.join(wikiRoot, 'wiki');
    if (opts.lang) {
      const appended = appendLangToConfig(wikiRoot, opts.lang);
      if (appended) console.log(`ℹ️  Language '${opts.lang}' added to config.json`);
    }
    console.log(generateToc(resolved, '/', opts.lang));
    if (opts.sidebar) {
      console.log('\n=== Sidebar JSON ===');
      console.log(generateSidebar(resolved, opts.lang));
    }
  });

// ── i18n ─────────────────────────────────────────────────
const i18nCmd = program
  .command('i18n')
  .description('Multi-language documentation sync management');

i18nCmd
  .command('status')
  .description('Check translation sync status')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .option('--lang <code>', 'Only check specified language')
  .action((wikiPath: string, opts: { lang?: string }) => {
    let resolved = path.resolve(wikiPath);
    // 如果传入项目根目录（没有 wiki/ 子目录），自动补全为 .nium-wiki
    // If passed project root (no wiki/ subdir), auto-complete to .nium-wiki
    if (!fs.existsSync(path.join(resolved, 'wiki'))) {
      const candidate = path.join(resolved, '.nium-wiki');
      if (fs.existsSync(path.join(candidate, 'wiki'))) {
        resolved = candidate;
      } else {
        console.error(`❌ .nium-wiki directory not found: ${resolved}`);
        console.error(`   Make sure you are running from the project root, or pass the path explicitly:`);
        console.error(`     nium-wiki i18n status ${path.join(resolved, '.nium-wiki')}`);
        process.exitCode = 1;
        return;
      }
    }
    const statuses = checkSyncStatus(resolved, opts.lang);
    process.exitCode = printSyncStatus(statuses);
  });

i18nCmd
  .command('sync-memory')
  .description('Update translation memory cache')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .action((wikiPath: string) => {
    let resolved = path.resolve(wikiPath);
    if (!fs.existsSync(path.join(resolved, 'wiki'))) {
      const candidate = path.join(resolved, '.nium-wiki');
      if (fs.existsSync(path.join(candidate, 'wiki'))) {
        resolved = candidate;
      } else {
        console.error(`❌ .nium-wiki directory not found: ${resolved}`);
        console.error(`   Make sure you are running from the project root, or pass the path explicitly:`);
        console.error(`     nium-wiki i18n sync-memory ${path.join(resolved, '.nium-wiki')}`);
        process.exitCode = 1;
        return;
      }
    }
    syncMemory(resolved);
  });

i18nCmd
  .command('init-memory')
  .description('Initialize translation memory from existing wiki_en/ files')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .option('--lang <code>', 'Only initialize specified language')
  .action((wikiPath: string, opts: { lang?: string }) => {
    let resolved = path.resolve(wikiPath);
    if (!fs.existsSync(path.join(resolved, 'wiki'))) {
      const candidate = path.join(resolved, '.nium-wiki');
      if (fs.existsSync(path.join(candidate, 'wiki'))) {
        resolved = candidate;
      } else {
        console.error(`❌ .nium-wiki directory not found: ${resolved}`);
        console.error(`   Make sure you are running from the project root, or pass the path explicitly:`);
        console.error(`     nium-wiki i18n init-memory ${path.join(resolved, '.nium-wiki')}`);
        process.exitCode = 1;
        return;
      }
    }
    initMemory(resolved, opts.lang);
  });

program.parse();
