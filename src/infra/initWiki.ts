#!/usr/bin/env node
/**
 * Nium-Wiki 初始化模块 / Initialization Module
 * 创建 .nium-wiki 目录结构和默认配置 / Create .nium-wiki directory structure and default configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { updateSourceIndex, diffSourceIndex, syncRawFiles } from '../core/sourceIndex';
import { CONFIG_EXCLUDE_LIST } from '../utils/patterns';
import { languageHandlerManager } from '../language-handlers/index';

interface NiumWikiConfig {
  language: string;
  exclude: string[];
  useGitignore: boolean;
  syncRaw: boolean;
}

function getDefaultConfig(primaryLang: string): NiumWikiConfig {
  return {
    language: primaryLang,
    exclude: [...CONFIG_EXCLUDE_LIST],
    useGitignore: true,
    syncRaw: true,
  };
}

function getGitBranch(cwd: string): string {
  // Prefer to read CI environment variables / 优先读取 CI 环境变量
  const envBranch = process.env.GITHUB_REF_NAME
    || process.env.CI_COMMIT_BRANCH
    || process.env.BRANCH_NAME;
  if (envBranch) return envBranch;

  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
    if (branch === 'HEAD') {
      // detached HEAD, get short hash / detached HEAD，取 short hash
      const hash = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
      return `detached-${hash}`;
    }
    return branch;
  } catch {
    return 'default';
  }
}

export interface DirtyFile {
  path: string;
  hash: string;
}

export interface SourceInfo {
  branch: string;
  baseCommit: string;
  baseCommitTime: string;
  baseCommitMessage: string;
  dirty: boolean;
  dirtyFiles: DirtyFile[];
}

/** 收集工作区中所有未提交的已跟踪文件及其 SHA256（前 16 位）/ Collect all uncommitted tracked files in the working tree with their SHA256 (first 16 chars). Returns null when git is unavailable. */
function getDirtyFiles(projectRoot: string): DirtyFile[] | null {
  try {
    const status = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf-8' });
    const lines = String(status).trim().split('\n').filter(Boolean);
    const dirtyFiles: DirtyFile[] = [];

    for (const line of lines) {
      // git status --porcelain format: XY path (X=staged, Y=worktree)
      const staged = line[0];
      const worktree = line[1];
      // Only track worktree changes (M) and new untracked files (??); ignore staged-only changes
      // 只关注工作区改动（M）和新增未跟踪文件（??），忽略仅暂存的改动
      if (worktree === 'M' || worktree === '?' || (staged !== ' ' && staged !== '?' && worktree === 'M')) {
        const filePath = line.slice(3).trim();
        if (!filePath) continue;
        try {
          // Skip submodules and binary files
          // 跳过子模块和二进制文件
          const content = fs.readFileSync(filePath, 'utf-8');
          const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
          dirtyFiles.push({ path: filePath, hash });
        } catch { /* skip unreadable files */ }
      }
    }
    return dirtyFiles;
  } catch {
    // No git → return null, let caller decide whether to scan all files
    // 无 git 时，返回 null，由调用方决定是否需要扫描全量文件
    return null;
  }
}

/** 扫描目录下的所有源文件（无 git 回退方案）/ Scan all source files in a directory (git-less fallback) */
function scanAllSourceFiles(projectRoot: string, extensions: string[] = ['.ts', '.js', '.py', '.go', '.java', '.rs']): DirtyFile[] {
  const dirtyFiles: DirtyFile[] = [];

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip common irrelevant directories
          // 跳过常见无关目录
          if (!['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', 'vendor'].includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
              const relativePath = path.relative(projectRoot, fullPath);
              dirtyFiles.push({ path: relativePath, hash });
            } catch { /* skip unreadable files */ }
          }
        }
      }
    } catch { /* skip inaccessible directories */ }
  }

  walk(projectRoot);
  return dirtyFiles;
}

/** 获取当前 git 状态信息（branch、commit、未提交文件列表）/ Get current git state info (branch, commit, dirty file list) */
export function getSourceInfo(projectRoot: string): SourceInfo {
  const branch = getGitBranch(projectRoot);
  let baseCommit = '';
  let baseCommitTime = '';
  let baseCommitMessage = '';

  try {
    baseCommit = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8' }).trim();
    baseCommitTime = execSync('git log -1 --format=%ci', { cwd: projectRoot, encoding: 'utf-8' }).trim();
    baseCommitMessage = execSync('git log -1 --format=%s', { cwd: projectRoot, encoding: 'utf-8' }).trim();
  } catch {
    baseCommit = 'unknown';
    baseCommitTime = new Date().toISOString();
    baseCommitMessage = 'unknown';
  }

  // 有 git → 用 git status 检测工作区改动；无 git → 扫描全量源文件
  // Has git → use git status; no git → scan all source files
  let dirtyFiles = getDirtyFiles(projectRoot);
  if (dirtyFiles === null) {
    // git unavailable, fall back to scanning all files
    // git 不可用，回退到扫描全量文件
    dirtyFiles = scanAllSourceFiles(projectRoot);
  }

  return {
    branch,
    baseCommit,
    baseCommitTime,
    baseCommitMessage,
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
  };
}

async function getDefaultMeta(projectRoot: string): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const languageIds = languageHandlerManager.detectProjectLanguages(projectRoot);
  const projectVersion = await languageHandlerManager.detectProjectVersionForLanguages(languageIds, projectRoot);
  const source = getSourceInfo(projectRoot);
  return {
    project: path.basename(projectRoot),
    createdAt: now,
    updatedAt: now,
    source,
    ...(projectVersion ? { version: projectVersion } : {}),
  };
}

export interface InitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  message: string;
}

export async function initNiumWiki(projectRoot: string, force = false, primaryLang?: string): Promise<InitResult> {
  const wikiDir = path.join(projectRoot, '.nium-wiki');

  const result: InitResult = {
    success: true,
    created: [],
    skipped: [],
    message: '',
  };

  // When re-initializing, always read the existing config's language to avoid
  // accidentally overwriting it with the caller's default value (e.g. 'en').
  // This also handles the case where the CLI passes the wrong primaryLang.
  if (force) {
    const existingConfigPath = path.join(wikiDir, 'config.json');
    if (fs.existsSync(existingConfigPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(existingConfigPath, 'utf-8'));
        if (existing?.language) {
          primaryLang = existing.language;
        }
      } catch { /* ignore — proceed with caller value */ }
    }
  }
  // Use provided primaryLang, or fall back to 'zh' (not 'en') to avoid
  // accidentally defaulting to English when language is unset.
  const lang = primaryLang ?? 'zh';

  // 检查是否已存在 / Check if already exists
  if (fs.existsSync(wikiDir)) {
    if (!force) {
      result.success = false;
      result.message = '.nium-wiki directory already exists. Use --force to reinitialize.';
      return result;
    } else {
      const configPath = path.join(wikiDir, 'config.json');
      if (fs.existsSync(configPath)) {
        const backupPath = path.join(wikiDir, 'config.json.bak');
        fs.copyFileSync(configPath, backupPath);
        result.skipped.push('config.json (backed up)');
      }
    }
  }

  // 创建目录结构 / Create directory structure
  const directories = [
    '.nium-wiki',
    '.nium-wiki/cache',
    '.nium-wiki/wiki',
    '.nium-wiki/raw',
  ];

  for (const dirPath of directories) {
    const fullPath = path.join(projectRoot, dirPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      result.created.push(dirPath);
    }
  }

  // 创建配置文件 / Create config file
  const configPath = path.join(wikiDir, 'config.json');
  if (!fs.existsSync(configPath) || force) {
    fs.writeFileSync(configPath, JSON.stringify(getDefaultConfig(lang), null, 2), 'utf-8');
    result.created.push('config.json');
  }

  // 创建元数据文件 / Create metadata file
  const metaPath = path.join(wikiDir, 'meta.json');
  if (!fs.existsSync(metaPath) || force) {
    fs.writeFileSync(metaPath, JSON.stringify(await getDefaultMeta(projectRoot), null, 2), 'utf-8');
    result.created.push('meta.json');
  }

  // 创建空的缓存文件 / Create empty cache files
  const cacheFiles: Record<string, unknown> = {
    'cache/structure.json': {
      projectName: '',
      projectType: [],
      entryPoints: [],
      modules: [],
      docsFound: [],
    },
  };

  for (const [cacheFile, defaultContent] of Object.entries(cacheFiles)) {
    const cachePath = path.join(wikiDir, cacheFile);
    if (!fs.existsSync(cachePath)) {
      fs.writeFileSync(cachePath, JSON.stringify(defaultContent, null, 2), 'utf-8');
      result.created.push(cacheFile);
    }
  }

  // 扫描项目文件并写入初始哈希基线 / Scan project files and write initial hash baseline
  const changes = diffSourceIndex(projectRoot);
  updateSourceIndex(projectRoot, changes.currentHashes);

  // 同步源文件到 .nium-wiki/raw/（受 config.json syncRaw 控制）/ Sync source files to .nium-wiki/raw/ (controlled by config.json syncRaw)
  syncRawFiles(projectRoot, changes.currentHashes);

  result.message = `Successfully initialized .nium-wiki directory, created ${result.created.length} files/directories`;
  return result;
}

export function printInitResult(result: InitResult): void {
  if (result.success) {
    console.log('✅', result.message);
    if (result.created.length) {
      console.log('\nCreated files/directories:');
      for (const item of result.created) {
        console.log(`  + ${item}`);
      }
    }
    if (result.skipped.length) {
      console.log('\nSkipped files:');
      for (const item of result.skipped) {
        console.log(`  - ${item}`);
      }
    }
  } else {
    console.log('❌', result.message);
  }
}
