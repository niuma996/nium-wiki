/**
 * Nium-Wiki for Node.js
 * 统一导出所有模块
 */

export { initNiumWiki, printInitResult } from './infra/initWiki';
export type { InitResult } from './infra/initWiki';

export { analyzeProject, printAnalysis } from './core/analyzeProject';
export type { ProjectAnalysis, ModuleInfo, ProjectStats } from './core/analyzeProject';

export { diffSourceIndex, updateSourceIndex, printSourceDiff } from './core/sourceIndex';
export type { SourceDiff } from './core/sourceIndex';

export { buildDocIndex, enrichWithInference, saveDocIndex, loadDocIndex, parseSourceReferences, inferDocPath } from './core/buildDocIndex';
export type { DocIndex, SourceReference } from './core/buildDocIndex';

export { buildDependencyGraph, computeTransitiveImpact, parseImports, saveDependencyGraph, loadDependencyGraph } from './core/buildDeps';
export type { DependencyGraph, ImpactResult } from './core/buildDeps';

export {
  buildIncrementalPlan,
  printIncrementalPlan,
  inferDocPathFromSource,
} from './core/incremental';
export type { IncrementalPlan, AffectedDoc, IncrementalOptions } from './core/incremental';

export { sanitizeLinks, sanitizeContent, printSanitizeResult } from './core/sanitizeLinks';
export type { SanitizeResult } from './core/sanitizeLinks';

export { extractDocsFromFile, docsToMarkdown } from './core/extractDocs';
export type { DocEntry } from './core/extractDocs';

export {
  analyzeDocument,
  analyzeWiki,
  printQualityReport,
  saveReportJson,
} from './core/auditDocs';
export type { QualityMetrics, QualityReport } from './core/auditDocs';

export { generateToc, generateSidebar } from './generation/generateToc';

export {
  generateDocsifyIndex,
  generateSidebarMd,
  prepareDocsify,
  startServer,
} from './serve-impl';

export {
  DEFAULT_EXCLUDE_DIRS,
  IGNORE_FILES,
  CODE_EXTENSIONS,
  DOC_EXTENSIONS,
  CONFIG_EXCLUDE_LIST,
  isExcludedPath,
  isCodeFile,
  isDocFile,
  shouldIncludeFile,
} from './utils/patterns';

export { loadConfig, getExcludeDirs } from './utils/config';
export type { NiumWikiConfig } from './utils/config';

export {
  loadI18nConfig,
  getWikiDir,
  getAvailableLanguages,
  checkSyncStatus,
  printSyncStatus,
  syncMemory,
  getTocLabels,
  inferLangFromDir,
  getOsLang,
  isSupportedLang,
} from './utils/i18n';
export type { I18nConfig, TocLabels } from './utils/i18n';

export { walkFiles } from './utils/fileWalker';
export type { WalkOptions } from './utils/fileWalker';

export { loadCache, saveCache } from './utils/cache';

export { getVersion } from './utils/version';

export {
  generateBadgeSVG,
  generateInlineBadge,
  generateHTMLBadge,
  generateTextBadge,
  BADGE_COLORS,
  createVersionBadge,
  createLicenseBadge,
  createBuildBadge,
  createCoverageBadge,
  createLanguageBadge,
  createCustomBadge,
  generateProjectBadges,
} from './utils/badge';
export type { BadgeOptions, ProjectBadges } from './utils/badge';
