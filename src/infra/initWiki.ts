#!/usr/bin/env node
/**
 * Nium-Wiki 初始化模块 / Initialization Module
 * 创建 .nium-wiki 目录结构和默认配置 / Create .nium-wiki directory structure and default configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { updateSourceIndex, diffSourceIndex } from '../core/sourceIndex';
import { CONFIG_EXCLUDE_LIST } from '../utils/patterns';
import { getVersion } from '../utils/version';

interface NiumWikiConfig {
  language: string;
  exclude: string[];
  useGitignore: boolean;
}

function getDefaultConfig(primaryLang: string): NiumWikiConfig {
  return {
    language: primaryLang,
    exclude: [...CONFIG_EXCLUDE_LIST],
    useGitignore: true,
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

function getDefaultMeta(projectRoot: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    version: getVersion(),
    project: path.basename(projectRoot),
    branch: getGitBranch(projectRoot),
    createdAt: now,
    updatedAt: now,
    filesDocumented: 0,
    modulesCount: 0,
  };
}

export interface InitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  message: string;
}

export function initNiumWiki(projectRoot: string, force = false, primaryLang = 'en'): InitResult {
  const wikiDir = path.join(projectRoot, '.nium-wiki');

  const result: InitResult = {
    success: true,
    created: [],
    skipped: [],
    message: '',
  };

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
    fs.writeFileSync(configPath, JSON.stringify(getDefaultConfig(primaryLang), null, 2), 'utf-8');
    result.created.push('config.json');
  }

  // 创建元数据文件 / Create metadata file
  const metaPath = path.join(wikiDir, 'meta.json');
  if (!fs.existsSync(metaPath) || force) {
    fs.writeFileSync(metaPath, JSON.stringify(getDefaultMeta(projectRoot), null, 2), 'utf-8');
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
