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

  // Try multiple paths to support both normal and bundled (ncc) execution
  // 尝试多个路径，同时支持普通执行和 ncc bundle 执行
  const candidates = [
    path.resolve(__dirname, '../../package.json'),  // normal: dist/utils/ -> root
    path.resolve(__dirname, '../package.json'),      // bundled: bin/ -> root
    path.resolve(process.cwd(), 'package.json'),     // fallback: cwd
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
