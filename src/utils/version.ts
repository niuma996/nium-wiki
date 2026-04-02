/**
 * 版本号管理模块 / Version management module
 * 统一从 package.json 读取版本号 / Read version from package.json uniformly
 */

import * as fs from 'fs';
import * as path from 'path';

let cachedVersion: string = '';

/**
 * 获取 nium-wiki 的版本号 / Get nium-wiki version
 * 从 package.json 中读取，结果会被缓存 / Read from package.json, result is cached
 */
export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  // 1. NIUM_WIKI_VERSION injected at bundle time via --define (always wins if set)
  //    打包时通过 --define 注入（优先使用）
  const envVersion = (process.env.NIUM_WIKI_VERSION as string | undefined);
  if (envVersion) {
    cachedVersion = envVersion;
    return cachedVersion;
  }

  // 2. Fallback: resolve from bundled file's location
  //    回退：从打包文件所在目录向上查找
  const candidates = [
    path.resolve(__dirname, '../../package.json'),  // normal: dist/utils/ -> root
    path.resolve(__dirname, '../package.json'),      // bundled: bin/ -> root
  ];

  for (const pkgPath of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name === 'nium-wiki' && pkg.version) {
        cachedVersion = pkg.version;
        return cachedVersion;
      }
    } catch {
      // try next
    }
  }

  cachedVersion = '0.0.0';
  return cachedVersion;
}
