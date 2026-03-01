#!/usr/bin/env node
/**
 * Nium-Wiki CLI 入口 / CLI Entry Point
 * 提供所有子命令 / Provides all subcommands: init, analyze, diff-index, extract-docs,
 * generate-diagram, audit-docs, generate-toc
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getVersion } from './utils/version';

import { initNiumWiki, printInitResult } from './infra/initWiki';
import { getOsLang } from './utils/i18n';
import { analyzeProject, printAnalysis } from './core/analyzeProject';
import { diffSourceIndex, updateSourceIndex, printSourceDiff } from './core/sourceIndex';
import { extractDocsFromFile, docsToMarkdown } from './core/extractDocs';
import {
  generateArchitectureDiagram,
  generateFileTreeDiagram,
  generateDataFlowDiagram,
  loadStructure,
} from './generation/generateDiagram';
import {
  analyzeWiki,
  printQualityReport,
  saveReportJson,
} from './core/auditDocs';
import { generateToc, generateSidebar } from './generation/generateToc';
import { buildDocIndex, enrichWithInference, saveDocIndex } from './core/buildDocIndex';
import { buildDependencyGraph, saveDependencyGraph } from './core/buildDeps';
import { sanitizeLinks, printSanitizeResult } from './core/sanitizeLinks';
import {
  checkSyncStatus,
  printSyncStatus,
  syncMemory,
} from './utils/i18n';
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
  .action((projectPath: string, opts: { force: boolean; lang?: string }) => {
    const resolved = path.resolve(projectPath);
    const primaryLang = opts.lang || getOsLang();
    const result = initNiumWiki(resolved, opts.force, primaryLang);
    printInitResult(result);
    process.exitCode = result.success ? 0 : 1;
  });

// ── analyze ───────────────────────────────────────────────
program
  .command('analyze')
  .description('Analyze project structure, tech stack, and modules')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--no-cache', 'Do not save to cache')
  .action(async (projectPath: string, opts: { cache: boolean }) => {
    const resolved = path.resolve(projectPath);
    const result = await analyzeProject(resolved, opts.cache);
    printAnalysis(result);
  });

// ── diff-index ────────────────────────────────────────────
program
  .command('diff-index')
  .description('Compare source file index and detect project file changes')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .option('--no-update', 'Only detect changes, do not update hash cache')
  .action((projectPath: string, opts: { update: boolean }) => {
    const resolved = path.resolve(projectPath);
    const changes = diffSourceIndex(resolved);
    printSourceDiff(changes);
    if (opts.update) {
      updateSourceIndex(resolved, changes.currentHashes);
      console.log('\n✅ Hash cache updated');
    } else {
      console.log('\n⚠️  Hash cache not updated (--no-update)');
    }
  });

// ── build-index ──────────────────────────────────────────
program
  .command('build-index')
  .description('Scan wiki for source path references, build bidirectional index between source files and docs')
  .argument('[project-path]', 'Project root directory', process.cwd())
  .action((projectPath: string) => {
    const resolved = path.resolve(projectPath);
    const wikiDir = path.join(resolved, '.nium-wiki');
    if (!fs.existsSync(path.join(wikiDir, 'wiki'))) {
      console.error('❌ wiki directory does not exist, please generate docs first');
      process.exitCode = 1;
      return;
    }

    const docIndex = buildDocIndex(resolved);

    // 用变更检测获取所有源文件列表，用于命名约定推断
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
    const wikiDir = path.join(resolved, '.nium-wiki');
    if (!fs.existsSync(wikiDir)) {
      console.error('❌ .nium-wiki directory does not exist, please run init first');
      process.exitCode = 1;
      return;
    }

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

// ── generate-diagram ──────────────────────────────────────
program
  .command('generate-diagram')
  .description('Generate Mermaid diagrams from project structure')
  .argument('[wiki-dir]', '.nium-wiki directory path', '.nium-wiki')
  .option('-t, --type <type>', 'Diagram type: architecture | tree | flow | class', 'architecture')
  .option('--preview', 'Preview diagram (output to terminal)', false)
  .action((wikiDir: string, opts: { type: string; preview: boolean }) => {
    const resolved = path.resolve(wikiDir);
    const structure = loadStructure(resolved);
    if (!structure) {
      console.error('❌ Project structure data not found, please run analyze first');
      process.exitCode = 1;
      return;
    }

    switch (opts.type) {
      case 'architecture':
        console.log('=== Architecture Diagram ===');
        console.log(generateArchitectureDiagram(structure));
        break;
      case 'tree':
        console.log('=== Directory Structure Diagram ===');
        console.log(generateFileTreeDiagram(structure));
        break;
      case 'flow':
        console.log('=== Data Flow Diagram ===');
        console.log(generateDataFlowDiagram(
          structure.entryPoints || [],
          structure.modules || [],
        ));
        break;
      default:
        console.log('=== Architecture Diagram ===');
        console.log(generateArchitectureDiagram(structure));
        console.log();
        console.log('=== Directory Structure Diagram ===');
        console.log(generateFileTreeDiagram(structure));
    }
  });

// ── audit-docs ─────────────────────────────────────────
program
  .command('audit-docs')
  .description('Check Wiki documentation quality')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .option('-v, --verbose', 'Show detailed issue list', false)
  .option('--json <file>', 'Save report as JSON file')
  .action((wikiPath: string, opts: { verbose: boolean; json?: string }) => {
    const resolved = path.resolve(wikiPath);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Path does not exist: ${resolved}`);
      process.exitCode = 1;
      return;
    }
    const report = analyzeWiki(resolved);
    const exitCode = printQualityReport(report, opts.verbose);
    if (opts.json) {
      saveReportJson(report, opts.json);
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
    const resolved = path.resolve(wikiDir || path.join('.nium-wiki', 'wiki'));
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
    const resolved = path.resolve(wikiPath);
    const statuses = checkSyncStatus(resolved, opts.lang);
    process.exitCode = printSyncStatus(statuses);
  });

i18nCmd
  .command('sync-memory')
  .description('Update translation memory cache')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .action((wikiPath: string) => {
    const resolved = path.resolve(wikiPath);
    syncMemory(resolved);
  });

program.parse();
