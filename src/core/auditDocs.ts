/**
 * Nium-Wiki 文档质量检查模块 / Documentation quality check module
 * 检查生成的文档是否符合质量标准 / Check if generated documentation meets quality standards
 */

import * as fs from 'fs';
import * as path from 'path';
import { walkFiles } from '../utils/fileWalker';
import { inferLangFromDir, getTocLabels, getPrimaryLangFromConfig } from '../utils/i18n';

export interface QualityMetrics {
  filePath: string;
  lineCount: number;
  sectionCount: number;
  subsectionCount: number;
  emptySectionCount: number;
  diagramCount: number;
  codeExampleCount: number;
  tableCount: number;
  crossLinkCount: number;
  hasSourceTracing: boolean;
  hasBestPractices: boolean;
  hasPerformance: boolean;
  hasTroubleshooting: boolean;
  qualityLevel: 'basic' | 'standard' | 'professional';
  issues: string[];
  mermaidIssues: MermaidIssue[];
}

export interface MermaidIssue {
  severity: 'warn' | 'error';
  line: number;
  message: string;
  suggestion: string;
}

export interface QualityReport {
  wikiPath: string;
  checkTime: string;
  totalDocs: number;
  professionalCount: number;
  standardCount: number;
  basicCount: number;
  docs: QualityMetrics[];
  summaryIssues: string[];
}

/** 评分档位按角色分层 / Score tiers vary by role */
interface ScoreTiers {
  sectionThresholds: [number, number]; // [fullScoreVal, halfScoreVal] — 3pts / 2pts thresholds; 1pt = sectionCount >= 1
  diagramThresholds: [number, number, number]; // 3/2/1 pts thresholds
  exampleThresholds: [number, number]; // 2/1 pts thresholds
  crossLinkThresholds: [number, number]; // 2/1 pts thresholds
}

const SCORE_TIERS: Record<string, ScoreTiers> = {
  core: {
    sectionThresholds: [8, 6],       // ≥8 → 3pts, ≥6 → 2pts, ≥5 → 1pt (fixed min)
    diagramThresholds: [3, 2, 2],    // 3pts≥3, 2pts≥2, 1pt≥2 (must meet minDiagrams=2 to score)
    exampleThresholds: [5, 3],       // SKILL.md requires 5+ examples for core modules
    crossLinkThresholds: [3, 1],
  },
  utility: {
    sectionThresholds: [6, 5],       // ≥6 → 3pts, ≥5 → 2pts (default 5 → 1pt)
    diagramThresholds: [2, 1, 1],
    exampleThresholds: [2, 1],
    crossLinkThresholds: [2, 1],
  },
  index: {
    sectionThresholds: [4, 3],        // ≥4 → 3pts, ≥3 → 2pts (minSections=3, so 3 → 2pts)
    diagramThresholds: [1, 1, 1],
    exampleThresholds: [999, 999],   // index 不考核代码示例 — never gives points
    crossLinkThresholds: [999, 999], // index 不考核交叉链接
  },
  default: {
    sectionThresholds: [7, 5],      // ≥7 → 3pts, ≥5 → 2pts
    diagramThresholds: [2, 1, 1],
    exampleThresholds: [3, 1],
    crossLinkThresholds: [2, 1],
  },
};

function evaluateQualityLevel(
  m: QualityMetrics,
  role: string,
): 'basic' | 'standard' | 'professional' {
  let score = 0;
  const totalSections = m.sectionCount + m.subsectionCount;
  const tiers = SCORE_TIERS[role] ?? SCORE_TIERS['default'];

  // ── 结构完整性 / Structural completeness (max 5) ──
  const [secFull, secHalf] = tiers.sectionThresholds;
  if (m.sectionCount >= 12) score += 3;
  else if (m.sectionCount >= secFull) score += 3;
  else if (m.sectionCount >= secHalf) score += 2;
  else if (m.sectionCount >= 5) score += 1;

  if (totalSections > 0 && m.emptySectionCount / totalSections <= 0.1) score += 1;
  if (m.subsectionCount >= 1) score += 1;

  // ── 内容丰富度 / Content richness (max 5) ──
  const [diagFull, diagHalf, diagMin] = tiers.diagramThresholds;
  if (m.diagramCount >= diagFull) score += 3;
  else if (m.diagramCount >= diagHalf) score += 2;
  else if (m.diagramCount >= diagMin) score += 1;

  const [exFull, exMin] = tiers.exampleThresholds;
  if (m.codeExampleCount >= exFull) score += 2;
  else if (m.codeExampleCount >= exMin) score += 1;

  // ── 链接与追溯 / Links and traceability (max 4) ──
  const [clFull, clMin] = tiers.crossLinkThresholds;
  if (m.crossLinkCount >= clFull) score += 2;
  else if (m.crossLinkCount >= clMin) score += 1;

  if (m.hasSourceTracing) score += 2;

  if (score >= 10) return 'professional';
  if (score >= 6) return 'standard';
  return 'basic';
}

interface ExpectedMetrics {
  minLines: number;
  minSections: number;
  minDiagrams: number;
  minExamples: number;
}

/**
 * 推断模块角色：优先从 wiki 目录结构推断，否则退化到文件名关键词检测。
 * Inference order: explicit role > wiki directory path > filename keyword.
 */
function inferRoleFromWikiPath(wikiDir: string, filePath: string): string {
  const rel = path.relative(wikiDir, filePath).replace(/\\/g, '/');
  const firstDir = rel.split('/')[0];

  // Top-level dir name maps directly (dir structure is more authoritative than filename)
  // 顶级目录名直接映射（目录结构比文件名更权威）
  if (['core', 'internal'].includes(firstDir)) return 'core';
  // Other top-level dirs (api/, serve/, commands/, etc.) detected by filename / 其他顶级目录（api/, serve/, commands/ 等）按 filename 检测
  return 'auto';
}

function calculateExpectedMetrics(filePath: string, role?: string): ExpectedMetrics {
  const expected: ExpectedMetrics = {
    minLines: 100,
    minSections: 6,
    minDiagrams: 1,
    minExamples: 2,
  };

  // Explicit role takes priority (CLI --role overrides all inference) / 显式 role 优先（CLI --role 参数覆盖一切推断）
  if (role === 'core') {
    expected.minLines = 150;
    expected.minSections = 6;
    expected.minDiagrams = 2;
    expected.minExamples = 3;
  } else if (role === 'utility') {
    expected.minLines = 80;
    expected.minSections = 5;
    expected.minDiagrams = 1;
    expected.minExamples = 2;
  } else if (role === 'index') {
    expected.minLines = 50;
    expected.minSections = 3;
    expected.minDiagrams = 0;
    expected.minExamples = 0;
  } else {
    // Fallback: filename keyword detection (original logic) / 退化：文件名关键词检测（原有逻辑）
    const fileName = path.basename(filePath, '.md').toLowerCase();

    const coreKeywords = ['core', 'agent', 'editor', 'store', 'main', 'client'];
    const isCore = coreKeywords.some(kw => fileName.includes(kw));

    const utilKeywords = ['util', 'helper', 'common', 'shared', 'constant', 'config', 'type'];
    const isUtil = utilKeywords.some(kw => fileName.includes(kw));

    const isIndex = ['index', '_index', 'toc', 'doc-map'].includes(fileName);

    if (isCore) {
      expected.minLines = 150;
      expected.minSections = 6;
      expected.minDiagrams = 2;
      expected.minExamples = 3;
    } else if (isUtil) {
      expected.minLines = 80;
      expected.minSections = 5;
      expected.minDiagrams = 1;
      expected.minExamples = 2;
    } else if (isIndex) {
      expected.minLines = 50;
      expected.minSections = 3;
      expected.minDiagrams = 0;
      expected.minExamples = 0;
    }
  }

  return expected;
}

function countEmptySections(lines: string[]): { count: number; titles: string[] } {
  const emptyTitles: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^#{2,3} /.test(lines[i])) continue;
    let hasContent = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^## /.test(lines[j])) break;
      if (lines[j].trim().length > 0) { hasContent = true; break; }
    }
    if (!hasContent) {
      emptyTitles.push(lines[i].trim());
    }
  }
  return { count: emptyTitles.length, titles: emptyTitles };
}

function generateIssues(
  m: QualityMetrics,
  emptyTitles: string[],
  role: string,
): string[] {
  const issues: string[] = [];
  const expected = calculateExpectedMetrics(m.filePath, role);

  if (m.lineCount < expected.minLines) {
    issues.push(`Insufficient lines: ${m.lineCount}/${expected.minLines} (based on module complexity)`);
  }
  if (m.sectionCount < expected.minSections) {
    issues.push(`Insufficient sections: ${m.sectionCount}/${expected.minSections}`);
  }
  if (m.diagramCount < expected.minDiagrams) {
    issues.push(`Insufficient diagrams: ${m.diagramCount}/${expected.minDiagrams}`);
  }
  if (m.codeExampleCount < expected.minExamples) {
    issues.push(`Insufficient code examples: ${m.codeExampleCount}/${expected.minExamples}`);
  }
  if (!m.hasSourceTracing && expected.minLines >= 150) {
    issues.push('Missing source tracing (add "**Source references**" / "**Diagram data sources**" sections)');
  }
  if (expected.minSections >= 6) {
    if (!m.hasBestPractices) issues.push('Core module missing "Best Practices" section');
    if (!m.hasPerformance) issues.push('Core module missing "Performance Optimization" section');
    if (!m.hasTroubleshooting) issues.push('Core module missing "Error Handling" section');
  }
  if (role !== 'index' && m.crossLinkCount < 1) {
    issues.push('Missing cross-links to related documents');
  }
  for (const title of emptyTitles) {
    issues.push(`Empty section: "${title}"`);
  }

  return issues;
}

/**
 * Extract all mermaid blocks from markdown content with their line numbers.
 */
function extractMermaidBlocks(
  lines: string[],
): Array<{ line: number; body: string }> {
  const blocks: Array<{ line: number; body: string }> = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '```mermaid') {
      const startLine = i + 1;
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') {
        bodyLines.push(lines[i]);
        i++;
      }
      blocks.push({ line: startLine, body: bodyLines.join('\n') });
    }
    i++;
  }
  return blocks;
}

/**
 * Validate Mermaid syntax in a single diagram body.
 * Only checks rules that cause actual Mermaid parser errors or render failures.
 * Removed overly strict rules (non-ASCII IDs, quoted labels) that Mermaid officially supports.
 */
function validateMermaidDiagram(
  body: string,
  baseLine: number,
): MermaidIssue[] {
  const issues: MermaidIssue[] = [];
  const diagramLines = body.split('\n');

  // 1. Collect all IDs and detect conflicts
  // Mermaid uses a shared namespace for all IDs
  const allIds = new Map<string, { line: number; type: 'node' | 'subgraph' }>();
  const nodeIdRegex = /^([A-Za-z0-9_]+)\[/;
  // subgraph ID[...] or subgraph ID [...] - ID and [ may have spaces between them
  const subgraphIdRegex = /^subgraph\s+([A-Za-z0-9_]+)\s*\[/;

  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('%%')) continue;

    // Collect node IDs: A[...], A("..."), A["..."]
    const nodeMatch = line.match(nodeIdRegex);
    if (nodeMatch) {
      const id = nodeMatch[1];
      if (allIds.has(id)) {
        const existing = allIds.get(id)!;
        issues.push({
          severity: 'error',
          line: baseLine + i,
          message: `Node ID "${id}" duplicates ${existing.type} ID at line ${existing.line} — causes render error`,
          suggestion: `Rename to avoid conflict, e.g. "${id}_node[...]"`,
        });
      }
      allIds.set(id, { line: baseLine + i, type: 'node' });
    }

    // Collect subgraph container IDs: subgraph ID[...]
    const subgraphMatch = line.match(subgraphIdRegex);
    if (subgraphMatch) {
      const id = subgraphMatch[1];
      if (allIds.has(id)) {
        const existing = allIds.get(id)!;
        issues.push({
          severity: 'error',
          line: baseLine + i,
          message: `subgraph ID "${id}" duplicates ${existing.type} ID at line ${existing.line} — causes render error`,
          suggestion: `Rename to avoid conflict, e.g. "subgraph ${id}_sub[...]"`,
        });
      }
      allIds.set(id, { line: baseLine + i, type: 'subgraph' });
    }
  }

  // 3. Reserved keywords as bare IDs (causes Mermaid parser errors)
  const reserved = [
    'class',
    'graph',
    'digraph',
    'subgraph',
    'end',
    'click',
    'style',
    'state',
    'note',
  ];
  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('%%')) continue;
    for (const kw of reserved) {
      // e.g. class["class"] or class{{class}} — bare kw before [ or {{
      const bareKw = new RegExp(`^${kw}\\[`);
      if (bareKw.test(line)) {
        issues.push({
          severity: 'error',
          line: baseLine + i,
          message: `ID "${kw}" is a Mermaid reserved keyword — causes parser error`,
          suggestion: `Rename to avoid the conflict, e.g. "NodeClass${kw}"`,
        });
      }
    }
  }

  // 4. Unescaped quotes inside node labels (causes Mermaid parser errors)
  // Pattern: A[text "with" quotes] without escaping
  // Mermaid requires: A[text &quot;with&quot; quotes] or use quoted labels A["text with quotes"]
  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('%%')) continue;

    // Match unescaped quotes in plain labels:
    // - ID[text "with" quotes] - plain label with unescaped quotes (ERROR)
    // - ID["text"] - quoted label (VALID, do not match)
    // - ID["tooltip","label"] - tooltip with label (VALID, do not match)
    const plainLabelWithQuotes = /^\s*([A-Za-z0-9_]+)\[([^"\[]*\"[^"\[]*)+\]/;
    const quotedLabel = /^\s*([A-Za-z0-9_]+)\["[^"\]]+"\](?:\s*,|\s*\[|$)/;

    if (quotedLabel.test(line)) continue; // Skip valid quoted labels

    const m = line.match(plainLabelWithQuotes);
    if (m) {
      issues.push({
        severity: 'error',
        line: baseLine + i,
        message: `Unescaped quote in plain label: ${m[0].substring(0, 40)}...`,
        suggestion: `Use quoted labels: A["label with \"quotes\""] or escape: A[label &quot;with&quot; quotes]`,
      });
    }
  }

  return issues;
}

/**
 * Auto-fix Mermaid ID conflicts by renaming duplicate IDs.
 * Returns fixed diagram body and list of fixes applied.
 */
export function fixMermaidDiagram(body: string): { fixed: string; fixedIds: string[] } {
  const lines = body.split('\n');
  const fixedIds: string[] = [];
  const allIds = new Set<string>();

  const nodeIdRegex = /^([A-Za-z0-9_]+)\[/;
  const subgraphIdRegex = /^subgraph\s+([A-Za-z0-9_]+)\[/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('%%')) continue;

    // Process node IDs
    const nodeMatch = line.match(nodeIdRegex);
    if (nodeMatch) {
      const id = nodeMatch[1];
      if (allIds.has(id)) {
        // ID conflict detected — auto-fix by renaming node
        const newId = `${id}_node`;
        lines[i] = lines[i].replace(new RegExp(`(?<!_)${id}(?=\\[)`), newId);
        fixedIds.push(`${id} → ${newId}`);
        allIds.add(newId);
      } else {
        allIds.add(id);
      }
    }

    // Process subgraph IDs
    const subgraphMatch = line.match(subgraphIdRegex);
    if (subgraphMatch) {
      const id = subgraphMatch[1];
      if (allIds.has(id)) {
        // ID conflict detected — auto-fix by renaming subgraph
        const newId = `${id}_sub`;
        lines[i] = lines[i].replace(new RegExp(`(?<!_)${id}(?=\\[)`), newId);
        fixedIds.push(`${id} → ${newId}`);
        allIds.add(newId);
      } else {
        allIds.add(id);
      }
    }
  }

  return { fixed: lines.join('\n'), fixedIds };
}

/**
 * Scan all mermaid blocks in a file and return issues.
 */
export function checkMermaidSyntax(content: string): MermaidIssue[] {
  const lines = content.split('\n');
  const blocks = extractMermaidBlocks(lines);
  const allIssues: MermaidIssue[] = [];
  for (const block of blocks) {
    // First validate the original diagram for ID conflicts
    const originalIssues = validateMermaidDiagram(block.body, block.line);
    allIssues.push(...originalIssues);
    
    // Also check for auto-fixable issues and report them as warnings
    const { fixed, fixedIds } = fixMermaidDiagram(block.body);
    if (fixedIds.length > 0) {
      for (const fix of fixedIds) {
        // Check if this fix was already reported as an error
        const alreadyReported = originalIssues.some(
          issue => issue.message.includes('duplicates') && issue.message.includes(fix.split(' → ')[0])
        );
        if (!alreadyReported) {
          allIssues.push({
            severity: 'warn',
            line: block.line,
            message: `Auto-fixed ID conflict: ${fix}`,
            suggestion: 'Fixed automatically, but please update source to avoid this warning',
          });
        }
      }
    }
  }
  return allIssues;
}

export function analyzeDocument(
  filePath: string,
  lang?: string,
  explicitRole?: string,
  wikiDir?: string,
): QualityMetrics {
  const metrics: QualityMetrics = {
    filePath: filePath,
    lineCount: 0,
    sectionCount: 0,
    subsectionCount: 0,
    emptySectionCount: 0,
    diagramCount: 0,
    codeExampleCount: 0,
    tableCount: 0,
    crossLinkCount: 0,
    hasSourceTracing: false,
    hasBestPractices: false,
    hasPerformance: false,
    hasTroubleshooting: false,
    qualityLevel: 'basic',
    issues: [],
    mermaidIssues: [],
  };

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    metrics.issues.push(`Unable to read file: ${e}`);
    return metrics;
  }

  // Mermaid syntax validation (post-generation check, not pre-generation constraint)
  metrics.mermaidIssues = checkMermaidSyntax(content);

  const lines = content.split('\n');
  metrics.lineCount = lines.length;

  // 统计 H2 章节 / Count H2 sections
  metrics.sectionCount = (content.match(/^## /gm) || []).length;

  // 统计 H3 章节 / Count H3 sections
  metrics.subsectionCount = (content.match(/^### /gm) || []).length;

  // 统计空章节 / Count empty sections
  const { count: emptyCount, titles: emptyTitles } = countEmptySections(lines);
  metrics.emptySectionCount = emptyCount;

  // 统计 Mermaid 图表 / Count Mermaid diagrams
  metrics.diagramCount = (content.match(/```mermaid[\s\S]*?```/g) || []).length;

  // 统计代码示例 (排除 mermaid) / Count code examples (exclude mermaid)
  metrics.codeExampleCount = (content.match(/```(?!mermaid)[\s\S]*?```/g) || []).length;

  // 统计表格 / Count tables
  const tableRows = (content.match(/^\|.*\|$/gm) || []).length;
  metrics.tableCount = Math.floor(tableRows / 2);

  // 统计交叉链接 / Count cross-links
  metrics.crossLinkCount = (content.match(/\[.*?\]\((?!http).*?\.md.*?\)/g) || []).length;

  // 检查源码追溯 / Check source tracing
  metrics.hasSourceTracing = /\*\*Source references\*\*|\*\*Diagram data sources\*\*/.test(content);

  // 检查关键章节（语言感知）/ Check key sections (language-aware)
  const lower = content.toLowerCase();
  const labels = getTocLabels(lang ?? getPrimaryLangFromConfig(filePath) ?? 'en');
  metrics.hasBestPractices = labels.bestPractices.some(k => lower.includes(k.toLowerCase()));
  metrics.hasPerformance = labels.performance.some(k => lower.includes(k.toLowerCase()));
  metrics.hasTroubleshooting = labels.troubleshooting.some(k => lower.includes(k.toLowerCase()));

  const role = explicitRole ?? (wikiDir ? inferRoleFromWikiPath(wikiDir, filePath) : 'auto');
  metrics.qualityLevel = evaluateQualityLevel(metrics, role);
  metrics.issues = generateIssues(metrics, emptyTitles, role);

  return metrics;
}

export function analyzeWiki(wikiPath: string, defaultRole?: string): QualityReport {
  // Resolve relative paths to absolute — fs.existsSync('.nium-wiki/wiki') would resolve
  // from cwd, which may not be the project root (e.g. when called from a skill context).
  const resolvedWikiPath = path.isAbsolute(wikiPath) ? wikiPath : path.resolve(wikiPath);
  const report: QualityReport = {
    wikiPath: wikiPath,
    checkTime: new Date().toISOString(),
    totalDocs: 0,
    professionalCount: 0,
    standardCount: 0,
    basicCount: 0,
    docs: [],
    summaryIssues: [],
  };

  const wikiDir = path.join(resolvedWikiPath, 'wiki');
  if (!fs.existsSync(wikiDir)) {
    report.summaryIssues.push(`Wiki directory does not exist: ${wikiDir}`);
    return report;
  }

  const lang = getPrimaryLangFromConfig(wikiDir) ?? inferLangFromDir(wikiDir);
  const mdFiles = walkFiles(wikiDir, { extensions: ['.md'] });
  for (const mdFile of mdFiles) {
    const metrics = analyzeDocument(mdFile, lang, defaultRole, wikiDir);
    report.docs.push(metrics);
    report.totalDocs++;

    if (metrics.qualityLevel === 'professional') report.professionalCount++;
    else if (metrics.qualityLevel === 'standard') report.standardCount++;
    else report.basicCount++;
  }

  return report;
}

/**
 * Returns true if the report contains any Mermaid syntax errors (severity=error).
 */
export function hasMermaidErrors(report: QualityReport): boolean {
  return report.docs.some(d => d.mermaidIssues.some(i => i.severity === 'error'));
}

/** Shell exit codes for doc quality level. */
const EXIT_QUALITY_OK = 0;
const EXIT_HAS_BASIC = 1;
const EXIT_MOSTLY_BASIC = 2;

export function printQualityReport(report: QualityReport, verbose = false): number {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Nium-Wiki Documentation Quality Check Report');
  console.log('='.repeat(60));
  console.log(`📁 Wiki Path: ${report.wikiPath}`);
  console.log(`🕐 Check Time: ${report.checkTime}`);
  console.log();

  const total = Math.max(1, report.totalDocs);
  console.log('## 📈 Overall Statistics\n');
  console.log('| Metric | Value |');
  console.log('|--------|-------|');
  console.log(`| Total Docs | ${report.totalDocs} |`);
  console.log(`| 🟢 Professional | ${report.professionalCount} (${(report.professionalCount / total * 100).toFixed(1)}%) |`);
  console.log(`| 🟡 Standard | ${report.standardCount} (${(report.standardCount / total * 100).toFixed(1)}%) |`);
  console.log(`| 🔴 Basic | ${report.basicCount} (${(report.basicCount / total * 100).toFixed(1)}%) |`);
  console.log();

  const totalMermaidErrors = report.docs.reduce(
    (sum, d) => sum + d.mermaidIssues.filter(i => i.severity === 'error').length,
    0,
  );
  const totalMermaidWarns = report.docs.reduce(
    (sum, d) => sum + d.mermaidIssues.filter(i => i.severity === 'warn').length,
    0,
  );
  console.log(`| 🧩 Mermaid Diagrams | ${report.docs.reduce((s, d) => s + d.diagramCount, 0)} |`);
  if (totalMermaidErrors > 0 || totalMermaidWarns > 0) {
    console.log(`| ⚠️ Mermaid Errors | ${totalMermaidErrors} |`);
    console.log(`| ⚠️ Mermaid Warnings | ${totalMermaidWarns} |`);
  }
  console.log();

  const basicDocs = report.docs.filter(d => d.qualityLevel === 'basic');
  const standardDocs = report.docs.filter(d => d.qualityLevel === 'standard');

  if (basicDocs.length) {
    console.log('## 🔴 Docs Needing Upgrade (Basic)\n');
    console.log('| Document | Lines | Sections | Diagrams | Issues |');
    console.log('|----------|-------|----------|----------|--------|');
    for (const doc of basicDocs) {
      const relPath = path.basename(doc.filePath);
      console.log(`| ${relPath} | ${doc.lineCount} | ${doc.sectionCount} | ${doc.diagramCount} | ${doc.issues.length} |`);
    }
    console.log();
  }

  if (standardDocs.length) {
    console.log('## 🟡 Docs Can Be Optimized (Standard)\n');
    console.log('| Document | Lines | Sections | Diagrams | Issues |');
    console.log('|----------|-------|----------|----------|--------|');
    for (const doc of standardDocs) {
      const relPath = path.basename(doc.filePath);
      console.log(`| ${relPath} | ${doc.lineCount} | ${doc.sectionCount} | ${doc.diagramCount} | ${doc.issues.length} |`);
    }
    console.log();
  }

  if (verbose) {
    console.log('## 📋 Detailed Issue List\n');
    for (const doc of report.docs) {
      if (doc.issues.length) {
        const relPath = path.relative(report.wikiPath, doc.filePath);
        console.log(`### ${relPath} [${doc.qualityLevel.toUpperCase()}]\n`);
        for (const issue of doc.issues) {
          console.log(`- ⚠️ ${issue}`);
        }
        console.log();
      }
    }

    // ── Mermaid syntax issues ──
    const docsWithMermaidIssues = report.docs.filter(d => d.mermaidIssues.length > 0);
    if (docsWithMermaidIssues.length) {
      console.log('## 🔴 Mermaid Syntax Issues\n');
      console.log('| Document | Line | Severity | Message | Suggestion |');
      console.log('|----------|------|----------|---------|------------|');
      for (const doc of docsWithMermaidIssues) {
        const relPath = path.relative(report.wikiPath, doc.filePath);
        for (const mi of doc.mermaidIssues) {
          const icon = mi.severity === 'error' ? '🔴' : '⚠️';
          console.log(
            `| ${relPath} | ${mi.line} | ${icon} ${mi.severity} | ${mi.message} | ${mi.suggestion} |`,
          );
        }
      }
      console.log();
    }
  }

  console.log('## 💡 Improvement Suggestions\n');
  if (report.basicCount > 0) {
    console.log(`- Run \`upgrade wiki\` command to upgrade ${report.basicCount} Basic-level docs`);
  }
  if (!report.docs.some(d => d.hasSourceTracing)) {
    console.log('- Add source tracing (Section sources / Diagram sources)');
  }
  const totalEmpty = report.docs.reduce((sum, d) => sum + d.emptySectionCount, 0);
  if (totalEmpty > 0) {
    console.log(`- Fill in content for ${totalEmpty} empty sections`);
  }
  console.log();
  console.log('='.repeat(60));

  if (report.basicCount > report.totalDocs * 0.5) return EXIT_MOSTLY_BASIC;
  if (report.basicCount > 0) return EXIT_HAS_BASIC;
  return EXIT_QUALITY_OK;
}

export function saveReportJson(report: QualityReport, outputPath: string): void {
  const data = {
    wikiPath: report.wikiPath,
    checkTime: report.checkTime,
    summary: {
      total: report.totalDocs,
      professional: report.professionalCount,
      standard: report.standardCount,
      basic: report.basicCount,
    },
    docs: report.docs.map(doc => ({
      file: doc.filePath,
      metrics: {
        lines: doc.lineCount,
        sections: doc.sectionCount,
        emptySections: doc.emptySectionCount,
        diagrams: doc.diagramCount,
        codeExamples: doc.codeExampleCount,
        tables: doc.tableCount,
        crossLinks: doc.crossLinkCount,
        hasSourceTracing: doc.hasSourceTracing,
        hasBestPractices: doc.hasBestPractices,
        hasPerformance: doc.hasPerformance,
        hasTroubleshooting: doc.hasTroubleshooting,
      },
      qualityLevel: doc.qualityLevel,
      issues: doc.issues,
      mermaidIssues: doc.mermaidIssues,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`📄 Report saved to: ${outputPath}`);
}
