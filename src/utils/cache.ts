/**
 * 通用 JSON 缓存读写工具
 * 统一 .nium-wiki/cache/ 下的缓存文件操作
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 从 .nium-wiki/cache/ 读取 JSON 缓存
 * @param wikiDir .nium-wiki 目录的绝对路径
 * @param cacheName 缓存文件名（如 'source-index.json'）
 * @param defaultValue 缓存不存在或解析失败时的回退值
 */
export function loadCache<T>(wikiDir: string, cacheName: string, defaultValue: T): T {
  const cachePath = path.join(wikiDir, 'cache', cacheName);
  if (!fs.existsSync(cachePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return defaultValue;
  }
}

/**
 * 将数据写入 .nium-wiki/cache/ 下的 JSON 缓存
 * @param wikiDir .nium-wiki 目录的绝对路径
 * @param cacheName 缓存文件名（如 'source-index.json'）
 * @param data 要序列化的数据
 */
export function saveCache<T>(wikiDir: string, cacheName: string, data: T): void {
  const cacheDir = path.join(wikiDir, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, cacheName), JSON.stringify(data, null, 2), 'utf-8');
}
