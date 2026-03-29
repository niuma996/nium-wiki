/**
 * Nium-Wiki 文档质量检查模块 / Documentation quality check module
 * 检查生成的文档是否符合质量标准 / Check if generated documentation meets quality standards
 */

import * as fs from 'fs';
import * as path from 'path';
import { walkFiles } from '../utils/fileWalker';
import { inferLangFromDir, getTocLabels } from '../utils/i18n';

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

function calculateExpectedMetrics(filePath: string): ExpectedMetrics {
  const expected: ExpectedMetrics = {
    minLines: 100,
    minSections: 6,
    minDiagrams: 1,
    minExamples: 2,
  };

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

function generateIssues(m: QualityMetrics, emptyTitles: string[]): string[] {
  const issues: string[] = [];
  const expected = calculateExpectedMetrics(m.filePath);

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

export function analyzeDocument(filePath: string, lang?: string): QualityMetrics {
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
  };

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    metrics.issues.push(`无法读取文件: ${e}`);
    return metrics;
  }

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
  const labels = getTocLabels(lang ?? 'en');
  metrics.hasBestPractices = labels.bestPractices.some(k => lower.includes(k.toLowerCase()));
  metrics.hasPerformance = labels.performance.some(k => lower.includes(k.toLowerCase()));
  metrics.hasTroubleshooting = labels.troubleshooting.some(k => lower.includes(k.toLowerCase()));

  metrics.qualityLevel = evaluateQualityLevel(metrics);
  metrics.issues = generateIssues(metrics, emptyTitles);

  return metrics;
}

export function analyzeWiki(wikiPath: string): QualityReport {
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

  const wikiDir = path.join(wikiPath, 'wiki');
  if (!fs.existsSync(wikiDir)) {
    report.summaryIssues.push(`Wiki directory does not exist: ${wikiDir}`);
    return report;
  }

  const lang = inferLangFromDir(wikiDir, 'en');
  const mdFiles = walkFiles(wikiDir, { extensions: ['.md'] });
  for (const mdFile of mdFiles) {
    const metrics = analyzeDocument(mdFile, lang);
    report.docs.push(metrics);
    report.totalDocs++;

    if (metrics.qualityLevel === 'professional') report.professionalCount++;
    else if (metrics.qualityLevel === 'standard') report.standardCount++;
    else report.basicCount++;
  }

  return report;
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
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`📄 Report saved to: ${outputPath}`);
}
