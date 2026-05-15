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
import {
  analyzeProject,
  printAnalysis,
  discoverModulesFromGraph,
  mergeDiscoveredModules,
  DiscoveredModule,
  ModuleInfo,
} from './core/analyzeProject';
import { diffSourceIndex, updateSourceIndex, printSourceDiff } from './core/sourceIndex';
import { extractDocsFromFile, docsToMarkdown } from './core/extractDocs';
import {
  analyzeWiki,
  printQualityReport,
  saveReportJson,
  hasMermaidErrors,
} from './core/auditDocs';
import { generateToc, generateSidebar } from './generation/generateToc';
import { writeSidebarJson, generateSidebarJson, migrateFromSidebarMd } from './generation/generateSidebarJson';
import { buildDocIndex, enrichWithInference, saveDocIndex } from './core/buildDocIndex';
import { buildDependencyGraph, saveDependencyGraph, loadDependencyGraph } from './core/buildDeps';
import { renderGraph, renderAsciiSummary, OutputFormat, EdgeType, NodeType } from './core/graphRender';
import { loadCache } from './utils/cache';
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
  extractModuleFacts,
  saveModuleFacts,
  loadModuleFacts,
  ModuleFacts,
} from './commands/analyzeModule';
/**
 * Load dep-graph.json, auto-building it if missing.
 * Avoids "run build-deps first" friction for discover-modules and analyze-batch users.
 */
function ensureDependencyGraph(projectRoot: string) {
  const cached = loadDependencyGraph(projectRoot);
  if (cached) return cached;

  console.log('ℹ️  dep-graph.json not found, building automatically...');
  const changes = diffSourceIndex(projectRoot);
  const liveFiles = [...changes.added, ...changes.modified, ...changes.unchanged];
  const graph = buildDependencyGraph(projectRoot, liveFiles);
  saveDependencyGraph(projectRoot, graph);
  const edgeCount = Object.values(graph.imports).reduce((s, v) => s + v.length, 0);
  console.log(`✅ Dependency graph built: ${liveFiles.length} files, ${edgeCount} edges\n`);
  return graph;
}

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
    if (!requireWikiDir(projectRoot)) { process.exitCode = 1; return; }
    ensureDependencyGraph(projectRoot);

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

// ── discover-modules ─────────────────────────────────────────
program
  .command('discover-modules')
  .description('Discover all modules via import graph + directory scan (replaces analyze for SKILL.md)')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--json', 'Output structured JSON', false)
  .option('--min-files <n>', 'Minimum files per module', '2')
  .action((projectPath: string, opts: { json: boolean; minFiles: string }) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }

    const minFiles = parseInt(opts.minFiles, 10);
    if (isNaN(minFiles) || minFiles < 1) {
      console.error('Error: --min-files must be a positive integer');
      process.exitCode = 1;
      return;
    }
    const graph = ensureDependencyGraph(resolved);

    const dirModules = (() => {
      const cached = loadCache(
        path.join(resolved, '.nium-wiki'), 'structure.json', null
      ) as { modules?: ModuleInfo[] } | null;
      return cached?.modules ?? [];
    })();

    const graphModules = discoverModulesFromGraph(resolved, graph, minFiles);

    const merged = mergeDiscoveredModules(graphModules, dirModules);

    if (opts.json) {
      console.log(JSON.stringify(merged, null, 2));
      return;
    }

    console.log(`\nDiscovered ${merged.length} modules:\n`);
    for (const m of merged) {
      const lang = m.language ? ` [${m.language}]` : '';
      const src = m.source === 'both' ? '✓graph+dir' : m.source === 'graph' ? '✓graph' : '  dir';
      console.log(`  ${src}  ${m.path}  (${m.files} files)${lang}`);
    }
  });

// ── analyze-batch ─────────────────────────────────────────────
program
  .command('analyze-batch')
  .description('Extract ModuleFacts for all discovered modules and cache to .nium-wiki/cache/facts/')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--force', 'Re-extract even if cache is valid', false)
  .option('--json', 'Output structured JSON summary', false)
  .option('--min-confidence <n>', 'Override confidence threshold for needsReview (default: 0.3, range: 0–1)', '0.3')
  .action((projectPath: string, opts: { force: boolean; json: boolean; minConfidence: string }) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }

    const minConfidence = parseFloat(opts.minConfidence);
    if (isNaN(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      console.error('Error: --min-confidence must be a number between 0 and 1');
      process.exitCode = 1;
      return;
    }

    const graph = ensureDependencyGraph(resolved);

    const dirModules = (() => {
      const cached = loadCache(
        path.join(resolved, '.nium-wiki'), 'structure.json', null
      ) as { modules?: ModuleInfo[] } | null;
      return cached?.modules ?? [];
    })();
    const graphModules = discoverModulesFromGraph(resolved, graph);
    const allModules = mergeDiscoveredModules(graphModules, dirModules);

    if (allModules.length === 0) {
      console.error('No modules found. The project may not contain any supported source files.');
      process.exitCode = 1;
      return;
    }

    const results: ModuleFacts[] = [];
    const reviewList: string[] = [];

    for (const mod of allModules) {
      const absPath = path.resolve(resolved, mod.path);
      if (!fs.existsSync(absPath)) continue;

      if (!opts.force) {
        const cached = loadModuleFacts(resolved, mod.path);
        if (cached) {
          // Apply threshold override to cached facts (in-memory only)
          if (cached.confidence < minConfidence) cached.needsReview = true;
          results.push(cached);
          if (cached.needsReview) reviewList.push(mod.path);
          continue;
        }
      }

      const facts = extractModuleFacts(absPath, resolved);
      saveModuleFacts(resolved, facts);
      // Apply threshold override after save so cached file keeps default threshold
      if (facts.confidence < minConfidence) facts.needsReview = true;
      results.push(facts);
      if (facts.needsReview) reviewList.push(mod.path);
    }

    if (opts.json) {
      console.log(JSON.stringify({ modules: results, reviewList }, null, 2));
      return;
    }

    console.log(`\nanalyzed ${results.length} modules, ${reviewList.length} need review\n`);
    for (const r of results) {
      const flag = r.needsReview ? '⚠ ' : '✓ ';
      console.log(`  ${flag}${r.modulePath}  (${r.exports.length} exports, confidence=${r.confidence.toFixed(2)})`);
    }

    if (reviewList.length > 0) {
      console.log(`\n⚠  Modules needing review (low confidence or secret detected):`);
      for (const p of reviewList) console.log(`   - ${p}`);
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

// ── graph ──────────────────────────────────────────────
program
  .command('graph')
  .description('Render relationship graph from cache (dep-graph + doc-index)')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('-f, --format <fmt>', 'Output format: ascii | svg | dot | sigma (default: ascii)', 'ascii')
  .option('-i, --interactive', 'Open interactive Sigma.js graph in browser (shortcut for --format sigma -o <name>-graph.html)', false)
  .option('-p, --path <prefix>', 'Filter to sub-path prefix (e.g. src/core)')
  .option('-e, --edge-types <types>', 'Comma-separated edge types: import,refers,links (default: all)')
  .option('-n, --node-types <types>', 'Comma-separated node types: source,doc,module (default: all)')
  .option('--max-nodes <n>', 'Limit number of nodes shown', '200')
  .option('-o, --output <file>', 'Write output to file instead of stdout')
  .option('--summary', 'Show directory summary table instead of graph', false)
  .action((projectPath: string, opts: {
    format: string;
    interactive: boolean;
    path?: string;
    edgeTypes?: string;
    nodeTypes?: string;
    maxNodes: string;
    output?: string;
    summary: boolean;
  }) => {
    const resolved = path.resolve(projectPath);
    if (!requireWikiDir(resolved)) { process.exitCode = 1; return; }

    const format: OutputFormat = opts.interactive ? 'sigma' : (opts.format as OutputFormat);
    const maxNodes = parseInt(opts.maxNodes, 10);
    const edgeTypes = opts.edgeTypes
      ? opts.edgeTypes.split(',').map(s => s.trim()) as EdgeType[]
      : undefined;
    const nodeTypes = opts.nodeTypes
      ? opts.nodeTypes.split(',').map(s => s.trim()) as NodeType[]
      : undefined;

    // Auto-name output for interactive mode
    let outputPath = opts.output;
    if (opts.interactive && !outputPath) {
      const projectName = path.basename(resolved).replace(/[^a-zA-Z0-9_-]/g, '_');
      outputPath = path.join(resolved, `${projectName}-graph.html`);
    }

    try {
      if (opts.summary) {
        const { loadGraphData } = require('./core/graphRender');
        const data = loadGraphData(resolved);
        const output = renderAsciiSummary(data);
        if (opts.output) {
          fs.writeFileSync(opts.output, output, 'utf-8');
          console.log(`✅ Written to ${opts.output}`);
        } else {
          console.log(output);
        }
        return;
      }

      const output = renderGraph(resolved, {
        format,
        pathPrefix: opts.path,
        edgeTypes,
        nodeTypes,
        maxNodes,
      });

      if (outputPath) {
        fs.writeFileSync(outputPath, output, 'utf-8');
        console.log(`✅ ${format === 'sigma' ? 'Interactive' : 'Graph'} written to ${outputPath}`);
        if (format === 'sigma') {
          console.log(`   Open in browser: file://${path.resolve(outputPath)}`);
        }
      } else {
        console.log(output);
      }
    } catch (err) {
      console.error(`❌ Failed to render graph: ${(err as Error).message}`);
      process.exitCode = 1;
    }
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

// ── generate-sidebar ─────────────────────────────────────

/**
 * Process a single wiki directory: detect state and apply appropriate action.
 * 幂等：
 *   - 已有 sidebar.json → 无操作
 *   - 有 _sidebar.md → 迁移，删除旧文件
 *   - 均无 → 扫描生成
 */
function processSidebarForDir(wikiDir: string, lang: string | undefined, force: boolean): void {
  const sidebarJsonPath = path.join(wikiDir, 'sidebar.json');
  const legacyPath = path.join(wikiDir, '_sidebar.md');

  const hasSidebarJson = fs.existsSync(sidebarJsonPath);
  const hasLegacySidebar = fs.existsSync(legacyPath);

  if (force) {
    writeSidebarJson(wikiDir, lang);
    console.log(`🔄 [${lang}] Force regenerated sidebar.json → ${wikiDir}/sidebar.json`);
    if (hasLegacySidebar) {
      fs.unlinkSync(legacyPath);
      console.log(`🗑  Removed legacy _sidebar.md`);
    }
    return;
  }

  if (hasSidebarJson) {
    console.log(`ℹ️  [${lang}] sidebar.json already exists, skipping → ${sidebarJsonPath}`);
    return;
  }

  if (hasLegacySidebar) {
    const markdown = fs.readFileSync(legacyPath, 'utf-8');
    migrateFromSidebarMd(wikiDir, markdown);
    console.log(`⚙️  [${lang}] Migrated _sidebar.md → sidebar.json → ${sidebarJsonPath}`);
    return;
  }

  writeSidebarJson(wikiDir, lang);
  console.log(`✅ [${lang}] Generated sidebar.json → ${wikiDir}/sidebar.json`);
}

program
  .command('generate-sidebar')
  .description('Generate or migrate sidebar.json from wiki directory structure')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .option('--lang <code>', 'Language code (defaults to primaryLang from config)')
  .option('--all', 'Process all available language directories', false)
  .option('--print', 'Print to stdout instead of writing to disk', false)
  .option('--force', 'Regenerate even if sidebar.json already exists', false)
  .action((wikiPath: string, opts: { lang?: string; all: boolean; print: boolean; force: boolean }) => {
    let resolved = path.resolve(wikiPath);
    if (!fs.existsSync(path.join(resolved, 'wiki'))) {
      const candidate = path.join(resolved, '.nium-wiki');
      if (fs.existsSync(path.join(candidate, 'wiki'))) {
        resolved = candidate;
      }
    }
    const wikiDir = path.join(resolved, 'wiki');
    if (!fs.existsSync(wikiDir)) {
      console.error(`❌ Wiki directory not found: ${wikiDir}`);
      process.exitCode = 1;
      return;
    }

    const config = loadI18nConfig(resolved);
    const primaryLang = config?.primaryLang;

    if (opts.print) {
      const lang = opts.lang ?? primaryLang;
      console.log(generateSidebarJson(wikiDir, lang));
      return;
    }

    if (opts.all) {
      const allLangs = [primaryLang, ...(config?.secondaryLangs ?? [])].filter(Boolean);
      for (const lang of allLangs) {
        const targetDir = lang === primaryLang ? wikiDir : path.join(resolved, `wiki_${lang}`);
        if (!fs.existsSync(targetDir)) continue;
        processSidebarForDir(targetDir, lang, opts.force);
      }
    } else {
      processSidebarForDir(wikiDir, primaryLang ?? 'en', opts.force);

      for (const secondary of config?.secondaryLangs ?? []) {
        const secondaryDir = path.join(resolved, `wiki_${secondary}`);
        if (fs.existsSync(secondaryDir)) {
          processSidebarForDir(secondaryDir, secondary, opts.force);
        }
      }
    }

    if (!opts.force) {
      const aliasPath = path.join(wikiDir, 'folder-aliases.json');
      if (!fs.existsSync(aliasPath)) {
        console.log(`\n💡 No folder-aliases.json found. Create it to customize directory labels per language:`);
        console.log(`   ${aliasPath}`);
        console.log(`\n   Example:`);
        console.log(`   {`);
        console.log(`     "modules": { "zh": "模块文档", "en": "Modules" },`);
        console.log(`     "guides":  { "zh": "使用指南", "en": "Guides" }`);
        console.log(`   }`);
      }
    }
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
