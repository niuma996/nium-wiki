/**
 * Incremental Update Pipeline
 * 增量更新管道
 *
 * Orchestrates diff-index + dep-graph + doc-index into a single pipeline that:
 * 1. Detects changed source files
 * 2. Computes transitive dependency impact
 * 3. Resolves affected wiki documents
 * 4. Returns a precise list of docs that need regeneration
 *
 * This module is the "glue" that connects the three existing but disconnected modules
 * (sourceIndex, buildDeps, buildDocIndex) into an automated incremental workflow.
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  diffSourceIndex,
  updateSourceIndex,
  SourceDiff,
} from './sourceIndex';
import { loadDocIndex, saveDocIndex, DocIndex } from './buildDocIndex';
import {
  loadDependencyGraph,
  buildDependencyGraph,
  saveDependencyGraph,
  computeTransitiveImpact,
  DependencyGraph,
} from './buildDeps';
import { walkFiles } from '../utils/fileWalker';
import { getExcludeDirs } from '../utils/config';
import { languageHandlerManager } from '../language-handlers/index';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AffectedDoc {
  /** Relative path within wiki/ e.g. "modules/source-index.md" */
  docPath: string;
  /** Why this doc needs updating */
  reason: 'source_changed' | 'dep_changed' | 'doc_dep_changed' | 'deleted_source' | 'inferred';
  /** Source files that triggered this */
  triggeredBy: string[];
  /** Full filesystem path */
  fullPath: string;
}

export interface IncrementalPlan {
  /** Whether there are any changes at all */
  hasChanges: boolean;
  /** Source file change summary */
  sourceDiff: SourceDiff;
  /** Documents that need regeneration */
  affectedDocs: AffectedDoc[];
  /** Documents that should be deleted (source file deleted) */
  docsToDelete: string[];
  /** Documents that exist but are not affected (will be preserved) */
  preservedDocs: string[];
  /** Whether the pipeline fell back to full generation mode */
  isFullGeneration: boolean;
  /** Human-readable summary */
  summary: string;
}

export interface IncrementalOptions {
  /** Project root directory */
  projectRoot: string;
  /** If true, update hash cache after analysis */
  commitHashes?: boolean;
  /** Maximum BFS depth for transitive impact */
  maxImpactDepth?: number;
  /** If true, fall back to full generation when no index exists */
  fallbackToFull?: boolean;
}

// ─── Naming Convention Inference ───────────────────────────────────────────────

/**
 * Infer wiki doc path from source file path using naming conventions.
 * Supports nested paths: src/core/analyzeProject.ts → modules/core/analyze-project.md
 */
export function inferDocPathFromSource(sourceFile: string): string | null {
  const allExtensions = languageHandlerManager.getAllSourceExtensions();
  const extPattern = allExtensions.map(e => e.replace('.', '\\.')).join('|');
  const regex = new RegExp(`^src[/\\\\](.+?)(\\.(${extPattern}))$`, 'i');
  const match = sourceFile.match(regex);
  if (!match) return null;

  const fullPath = match[1]; // e.g. "core/analyzeProject" or "core/impl/diff"
  const dirPart = path.dirname(fullPath);
  const baseName = path.basename(fullPath);

  const kebab = baseName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();

  if (dirPart === '.') {
    return `modules/${kebab}.md`;
  }
  return `modules/${dirPart.replace(/\\/g, '/')}/${kebab}.md`;
}

// ─── Core Pipeline ────────────────────────────────────────────────────────────

/**
 * Run the full incremental update pipeline.
 * Returns a plan describing exactly which docs need updating.
 */
export function buildIncrementalPlan(options: IncrementalOptions): IncrementalPlan {
  const { projectRoot, commitHashes = false, maxImpactDepth = 3, fallbackToFull = true } = options;

  const wikiDir = path.join(projectRoot, '.nium-wiki', 'wiki');

  // Step 1: Detect source file changes
  const sourceDiff = diffSourceIndex(projectRoot);

  if (!sourceDiff.hasChanges) {
    return {
      hasChanges: false,
      sourceDiff,
      affectedDocs: [],
      docsToDelete: [],
      preservedDocs: [],
      isFullGeneration: false,
      summary: 'No source changes detected',
    };
  }

  // Step 2: Load or build doc index
  let docIndex = loadDocIndex(projectRoot);
  let depGraph = loadDependencyGraph(projectRoot);

  // Step 3: Build missing indexes (first-time or stale)
  const needsIndexRebuild = !docIndex || Object.keys(docIndex.sourceToDoc).length === 0;
  const needsDepRebuild = !depGraph;

  if (needsDepRebuild) {
    const allFiles = [
      ...sourceDiff.added,
      ...sourceDiff.modified,
      ...sourceDiff.unchanged,
    ];
    depGraph = buildDependencyGraph(projectRoot, allFiles);
    saveDependencyGraph(projectRoot, depGraph);
  }

  // TypeScript strict mode: ensure non-null after potential rebuild
  if (!depGraph) {
    const allFiles = [
      ...sourceDiff.added,
      ...sourceDiff.modified,
      ...sourceDiff.unchanged,
    ];
    depGraph = buildDependencyGraph(projectRoot, allFiles);
    saveDependencyGraph(projectRoot, depGraph);
  }

  if (needsIndexRebuild) {
    // First-time generation: pre-populate index using naming conventions
    docIndex = prePopulateDocIndex(projectRoot, sourceDiff, wikiDir);
    saveDocIndex(projectRoot, docIndex);
  }

  // TypeScript strict mode: ensure non-null after potential rebuild
  if (!docIndex) {
    docIndex = prePopulateDocIndex(projectRoot, sourceDiff, wikiDir);
    saveDocIndex(projectRoot, docIndex);
  }

  // Step 4: Compute affected docs
  const allChangedSources = [
    ...sourceDiff.added,
    ...sourceDiff.modified,
    ...sourceDiff.deleted,
  ];

  // 4a. Transitive dependency impact (code-level)
  const impact = computeTransitiveImpact(allChangedSources, depGraph, maxImpactDepth);

  // 4b. Find docs directly or transitively affected by source changes
  const affectedDocMap = new Map<string, AffectedDoc>();
  const docsToDelete: string[] = [];
  const triggeredByMap = new Map<string, Set<string>>();

  // Helper to register an affected doc
  function registerAffectedDoc(docPath: string, reason: AffectedDoc['reason'], triggeredBy: string) {
    if (!affectedDocMap.has(docPath)) {
      triggeredByMap.set(docPath, new Set());
      affectedDocMap.set(docPath, {
        docPath,
        reason,
        triggeredBy: [],
        fullPath: path.join(wikiDir, docPath),
      });
    }
    triggeredByMap.get(docPath)!.add(triggeredBy);
  }

  // Process direct source changes
  for (const src of sourceDiff.added) {
    const docs = docIndex!.sourceToDoc[src] || [];
    for (const doc of docs) {
      registerAffectedDoc(doc, 'source_changed', src);
    }
    // Also check inferred path
    const inferred = inferDocPathFromSource(src);
    if (inferred && !docs.includes(inferred)) {
      registerAffectedDoc(inferred, 'inferred', src);
    }
  }

  for (const src of sourceDiff.modified) {
    const docs = docIndex!.sourceToDoc[src] || [];
    for (const doc of docs) {
      registerAffectedDoc(doc, 'source_changed', src);
    }
    const inferred = inferDocPathFromSource(src);
    if (inferred && !docs.includes(inferred)) {
      registerAffectedDoc(inferred, 'inferred', src);
    }
  }

  // Process deleted sources → mark their docs for deletion or regeneration
  for (const src of sourceDiff.deleted) {
    const docs = docIndex!.sourceToDoc[src] || [];
    for (const doc of docs) {
      docsToDelete.push(doc);
    }
    // Also handle inferred path
    const inferred = inferDocPathFromSource(src);
    if (inferred) {
      docsToDelete.push(inferred);
    }
  }

  // Process transitive impacts (code dependency chain)
  for (const src of impact.transitiveImpacts) {
    const docs = docIndex!.sourceToDoc[src] || [];
    for (const doc of docs) {
      registerAffectedDoc(doc, 'dep_changed', src);
    }
  }

  // 4c. Process doc-to-doc dependencies (semantic impact)
  const docDeps = buildDocToDocDependencies(wikiDir);
  for (const [docPath, affected] of affectedDocMap) {
    const transitiveDocDeps = getTransitiveDocDeps(docPath, docDeps);
    for (const dep of transitiveDocDeps) {
      if (!affectedDocMap.has(dep)) {
        registerAffectedDoc(dep, 'doc_dep_changed', docPath);
      }
    }
  }

  // Finalize triggeredBy arrays
  for (const [docPath, doc] of affectedDocMap) {
    doc.triggeredBy = [...triggeredByMap.get(docPath)!];
  }

  // Step 5: Identify preserved docs (exist but not affected)
  const preservedDocs: string[] = [];
  if (fs.existsSync(wikiDir)) {
    const existingDocs = walkFiles(wikiDir, { extensions: ['.md'] }).map(f =>
      path.relative(wikiDir, f).replace(/\\/g, '/')
    );
    const affectedDocPaths = new Set([...affectedDocMap.keys(), ...docsToDelete]);
    for (const doc of existingDocs) {
      if (!affectedDocPaths.has(doc)) {
        preservedDocs.push(doc);
      }
    }
  }

  // Step 6: Fallback to full generation if nothing resolved
  const isFullGeneration = affectedDocMap.size === 0 && fallbackToFull;
  let affectedDocs: AffectedDoc[];

  if (isFullGeneration) {
    affectedDocs = [];
    // Find all docs that could be affected by any change
    for (const src of allChangedSources) {
      const inferred = inferDocPathFromSource(src);
      if (inferred) {
        registerAffectedDoc(inferred, 'inferred', src);
      }
    }
    // If still nothing, mark all existing docs as needing update
    if (affectedDocMap.size === 0 && fs.existsSync(wikiDir)) {
      const allExisting = walkFiles(wikiDir, { extensions: ['.md'] }).map(f =>
        path.relative(wikiDir, f).replace(/\\/g, '/')
      );
      for (const doc of allExisting) {
        registerAffectedDoc(doc, 'inferred', '<full-generation>');
      }
    }
    affectedDocs = [...affectedDocMap.values()];
  } else {
    affectedDocs = [...affectedDocMap.values()];
  }

  // Step 7: Commit hashes if requested
  if (commitHashes) {
    updateSourceIndex(projectRoot, sourceDiff.currentHashes);
  }

  // Build summary
  const parts: string[] = [];
  if (sourceDiff.added.length) parts.push(`+${sourceDiff.added.length} added`);
  if (sourceDiff.modified.length) parts.push(`~${sourceDiff.modified.length} modified`);
  if (sourceDiff.deleted.length) parts.push(`-${sourceDiff.deleted.length} deleted`);
  if (isFullGeneration) parts.push('(full generation mode)');

  return {
    hasChanges: true,
    sourceDiff,
    affectedDocs,
    docsToDelete,
    preservedDocs,
    isFullGeneration,
    summary: `Source: ${parts.join(', ')} | Affected docs: ${affectedDocs.length} | To delete: ${docsToDelete.length} | Preserved: ${preservedDocs.length}`,
  };
}

// ─── Doc-to-Doc Dependency Analysis ──────────────────────────────────────────

interface DocDeps {
  docToDoc: Record<string, string[]>;
  docToSources: Record<string, string[]>;
}

/**
 * Build doc-to-doc dependency graph by parsing markdown cross-links.
 */
function buildDocToDocDependencies(wikiDir: string): DocDeps {
  const docToDoc: Record<string, string[]> = {};
  const docToSources: Record<string, string[]> = {};

  if (!fs.existsSync(wikiDir)) return { docToDoc, docToSources };

  // Load doc index for source mapping
  const docIndex = loadDocIndex(path.dirname(wikiDir));

  const mdFiles = walkFiles(wikiDir, { extensions: ['.md'] });
  for (const mdFile of mdFiles) {
    const relDoc = path.relative(wikiDir, mdFile).replace(/\\/g, '/');
    const content = fs.readFileSync(mdFile, 'utf-8');

    // Extract doc-to-doc links
    const linkPattern = /\]\((?!http)(?!#)([^)]+\.md)(?:#[^)]+)?\)/g;
    const links: string[] = [];
    let match;
    while ((match = linkPattern.exec(content)) !== null) {
      let linkedDoc = match[1];
      // Normalize to relative paths: strip leading "/" from absolute-style links
      if (linkedDoc.startsWith('/')) {
        linkedDoc = linkedDoc.slice(1);
      }
      // Resolve relative paths to wiki-root-relative paths
      if (linkedDoc.startsWith('./')) {
        linkedDoc = path.posix.join(path.posix.dirname(relDoc), linkedDoc.slice(2));
      } else if (linkedDoc.startsWith('../')) {
        let resolved = path.posix.resolve(path.posix.dirname(relDoc), linkedDoc);
        // posix.resolve returns absolute paths — normalize back to relative
        if (resolved.startsWith('/')) resolved = resolved.slice(1);
        linkedDoc = resolved;
      }
      links.push(linkedDoc);
    }
    docToDoc[relDoc] = [...new Set(links)];

    // Extract source references from doc
    if (docIndex) {
      docToSources[relDoc] = docIndex.docToSources[relDoc] || [];
    }
  }

  return { docToDoc, docToSources };
}

/**
 * Get all docs that transitively depend on the given doc.
 * Used to cascade updates through doc dependency chains.
 */
function getTransitiveDocDeps(startDoc: string, deps: DocDeps): string[] {
  const result = new Set<string>();
  const queue = [startDoc];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const dependents = deps.docToDoc[current] || [];
    for (const dep of dependents) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }

  return [...result];
}

// ─── First-Time Generation Index Pre-population ──────────────────────────────

function prePopulateDocIndex(
  projectRoot: string,
  sourceDiff: SourceDiff,
  wikiDir: string,
): DocIndex {
  const sourceToDoc: Record<string, string[]> = {};
  const docToSources: Record<string, string[]> = {};

  const allFiles = [
    ...sourceDiff.added,
    ...sourceDiff.modified,
    ...sourceDiff.unchanged,
  ];

  for (const src of allFiles) {
    const inferred = inferDocPathFromSource(src);
    if (!inferred) continue;

    // Check if doc exists (don't create mapping for non-existent docs)
    const docFullPath = path.join(wikiDir, inferred);
    // For first-time, we still want to map it even if doc doesn't exist yet
    // because we know what it should be

    if (!sourceToDoc[src]) sourceToDoc[src] = [];
    if (!sourceToDoc[src].includes(inferred)) {
      sourceToDoc[src].push(inferred);
    }

    if (!docToSources[inferred]) docToSources[inferred] = [];
    if (!docToSources[inferred].includes(src)) {
      docToSources[inferred].push(src);
    }
  }

  return {
    sourceToDoc,
    docToSources,
    createdAt: new Date().toISOString(),
  };
}

// ─── Output Helpers ───────────────────────────────────────────────────────────

export function printIncrementalPlan(plan: IncrementalPlan, verbose = false): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Incremental Update Plan');
  console.log('='.repeat(60));
  console.log(`\n${plan.summary}\n`);

  if (!plan.hasChanges) {
    console.log('✅ No changes detected — nothing to do');
    return;
  }

  if (plan.isFullGeneration) {
    console.log('⚠️  No existing index found — falling back to full generation mode');
  }

  if (plan.affectedDocs.length > 0) {
    console.log(`\n📝 ${plan.affectedDocs.length} document(s) to update:\n`);
    const byReason = groupBy(plan.affectedDocs, 'reason');
    for (const [reason, docs] of Object.entries(byReason)) {
      console.log(`  ${reasonLabel(reason)}:`);
      for (const doc of (docs as AffectedDoc[]).slice(0, 10)) {
        console.log(`    - ${doc.docPath} (triggered by: ${doc.triggeredBy.slice(0, 2).join(', ')})`);
      }
      if (docs.length > 10) {
        console.log(`      ... and ${docs.length - 10} more`);
      }
    }
  }

  if (plan.docsToDelete.length > 0) {
    console.log(`\n🗑️  ${plan.docsToDelete.length} document(s) to delete:\n`);
    for (const doc of plan.docsToDelete.slice(0, 10)) {
      console.log(`    - ${doc}`);
    }
    if (plan.docsToDelete.length > 10) {
      console.log(`      ... and ${plan.docsToDelete.length - 10} more`);
    }
  }

  if (verbose && plan.preservedDocs.length > 0) {
    console.log(`\n🔒 ${plan.preservedDocs.length} document(s) will be preserved (unchanged):\n`);
    for (const doc of plan.preservedDocs.slice(0, 10)) {
      console.log(`    - ${doc}`);
    }
    if (plan.preservedDocs.length > 10) {
      console.log(`      ... and ${plan.preservedDocs.length - 10} more`);
    }
  }

  console.log();
  console.log('='.repeat(60));
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    source_changed: '🔴 Source directly changed',
    dep_changed: '🟡 Transitive dependency changed',
    doc_dep_changed: '🟠 Doc dependency changed',
    deleted_source: '🔴 Source deleted',
    inferred: '🔵 Naming-convention inferred',
  };
  return labels[reason] || reason;
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
