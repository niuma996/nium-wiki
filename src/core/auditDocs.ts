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

function evaluateQualityLevel(m: QualityMetrics): 'basic' | 'standard' | 'professional' {
  let score = 0;
  const totalSections = m.sectionCount + m.subsectionCount;

  // ── 结构完整性 / Structural completeness (max 5) ──
  if (m.sectionCount >= 12) score += 3;
  else if (m.sectionCount >= 8) score += 2;
  else if (m.sectionCount >= 5) score += 1;

  if (totalSections > 0 && m.emptySectionCount / totalSections <= 0.1) score += 1;

  if (m.subsectionCount >= 1) score += 1;

  // ── 内容丰富度 / Content richness (max 5) ──
  if (m.diagramCount >= 3) score += 3;
  else if (m.diagramCount >= 2) score += 2;
  else if (m.diagramCount >= 1) score += 1;

  if (m.codeExampleCount >= 3) score += 2;
  else if (m.codeExampleCount >= 1) score += 1;

  // ── 链接与追溯 / Links and traceability (max 4) ──
  if (m.crossLinkCount >= 3) score += 2;
  else if (m.crossLinkCount >= 1) score += 1;

  if (m.hasSourceTracing) score += 2;

  // ── 行数门槛 / Line count threshold (max 1) ──
  if (m.lineCount >= 50) score += 1;

  if (score >= 12) return 'professional';
  if (score >= 7) return 'standard';
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

  // 顶级目录名直接映射（目录结构比文件名更权威）
  if (['core', 'internal'].includes(firstDir)) return 'core';
  // 其他顶级目录（api/, serve/, commands/ 等）按 filename 检测
  return 'auto';
}

function calculateExpectedMetrics(filePath: string, role?: string): ExpectedMetrics {
  const expected: ExpectedMetrics = {
    minLines: 100,
    minSections: 6,
    minDiagrams: 1,
    minExamples: 2,
  };

  // 显式 role 优先（CLI --role 参数覆盖一切推断）
  if (role === 'core') {
    expected.minLines = 200;
    expected.minSections = 8;
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
    expected.minDiagrams = 1;
    expected.minExamples = 0;
  } else {
    // 退化：文件名关键词检测（原有逻辑）
    const fileName = path.basename(filePath, '.md').toLowerCase();

    const coreKeywords = ['core', 'agent', 'editor', 'store', 'main', 'client'];
    const isCore = coreKeywords.some(kw => fileName.includes(kw));

    const utilKeywords = ['util', 'helper', 'common', 'shared', 'constant', 'config', 'type'];
    const isUtil = utilKeywords.some(kw => fileName.includes(kw));

    const isIndex = ['index', '_index', 'toc', 'doc-map'].includes(fileName);

    if (isCore) {
      expected.minLines = 200;
      expected.minSections = 8;
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
      expected.minDiagrams = 1;
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
      if (/^#{1,3} /.test(lines[j])) break;
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
  wikiDir: string | undefined,
  explicitRole?: string,
): string[] {
  const issues: string[] = [];
  // 推断顺序: explicit role > 目录结构 > 文件名
  const role = explicitRole ?? (wikiDir ? inferRoleFromWikiPath(wikiDir, m.filePath) : 'auto');
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
    issues.push('Missing source tracing (Section sources)');
  }
  if (expected.minSections >= 8) {
    if (!m.hasBestPractices) issues.push('Core module missing "Best Practices" section');
    if (!m.hasPerformance) issues.push('Core module missing "Performance Optimization" section');
    if (!m.hasTroubleshooting) issues.push('Core module missing "Error Handling" section');
  }
  if (m.crossLinkCount < 1) {
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
/**
 * Collect all subgraph container IDs in a diagram.
 */
function collectSubgraphIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('%%')) continue;
    const m = trimmed.match(/^subgraph\s+([A-Za-z0-9_]+)\[/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

/**
 * Check if a line (by index) is inside a subgraph whose container ID matches `id`.
 * Uses indentation as a proxy: a line is inside a subgraph when a prior "subgraph ID[...]" line
 * is at a lower indentation level and no "end" has closed it since.
 */
function isInsideSubgraph(lines: string[], lineIdx: number, id: string): boolean {
  let depth = 0;
  for (let i = 0; i <= lineIdx; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('%%')) continue;
    if (/^subgraph\s+[A-Za-z0-9_]+\[/.test(trimmed)) {
      depth++;
    }
    if (trimmed === 'end') {
      depth = Math.max(0, depth - 1);
    }
    // Check if this subgraph's ID matches our id
    const m = trimmed.match(/^subgraph\s+([A-Za-z0-9_]+)\[/);
    if (m && m[1] === id && i < lineIdx && depth > 0) {
      return true;
    }
  }
  return false;
}

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
 * Returns an array of issues found.
 */
function validateMermaidDiagram(
  body: string,
  baseLine: number,
): MermaidIssue[] {
  const issues: MermaidIssue[] = [];
  const diagramLines = body.split('\n');

  // 1. Collect all node IDs (from `ID[...]`, `ID(...)`, `ID["..."]`, `ID("...")`)
  const nodeIdSet = new Set<string>();
  const nodeIdRegex = /^([A-Za-z0-9_]+)\[/;
  for (const line of diagramLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('%%')) continue;
    const match = trimmed.match(nodeIdRegex);
    if (match) {
      nodeIdSet.add(match[1]);
    }
  }

  // 2. Check subgraph IDs for non-alphanumeric characters and invalid quoted-label format
  const subgraphNonAscii = /^subgraph\s+([^[\s"\-]+)\[/;
  const subgraphQuotedLabel = /^subgraph\s+([A-Za-z0-9_]+)\["[^"]+"\](?:\s*\[|$)/;
  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('%%')) continue;
    if (!line.startsWith('subgraph')) continue;

    const m = line.match(subgraphNonAscii);
    if (m) {
      const id = m[1];
      if (!/^[A-Za-z0-9_]+$/.test(id)) {
        issues.push({
          severity: 'warn',
          line: baseLine + i,
          message: `subgraph ID "${id}" contains non-alphanumeric characters — may be unstable`,
          suggestion: `Use an English alphanumeric ID, e.g. "subgraph ${id.replace(/[^A-Za-z0-9_]/g, '_')}[...]"`,
        });
      }
    }

    const qm = line.match(subgraphQuotedLabel);
    if (qm) {
      issues.push({
        severity: 'error',
        line: baseLine + i,
        message: `subgraph declaration uses invalid format: subgraph ${qm[1]}["label"][] — double brackets`,
        suggestion: `Use "subgraph ${qm[1]} [label]" instead (space between ID and label, no extra brackets)`,
      });
    }
  }

  // 3. Check for subgraph ID collision with node IDs
  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('subgraph')) {
      // subgraph ID is the first token after "subgraph" and before "["
      const m = line.match(/^subgraph\s+([A-Za-z0-9_]+)\[/);
      if (m) {
        const sgId = m[1];
        if (nodeIdSet.has(sgId)) {
          issues.push({
            severity: 'error',
            line: baseLine + i,
            message: `subgraph ID "${sgId}" duplicates a node ID in the same diagram — causes render error`,
            suggestion: `Rename the subgraph ID, e.g. "subgraph ${sgId}_sub[...]" and update inter-subgraph edges`,
          });
        }
      }
    }
  }

  // 4. Check for non-ASCII characters in node IDs
  const nodeIdNonAscii =
    /^([A-Za-z0-9_]+)\[/;
  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('%%')) continue;
    const m = line.match(nodeIdNonAscii);
    if (m) {
      const id = m[1];
      if (/[^A-Za-z0-9_]/.test(id)) {
        issues.push({
          severity: 'error',
          line: baseLine + i,
          message: `Node ID "${id}" contains non-alphanumeric characters`,
          suggestion: `Replace with alphanumeric only, e.g. "${id.replace(/[^A-Za-z0-9_]/g, '_')}"`,
        });
      }
    }
  }

  // 5. Reserved keywords as bare IDs
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
          message: `ID "${kw}" is a Mermaid reserved keyword`,
          suggestion: `Rename to avoid the conflict, e.g. "NodeClass${kw}"`,
        });
      }
    }
  }

  // 6. ID["text"] is never valid as a label in Mermaid (quotes only work for tooltips)
  //    Mermaid supports:  A[plain]   A["tooltip"]   A["tooltip","label"]
  //    Mermaid does NOT support: A["Label Text"]
  const invalidQuotedLabel = /^\s*([A-Za-z0-9_]+)\["[^"]+"\]\s*$/;
  for (let i = 0; i < diagramLines.length; i++) {
    const line = diagramLines[i].trim();
    if (line.startsWith('%%')) continue;
    const m = line.match(invalidQuotedLabel);
    if (m) {
      const nodeId = m[1];
      const label = m[2] ?? line.match(/"([^"]+)"/)?.[1] ?? '';
      // Determine if inside a subgraph with a matching container ID
      const subgraphIds = collectSubgraphIds(diagramLines);
      const inMatchingSubgraph = isInsideSubgraph(diagramLines, i, nodeId);
      const isSubgraphCollision = inMatchingSubgraph && subgraphIds.has(nodeId);

      if (isSubgraphCollision) {
        issues.push({
          severity: 'error',
          line: baseLine + i,
          message: `Node "${nodeId}["${label}"]" — the quoted format is invalid as a label AND "${nodeId}" is already the container ID of its parent subgraph`,
          suggestion: `Use "${nodeId}_node[${label}]" instead (rename to avoid ID collision, remove quotes for the label)`,
        });
      } else {
        issues.push({
          severity: 'error',
          line: baseLine + i,
          message: `Node "${nodeId}["${label}"]" uses quoted label format — Mermaid does not support quoted labels (quotes are only valid for tooltips)`,
          suggestion: `Use "${nodeId}[${label}]" (remove quotes for plain labels) or "${nodeId}["${label}","${label}"]" (if you need a tooltip)`,
        });
      }
    }
  }

  return issues;
}

/**
 * Scan all mermaid blocks in a file and return issues.
 */
export function checkMermaidSyntax(content: string): MermaidIssue[] {
  const lines = content.split('\n');
  const blocks = extractMermaidBlocks(lines);
  const allIssues: MermaidIssue[] = [];
  for (const block of blocks) {
    const issues = validateMermaidDiagram(block.body, block.line);
    allIssues.push(...issues);
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
    metrics.issues.push(`无法读取文件: ${e}`);
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
  metrics.hasSourceTracing = /\*\*Section sources\*\*|\*\*Diagram sources\*\*|file:\/\//.test(content);

  // 检查关键章节（语言感知）/ Check key sections (language-aware)
  const lower = content.toLowerCase();
  const labels = getTocLabels(lang ?? getPrimaryLangFromConfig(filePath) ?? 'en');
  metrics.hasBestPractices = labels.bestPractices.some(k => lower.includes(k.toLowerCase()));
  metrics.hasPerformance = labels.performance.some(k => lower.includes(k.toLowerCase()));
  metrics.hasTroubleshooting = labels.troubleshooting.some(k => lower.includes(k.toLowerCase()));

  metrics.qualityLevel = evaluateQualityLevel(metrics);
  metrics.issues = generateIssues(metrics, emptyTitles, wikiDir, explicitRole);

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

  if (report.basicCount > report.totalDocs * 0.5) return 2;
  if (report.basicCount > 0) return 1;
  return 0;
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
