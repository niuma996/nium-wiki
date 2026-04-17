/**
 * 源文件索引模块 / Source file index module
 * 管理文件哈希索引，对比检测项目变更以支持增量更新 / Manage file hash index, compare and detect project changes to support incremental updates
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { shouldIncludeFile } from '../utils/patterns';
import { getExcludeDirs, loadConfig } from '../utils/config';
import { walkFiles } from '../utils/fileWalker';
import { loadCache, saveCache } from '../utils/cache';
import type { Ignore } from 'ignore';

function calculateFileHash(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return hash.substring(0, 16);
  } catch {
    return '';
  }
}

function scanProjectFiles(
  projectRoot: string,
  excludeDirs: Set<string>,
  ig: Ignore,
): Record<string, string> {
  const hashes: Record<string, string> = {};
  const files = walkFiles(projectRoot, { excludeDirs, relative: true });

  for (const relPath of files) {
    if (shouldIncludeFile(relPath, excludeDirs, ig)) {
      hashes[relPath] = calculateFileHash(path.join(projectRoot, relPath));
    }
  }

  return hashes;
}

interface CachedEntry {
  hash: string;
  createdAt?: string;
  updatedAt?: string;
}

function loadSourceIndex(wikiDir: string): Record<string, CachedEntry> {
  return loadCache<Record<string, CachedEntry>>(wikiDir, 'source-index.json', {});
}

function saveSourceIndex(wikiDir: string, data: Record<string, CachedEntry>): void {
  saveCache(wikiDir, 'source-index.json', data);
}

export interface SourceDiff {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
  hasChanges: boolean;
  summary: string;
  currentHashes: Record<string, string>;
}

export function diffSourceIndex(projectRoot: string): SourceDiff {
  const wikiDir = path.join(projectRoot, '.nium-wiki');
  const { dirs: excludeDirs, ig } = getExcludeDirs(projectRoot);
  const currentHashes = scanProjectFiles(projectRoot, excludeDirs, ig);
  const cached = loadSourceIndex(wikiDir);
  const cachedHashes: Record<string, string> = {};
  for (const [k, v] of Object.entries(cached)) {
    cachedHashes[k] = v.hash || '';
  }

  const currentFiles = new Set(Object.keys(currentHashes));
  const cachedFiles = new Set(Object.keys(cachedHashes));

  const added: string[] = [];
  const deleted: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];

  for (const f of currentFiles) {
    if (!cachedFiles.has(f)) {
      added.push(f);
    } else if (currentHashes[f] !== cachedHashes[f]) {
      modified.push(f);
    } else {
      unchanged.push(f);
    }
  }

  for (const f of cachedFiles) {
    if (!currentFiles.has(f)) {
      deleted.push(f);
    }
  }

  const hasChanges = added.length > 0 || modified.length > 0 || deleted.length > 0;

  const summaryParts: string[] = [];
  if (added.length) summaryParts.push(`+${added.length} added`);
  if (modified.length) summaryParts.push(`~${modified.length} modified`);
  if (deleted.length) summaryParts.push(`-${deleted.length} deleted`);
  if (!summaryParts.length) summaryParts.push('no changes');

  return {
    added: added.sort(),
    modified: modified.sort(),
    deleted: deleted.sort(),
    unchanged: unchanged.sort(),
    hasChanges: hasChanges,
    summary: summaryParts.join(', '),
    currentHashes: currentHashes,
  };
}

export function updateSourceIndex(
  projectRoot: string,
  currentHashes: Record<string, string>,
): void {
  const wikiDir = path.join(projectRoot, '.nium-wiki');
  const existing = loadSourceIndex(wikiDir);
  const cacheData: Record<string, CachedEntry> = {};
  const now = new Date().toISOString();

  for (const [filePath, fileHash] of Object.entries(currentHashes)) {
    const oldEntry = existing[filePath];
    cacheData[filePath] = {
      hash: fileHash,
      createdAt: oldEntry?.createdAt || now,
      updatedAt: now,
    };
  }

  saveSourceIndex(wikiDir, cacheData);
}

export function printSourceDiff(diff: SourceDiff): void {
  console.log(`Change detection result: ${diff.summary}`);
  console.log();

  if (diff.added.length) {
    console.log('📁 Added files:');
    for (const f of diff.added.slice(0, 10)) {
      console.log(`  + ${f}`);
    }
    if (diff.added.length > 10) {
      console.log(`  ... and ${diff.added.length - 10} more files`);
    }
  }

  if (diff.modified.length) {
    console.log('\n📝 Modified files:');
    for (const f of diff.modified.slice(0, 10)) {
      console.log(`  ~ ${f}`);
    }
    if (diff.modified.length > 10) {
      console.log(`  ... and ${diff.modified.length - 10} more files`);
    }
  }

  if (diff.deleted.length) {
    console.log('\n🗑️ Deleted files:');
    for (const f of diff.deleted.slice(0, 10)) {
      console.log(`  - ${f}`);
    }
    if (diff.deleted.length > 10) {
      console.log(`  ... and ${diff.deleted.length - 10} more files`);
    }
  }
}

const RAW_DIR = '.nium-wiki/raw';

/**
 * Sync scanned source files to .nium-wiki/raw/, preserving directory structure.
 * Only copies files that are new or have changed hash, and removes raw copies
 * of files that no longer exist in the scan result.
 *
 * Skipped entirely when syncRaw is false in config.json.
 */
/**
 * Sync scanned source files to .nium-wiki/raw/, preserving directory structure.
 * Only copies files that are new or have changed hash, and removes raw copies
 * of files that no longer exist in the scan result.
 *
 * Skipped entirely when syncRaw is false in config.json.
 *
 * @param projectRoot    - Project root directory
 * @param currentHashes  - Current file hashes (from diffSourceIndex result)
 */
export function syncRawFiles(
  projectRoot: string,
  currentHashes: Record<string, string>,
): void {
  const config = loadConfig(projectRoot);
  if (!config.syncRaw) return;

  const rawDir = path.join(projectRoot, RAW_DIR);

  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  const { dirs: excludeDirs, ig } = getExcludeDirs(projectRoot);
  const currentFiles = walkFiles(projectRoot, { excludeDirs, relative: true });
  const toKeep = new Set<string>();

  for (const relPath of currentFiles) {
    if (!shouldIncludeFile(relPath, excludeDirs, ig)) continue;
    toKeep.add(relPath);

    const srcPath = path.join(projectRoot, relPath);
    const dstPath = path.join(rawDir, relPath);
    const hash = currentHashes[relPath];
    // Compare against raw file's actual content (source-index.json may be pre-filled
    // in init scenarios where updateSourceIndex runs before syncRawFiles).
    const rawExists = fs.existsSync(dstPath);
    let needsCopy = false;
    if (hash) {
      if (!rawExists) {
        needsCopy = true;
      } else {
        const rawHash = calculateFileHash(dstPath);
        if (hash !== rawHash) needsCopy = true;
      }
    }
    if (needsCopy) {
      const dstDir = path.dirname(dstPath);
      if (!fs.existsSync(dstDir)) {
        fs.mkdirSync(dstDir, { recursive: true });
      }
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  // Remove raw copies of deleted files (no longer need to clean up raw_hash_*.json)
  function removeDeleted(dir: string, prefix: string): void {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const subDir = path.join(dir, entry.name);
        removeDeleted(subDir, rel);
        if (fs.existsSync(subDir)) {
          const children = fs.readdirSync(subDir);
          if (children.length === 0) {
            fs.rmdirSync(subDir);
          }
        }
      } else if (!toKeep.has(rel)) {
        try {
          fs.unlinkSync(path.join(dir, entry.name));
        } catch { /* ignore */ }
      }
    }
  }

  removeDeleted(rawDir, '');
}
