/**
 * Module Analysis Command
 * 模块分析命令
 *
 * Code takes over the quantitative work of module classification (file count, export count, complexity, dependency count),
 * 代码接管模块分类的量化工作（文件数、导出数、复杂度、依赖数），
 * outputting structured signals for the model to make final semantic decisions.
 * 输出结构化信号供模型做最终语义决策。
 *
 * Design principles:
 * 设计原则：
 * - Code is responsible for deterministic, quantifiable metrics
 * - 代码负责确定性、可量化的指标
 * - Model retains final role judgment rights (recommendation.isOverrideable = true)
 * - 模型保留最终角色判断权（recommendation.isOverrideable = true）
 */

import * as fs from 'fs';
import * as path from 'path';
import { languageHandlerManager } from '../language-handlers/index';
import { loadDependencyGraph } from '../core/buildDeps';

export type ModuleRole = 'core' | 'api' | 'utility' | 'ui' | 'test' | 'config' | 'unknown';
export type TemplateType = 'module.md' | 'module-simple.md';
export type DocScope = 'core' | 'overview' | '_index';

// ─── Output Structure ───────────────────────────────────────────────
// ─── 输出结构 ───────────────────────────────────────────────

export interface ModuleSignals {
  /** Number of files / 文件数量 */
  fileCount: number;
  /** Estimated line count (sum of all files) / 代码行数估算（所有文件总和） */
  estimatedLines: number;
  /** Estimated number of public exports / 公开导出数量估算 */
  exportCount: number;
  /** Entry file marker (whether on project entry path) / 入口文件标记（是否在项目入口路径上） */
  isEntry: boolean;
  /** In-degree: how many other modules depend on this module / 入度：被多少其他模块依赖 */
  incomingDeps: number;
  /** Out-degree: how many other modules this module depends on / 出度：依赖多少其他模块 */
  outgoingDeps: number;
  /** Maximum nesting depth (used for complexity assessment) / 最大嵌套深度（用于复杂度评估） */
  maxNestingDepth: number;
  /** Complexity score (0-100) / 复杂度评分（0-100） */
  complexityScore: number;
  /** Primary language / 主要语言 */
  primaryLanguage: string | null;
}

export interface TemplateRecommendation {
  /** Recommended template type / 推荐的模板类型 */
  template: TemplateType;
  /** Reason for recommendation / 推荐理由 */
  reason: string;
  /** Quantitative basis / 量化依据 */
  basis: {
    complexityScore: number;
    exportCount: number;
    fileCount: number;
  };
}

export interface RoleRecommendation {
  /** Recommended module role / 推荐的模块角色 */
  role: ModuleRole;
  /** Reason for recommendation / 推荐理由 */
  reason: string;
  /** Signals that contributed most / 贡献最大的信号 */
  topSignals: string[];
}

export interface ModuleAnalysis {
  /** Module name (directory name) / 模块名称（目录名） */
  name: string;
  /** Path relative to project root / 相对项目根的路径 */
  path: string;
  /**
   * Document scope — primary signal for template selection:
   * - 'core': use module.md (11-section, 400+ lines, 2+ diagrams)
   * - 'overview': use overview.md (5-section, 80-150 lines)
   * - '_index': generate _index.md only (30-50 lines, no diagrams)
   * 文档范围 — 模板选择的主要信号
   */
  docScope: DocScope;
  /** Quantitative signals (from code) / 量化信号（代码负责） */
  signals: ModuleSignals;
  /** Template recommendation (overridable) / 模板推荐（可覆盖） */
  templateRecommendation: TemplateRecommendation;
  /** Role recommendation (overridable) / 角色推荐（可覆盖） */
  roleRecommendation: RoleRecommendation;
  /** Semantic hints for model reference / 供模型参考的语义提示 */
  semanticHints: string[];
}

export interface AnalyzeModuleOptions {
  /** Only output recommendations / 只输出推荐部分 */
  recommendOnly?: boolean;
  /** Output in JSON format / 输出 JSON 格式 */
  json?: boolean;
  /** Include public export list / 包含公开导出列表 */
  includeExports?: boolean;
}

// ─── Public Export Detection ────────────────────────────────────────────
// ─── 公开导出检测 ────────────────────────────────────────────

const EXPORT_PATTERNS: Record<string, RegExp[]> = {
  javascript: [
    /\bexport\s+(?:default\s+)?(?:class|function|const|interface|type)\s+(\w+)/gm,
    /\bexport\s*\{\s*([^}]+)\s*\}/gm,
    /\bmodule\.exports\s*=\s*\{([^}]+)\}/gm,
  ],
  python: [
    /\bdef\s+(\w+)\s*\(/gm,
    /\bclass\s+(\w+)\s*[\(:]/gm,
    /\b[A-Z][A-Za-z0-9]*\s*=/gm,
  ],
  go: [
    /\bfunc\s+(\w+)\s*\(/gm,
    /\bfunc\s+\([^)]+\)\s+(\w+)\s*\(/gm,
    /\btype\s+(\w+)\s+(?:struct|interface|func)/gm,
  ],
  rust: [
    /\b(?:pub\s+)?(?:fn|struct|enum|trait|impl)\s+(\w+)/gm,
    /\b(?:pub\s+)?const\s+(\w+)/gm,
  ],
  java: [
    /\b(?:public|protected)\s+(?:class|interface|enum)\s+(\w+)/gm,
    /\b(?:public|protected)\s+(?:static\s+)?(?:final\s+)?(?:void|int|String|boolean|List|Map|\w+)\s+(\w+)\s*\(/gm,
  ],
  dotnet: [
    /\b(?:public|internal)\s+(?:class|interface|struct|enum)\s+(\w+)/gm,
    /\b(?:public|internal)\s+(?:static\s+)?(?:readonly\s+)?(?:virtual\s+)?(?:async\s+)?(?:Task<)?(\w+)>?\s+(\w+)\s*\(/gm,
  ],
  ruby: [
    /\bdef\s+(?:self\.)?(\w+)/gm,
    /\bclass\s+(\w+)/gm,
  ],
  php: [
    /\b(?:public|private|protected)\s+(?:static\s+)?function\s+(\w+)\s*\(/gm,
    /\bclass\s+(\w+)/gm,
    /\binterface\s+(\w+)/gm,
  ],
};

/**
 * 提取模块中所有公开导出（按语言检测文件）
 * modulePath 可以是目录或单个源文件
 */
function extractExports(modulePath: string): { count: number; samples: string[] } {
  const exports = new Set<string>();
  const MAX_SAMPLES = 20;

  const processFile = (filePath: string): void => {
    const lang = languageHandlerManager.detectLanguageFromFile(path.basename(filePath));
    if (!lang) return;
    const patterns = EXPORT_PATTERNS[lang] || EXPORT_PATTERNS.javascript;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
          exports.add(match[1] || match[2] || match[3]);
          if (exports.size >= MAX_SAMPLES) return;
        }
      }
    } catch { /* skip unreadable files */ }
  };

  try {
    const stat = fs.statSync(modulePath);
    if (stat.isFile()) {
      processFile(modulePath);
    } else {
      const files = fs.readdirSync(modulePath, { withFileTypes: true });
      for (const entry of files) {
        if (!entry.isFile()) continue;
        processFile(path.join(modulePath, entry.name));
        if (exports.size >= MAX_SAMPLES) break;
      }
    }
  } catch { /* skip unreadable paths */ }

  return { count: exports.size, samples: [...exports].slice(0, 10) };
}

// ─── Complexity Calculation ──────────────────────────────────────────────
// ─── 复杂度计算 ──────────────────────────────────────────────

/**
 * 计算模块复杂度评分（0-100）
 * 综合：文件数 + 行数 + 嵌套深度 + 导出数
 * modulePath 可以是目录或单个源文件
 */
function calculateComplexity(
  modulePath: string,
  exportCount: number,
): { score: number; maxDepth: number; estimatedLines: number } {
  let totalLines = 0;
  let maxDepth = 0;
  let fileCount = 0;

  const processFile = (filePath: string, depth: number): void => {
    fileCount++;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').length;
      totalLines += lines;
      const indentLines = content.split('\n').filter(l => l.startsWith('  ') || l.startsWith('\t'));
      maxDepth = Math.max(maxDepth, depth + Math.min(Math.floor(indentLines.length / 20), 5));
    } catch { /* skip */ }
  };

  try {
    const stat = fs.statSync(modulePath);
    if (stat.isFile()) {
      if (languageHandlerManager.detectLanguageFromFile(path.basename(modulePath))) {
        processFile(modulePath, 0);
      }
    } else {
      const walk = (dir: string, depth = 0): void => {
        maxDepth = Math.max(maxDepth, depth);
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name), depth + 1);
          } else if (entry.isFile() && languageHandlerManager.detectLanguageFromFile(entry.name)) {
            processFile(path.join(dir, entry.name), depth);
          }
        }
      };
      walk(modulePath);
    }
  } catch { /* skip */ }

  // 归一化评分
  const fileScore = Math.min(fileCount * 3, 30);
  const lineScore = Math.min(totalLines / 50, 30);
  const exportScore = Math.min(exportCount * 1.5, 20);
  const depthScore = Math.min(maxDepth * 5, 20);
  const score = Math.round(fileScore + lineScore + exportScore + depthScore);

  return { score: Math.min(score, 100), maxDepth, estimatedLines: totalLines };
}

// ─── Dependency Statistics ───────────────────────────────────────────────
// ─── 依赖统计 ────────────────────────────────────────────────

interface DepStats {
  incoming: number;
  outgoing: number;
  isEntry: boolean;
}

/**
 * 从依赖图中统计模块的入度和出度
 * 注意：只统计模块级依赖（以模块路径前缀开头的文件）
 */
function getModuleDepStats(modulePath: string, graph: ReturnType<typeof loadDependencyGraph>): DepStats {
  const modulePrefix = modulePath.replace(/\\/g, '/') + '/';
  let incoming = 0;
  let outgoing = 0;
  let isEntry = false;

  if (!graph) return { incoming: 0, outgoing: 0, isEntry: false };

  for (const [file, deps] of Object.entries(graph.imports)) {
    if (file.startsWith(modulePrefix)) {
      outgoing += deps.length;
    }
  }

  for (const [file, importers] of Object.entries(graph.importedBy)) {
    if (file.startsWith(modulePrefix)) {
      incoming = importers.length;
    }
  }

  // 如果有外部依赖指向此模块，则可能是入口
  isEntry = incoming > 0;

  return { incoming, outgoing, isEntry };
}

// ─── Role Recommendation ────────────────────────────────────────────────
// ─── 角色推荐 ────────────────────────────────────────────────

/**
 * 基于量化信号推荐模块角色（结果标记为可覆盖）
 */
function recommendRole(
  moduleName: string,
  signals: ModuleSignals,
): RoleRecommendation {
  const lower = moduleName.toLowerCase();
  const topSignals: string[] = [];

  // 目录名启发式（基础信号）
  if (['test', 'spec', '__tests__'].some(k => lower.includes(k))) {
    return {
      role: 'test',
      reason: 'Directory name indicates test module',
      topSignals: ['directory name pattern'],
    };
  }

  if (['config', 'setting', 'conf'].some(k => lower.includes(k))) {
    return {
      role: 'config',
      reason: 'Directory name indicates configuration module',
      topSignals: ['directory name pattern'],
    };
  }

  if (['component', 'ui', 'view', 'page', 'widget'].some(k => lower.includes(k))) {
    return {
      role: 'ui',
      reason: 'Directory name indicates UI component module',
      topSignals: ['directory name pattern'],
    };
  }

  if (['util', 'helper', 'common', 'shared', 'tool'].some(k => lower.includes(k))) {
    return {
      role: 'utility',
      reason: 'Directory name indicates utility module',
      topSignals: ['directory name pattern'],
    };
  }

  if (['api', 'service', 'handler', 'endpoint'].some(k => lower.includes(k))) {
    return {
      role: 'api',
      reason: 'Directory name indicates API/service module',
      topSignals: ['directory name pattern'],
    };
  }

  // 量化信号推断
  if (signals.isEntry && signals.incomingDeps > 5) {
    topSignals.push('isEntry=true', `incomingDeps=${signals.incomingDeps}`);
    return {
      role: 'core',
      reason: 'Module is entry point with multiple dependents — likely core business logic',
      topSignals,
    };
  }

  if (signals.exportCount > 15) {
    topSignals.push(`exportCount=${signals.exportCount}`);
    return {
      role: 'core',
      reason: 'High export count suggests large public API surface — likely core module',
      topSignals,
    };
  }

  if (signals.complexityScore > 60) {
    topSignals.push(`complexityScore=${signals.complexityScore}`);
    return {
      role: 'core',
      reason: 'High complexity score suggests deep business logic',
      topSignals,
    };
  }

  if (signals.fileCount <= 5 && signals.exportCount <= 5) {
    topSignals.push(`fileCount=${signals.fileCount}`, `exportCount=${signals.exportCount}`);
    return {
      role: 'utility',
      reason: 'Small module with few exports — likely utility or helper module',
      topSignals,
    };
  }

  return {
    role: 'unknown',
    reason: 'Cannot determine role from directory name or signals. Semantic understanding required.',
    topSignals: [`fileCount=${signals.fileCount}`, `exportCount=${signals.exportCount}`, `complexityScore=${signals.complexityScore}`],
  };
}

// ─── Template Recommendation ──────────────────────────────────────────────
// ─── 模板推荐 ────────────────────────────────────────────────

/**
 * 基于复杂度推荐模板（结果标记为可覆盖）
 * Role-based overrides take priority over quantitative thresholds to stay consistent with deriveDocScope.
 */
function recommendTemplate(complexity: number, exportCount: number, role: ModuleRole): TemplateRecommendation {
  // Role-based rules (higher priority — must stay consistent with deriveDocScope)
  const roleToTemplate: Record<ModuleRole, TemplateType> = {
    core:    'module.md',
    api:     'module.md',
    ui:      'module.md',
    test:    'module-simple.md',
    config:  'module-simple.md',
    utility: 'module-simple.md',
    unknown: 'module.md',
  };
  const roleReasons: Record<ModuleRole, string> = {
    core:    'Core modules require comprehensive documentation',
    api:     'API modules need detailed endpoint documentation',
    ui:      'UI components need detailed props/API documentation',
    test:    'Test modules need concise documentation',
    config:  'Config modules typically have simple structure',
    utility: 'Utility modules benefit from concise docs',
    unknown: 'Default to full template when role is unclear',
  };

  if (role !== 'unknown') {
    return {
      template: roleToTemplate[role],
      reason: roleReasons[role],
      basis: { complexityScore: complexity, exportCount, fileCount: 0 },
    };
  }

  // Quantitative fallback for unknown role
  if (complexity >= 50 || exportCount >= 10) {
    return {
      template: 'module.md',
      reason: 'High complexity or export count — full template recommended',
      basis: { complexityScore: complexity, exportCount, fileCount: 0 },
    };
  }

  if (complexity < 30 && exportCount < 5) {
    return {
      template: 'module-simple.md',
      reason: 'Low complexity and few exports — simple template sufficient',
      basis: { complexityScore: complexity, exportCount, fileCount: 0 },
    };
  }

  return {
    template: 'module.md',
    reason: 'Default to full template when role is unclear',
    basis: { complexityScore: complexity, exportCount, fileCount: 0 },
  };
}

// ─── DocScope Derivation ──────────────────────────────────────────────────
// ─── 文档范围推导 ────────────────────────────────────────────

/**
 * Derive docScope from role + signals.
 * This is the primary signal the model uses to pick a template.
 * 从角色和信号推导文档范围，作为模型选择模板的主要信号。
 *
 * Mapping:
 *   role is core/api/ui OR complexity >= 50 OR exportCount >= 10 OR incomingDeps >= 5
 *                                         → 'core'   (module.md, 400+ lines)
 *   moduleName is '_index'                → '_index'  (30-50 lines, no diagrams)
 *   everything else                       → 'overview' (overview.md, 80-150 lines)
 */
function deriveDocScope(role: ModuleRole, signals: ModuleSignals, moduleName: string): DocScope {
  // _index targets: directory-level overview files only (not project entry index.ts)
  if (moduleName === '_index') return '_index';

  if (
    role === 'core' ||
    role === 'api' ||
    role === 'ui' ||
    signals.complexityScore >= 50 ||
    signals.exportCount >= 10 ||
    signals.incomingDeps >= 5
  ) {
    return 'core';
  }

  return 'overview';
}

// ─── Semantic Hint Generation ─────────────────────────────────────────────
// ─── 语义提示生成 ────────────────────────────────────────────

/**
 * 生成供模型参考的语义提示（不可量化的推断）
 */
function generateSemanticHints(moduleName: string, signals: ModuleSignals): string[] {
  const hints: string[] = [];
  const lower = moduleName.toLowerCase();

  // 目录名语义映射
  const semanticMap: Array<{ pattern: RegExp; hint: string }> = [
    { pattern: /\b(auth|user|account|login|permission|role)/i, hint: 'Authentication or user management module' },
    { pattern: /\b(api|rest|grpc|endpoint)/i, hint: 'API or network layer module' },
    { pattern: /\b(db|database|repo|store|persistence)/i, hint: 'Data persistence layer module' },
    { pattern: /\b(cache|redis|mem)/i, hint: 'Caching or in-memory storage module' },
    { pattern: /\b(queue|message|event|broadcast)/i, hint: 'Messaging or event handling module' },
    { pattern: /\b(worker|job|task|cron)/i, hint: 'Background job or task scheduling module' },
    { pattern: /\b(middleware|filter|interceptor)/i, hint: 'Middleware or request processing module' },
    { pattern: /\b(validator|schema|parser|encoder)/i, hint: 'Data processing or transformation module' },
    { pattern: /\b(logger|metrics|monitor|telemetry)/i, hint: 'Observability or monitoring module' },
    { pattern: /\b(cli|command|runner|executor)/i, hint: 'CLI or command execution module' },
  ];

  for (const { pattern, hint } of semanticMap) {
    if (pattern.test(lower)) {
      hints.push(hint);
    }
  }

  // 量化信号推断
  if (signals.exportCount > 20) {
    hints.push('Large public API surface — consider organizing into sub-modules');
  }

  if (signals.incomingDeps > 10) {
    hints.push('Widely depended upon — treat as stable public API');
  }

  if (signals.isEntry && signals.outgoingDeps > 10) {
    hints.push('Entry module with many dependencies — central orchestration point');
  }

  if (hints.length === 0) {
    hints.push('No strong semantic signals detected — use code structure and context to determine role');
  }

  return hints;
}

// ─── Main Analysis Function ───────────────────────────────────────────────
// ─── 主分析函数 ──────────────────────────────────────────────

export function analyzeModule(modulePath: string, projectRoot: string): ModuleAnalysis {
  const name = path.basename(modulePath);
  const relPath = path.relative(projectRoot, modulePath).replace(/\\/g, '/');

  // Detect language / 检测语言
  let primaryLang: string | null = null;
  try {
    const files = fs.readdirSync(modulePath, { withFileTypes: true });
    for (const f of files) {
      if (f.isFile()) {
        const lang = languageHandlerManager.detectLanguageFromFile(f.name);
        if (lang) { primaryLang = lang; break; }
      }
    }
  } catch { /* ignore */ }

  // Count files (prioritized for subsequent recommendations) / 文件数（优先计算，用于后续推荐）
  const fileCount = countModuleFiles(modulePath);

  // Public export statistics / 公开导出统计
  const exports = extractExports(modulePath);

  // Complexity score / 复杂度评分
  const { score, maxDepth, estimatedLines } = calculateComplexity(modulePath, exports.count);

  // Dependency statistics / 依赖统计
  const graph = loadDependencyGraph(projectRoot);
  const depStats = getModuleDepStats(relPath, graph);

  const signals: ModuleSignals = {
    fileCount,
    estimatedLines,
    exportCount: exports.count,
    isEntry: depStats.isEntry,
    incomingDeps: depStats.incoming,
    outgoingDeps: depStats.outgoing,
    maxNestingDepth: maxDepth,
    complexityScore: score,
    primaryLanguage: primaryLang,
  };

  // Role recommendation (overridable) / 角色推荐（可覆盖）
  const roleRec = recommendRole(name, signals);

  // Template recommendation (overridable) / 模板推荐（可覆盖）
  const templateRec = recommendTemplate(score, exports.count, roleRec.role);

  // DocScope — primary signal for template selection / 文档范围 — 模板选择的主要信号
  const docScope = deriveDocScope(roleRec.role, signals, name);

  // Semantic hints / 语义提示
  const semanticHints = generateSemanticHints(name, signals);

  return {
    name,
    path: relPath,
    docScope,
    signals,
    templateRecommendation: templateRec,
    roleRecommendation: roleRec,
    semanticHints,
  };
}

// ─── Batch Analysis ────────────────────────────────────────────────────────
// ─── 批量分析 ────────────────────────────────────────────────

export interface BatchModuleAnalysis {
  modules: ModuleAnalysis[];
  totalModules: number;
  recommendedModuleCount: number;
  recommendedSimpleCount: number;
  analyzedAt: string;
}

export function analyzeAllModules(projectRoot: string): BatchModuleAnalysis {
  const srcDirs = ['src', 'lib', 'packages', 'apps', 'modules', 'app', 'cmd', 'internal'];
  const analyses: ModuleAnalysis[] = [];

  for (const srcDir of srcDirs) {
    const srcPath = path.join(projectRoot, srcDir);
    if (!fs.existsSync(srcPath)) continue;

    try {
      const entries = fs.readdirSync(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const modulePath = path.join(srcPath, entry.name);
          analyses.push(analyzeModule(modulePath, projectRoot));
        }
      }
    } catch { /* ignore */ }
  }

  const recommendedModuleCount = analyses.filter(a => a.templateRecommendation.template === 'module.md').length;
  const recommendedSimpleCount = analyses.filter(a => a.templateRecommendation.template === 'module-simple.md').length;

  return {
    modules: analyses,
    totalModules: analyses.length,
    recommendedModuleCount,
    recommendedSimpleCount,
    analyzedAt: new Date().toISOString(),
  };
}

function countModuleFiles(modulePath: string): number {
  try {
    const stat = fs.statSync(modulePath);
    if (stat.isFile()) {
      return languageHandlerManager.detectLanguageFromFile(path.basename(modulePath)) ? 1 : 0;
    }
    const walk = (dir: string): number => {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          count += walk(path.join(dir, entry.name));
        } else if (entry.isFile() && languageHandlerManager.detectLanguageFromFile(entry.name)) {
          count++;
        }
      }
      return count;
    };
    return walk(modulePath);
  } catch {
    return 0;
  }
}

// ─── Output Formatting ──────────────────────────────────────────────────────
// ─── 输出格式化 ──────────────────────────────────────────────

export function formatModuleAnalysis(analysis: ModuleAnalysis): string {
  const { signals, templateRecommendation, roleRecommendation, semanticHints } = analysis;

  const lines: string[] = [];
  lines.push(`## Module: ${analysis.name}`);
  lines.push(`**Path**: \`${analysis.path}\``);
  lines.push(`**docScope**: \`${analysis.docScope}\``);
  lines.push('');
  lines.push('### Quantitative Signals (from code analysis)');
  lines.push(`| Signal | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| fileCount | ${signals.fileCount} |`);
  lines.push(`| estimatedLines | ${signals.estimatedLines} |`);
  lines.push(`| exportCount | ${signals.exportCount} |`);
  lines.push(`| complexityScore | ${signals.complexityScore} |`);
  lines.push(`| isEntry | ${signals.isEntry} |`);
  lines.push(`| incomingDeps | ${signals.incomingDeps} |`);
  lines.push(`| outgoingDeps | ${signals.outgoingDeps} |`);
  lines.push(`| maxNestingDepth | ${signals.maxNestingDepth} |`);
  lines.push(`| primaryLanguage | ${signals.primaryLanguage || 'unknown'} |`);
  lines.push('');

  lines.push('### Role Recommendation (model overrideable)');
  lines.push(`**Role**: \`${roleRecommendation.role}\` — *${roleRecommendation.reason}*`);
  lines.push(`**Top signals**: ${roleRecommendation.topSignals.join(', ')}`);
  lines.push('');

  lines.push('### Template Recommendation (model overrideable)');
  lines.push(`**Template**: \`${templateRecommendation.template}\` — *${templateRecommendation.reason}*`);
  lines.push(`**Basis**: complexityScore=${templateRecommendation.basis.complexityScore}, exportCount=${templateRecommendation.basis.exportCount}`);
  lines.push('');

  lines.push('### Semantic Hints (for model reference)');
  for (const hint of semanticHints) {
    lines.push(`- ${hint}`);
  }

  return lines.join('\n');
}

export function printBatchAnalysis(result: BatchModuleAnalysis): void {
  console.log(`\n=== Module Analysis (${result.totalModules} modules) ===\n`);
  console.log(`Templates: ${result.recommendedModuleCount}x module.md, ${result.recommendedSimpleCount}x module-simple.md\n`);

  for (const m of result.modules) {
    console.log(`[${m.roleRecommendation.role}] ${m.name} (${m.templateRecommendation.template})`);
    console.log(`  Signals: lines=${m.signals.estimatedLines}, exports=${m.signals.exportCount}, ` +
      `inDeps=${m.signals.incomingDeps}, outDeps=${m.signals.outgoingDeps}`);
    console.log(`  Hints: ${m.semanticHints.slice(0, 2).join('; ')}`);
    console.log('');
  }
}
