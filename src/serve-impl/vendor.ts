/**
 * Vendor 静态资源处理：docsify/prismjs/mermaid 等本地文件服务
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

import { MIME_TYPES } from './utils';

// vendor 静态资源目录（构建时由 scripts/copy-vendor.js 拷入）
// Vendor static assets directory (copied by scripts/copy-vendor.js during build)
// dist/serve-impl/ -> dist/vendor/
export const VENDOR_DIR = path.join(__dirname, '..', 'vendor');

// docsify 页面公共的 vendor 脚本/样式引用
export const VENDOR_HEAD = `  <link rel="stylesheet" href="/_vendor/docsify/vue.css">`;

export const VENDOR_SCRIPTS = `  <!-- docsify core -->
  <script src="/_vendor/docsify/docsify.min.js"></script>
  <!-- search plugin -->
  <script src="/_vendor/docsify/search.min.js"></script>
  <!-- code highlight -->
  <script src="/_vendor/prismjs/prism-typescript.min.js"></script>
  <script src="/_vendor/prismjs/prism-python.min.js"></script>
  <script src="/_vendor/prismjs/prism-bash.min.js"></script>
  <script src="/_vendor/prismjs/prism-json.min.js"></script>
  <script src="/_vendor/prismjs/prism-yaml.min.js"></script>
  <script src="/_vendor/prismjs/prism-go.min.js"></script>
  <script src="/_vendor/prismjs/prism-rust.min.js"></script>
  <script src="/_vendor/prismjs/prism-java.min.js"></script>
  <!-- mermaid -->
  <script src="/_vendor/mermaid/mermaid.min.js"></script>
  <script src="/_vendor/docsify-mermaid/docsify-mermaid.js"></script>
  <script>mermaid.initialize({ startOnLoad: false, theme: 'default' });</script>`;

/**
 * 处理 /_vendor/* 请求，从 dist/vendor/ 提供静态文件
 * 返回 true 表示已处理，false 表示非 vendor 请求
 */
export function handleVendorRequest(urlPath: string, res: http.ServerResponse): boolean {
  if (!urlPath.startsWith('/_vendor/')) return false;

  const relPath = urlPath.substring('/_vendor/'.length);
  const filePath = path.join(VENDOR_DIR, relPath);

  // 安全检查
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(VENDOR_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  if (!fs.existsSync(resolved)) {
    res.writeHead(404);
    res.end('Not Found');
    return true;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(resolved, (err, data) => {
    if (err) { res.writeHead(500); res.end('Internal Server Error'); return; }
    // vendor 文件不变，可长缓存
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' });
    res.end(data);
  });
  return true;
}
