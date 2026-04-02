/**
 * 本地预览服务 / Local preview server
 * 准备 docsify 文件并启动 HTTP 服务 / Prepare docsify files and start HTTP server
 * 支持多语言切换（cookie 驱动）/ Supports multi-language switching (cookie-driven)
 * 支持侧边栏缓存 + 热重载 / Supports sidebar caching + hot reload via SSE
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

import { MIME_TYPES } from './utils';
import { handleVendorRequest } from './vendor';
import { generateDocsifyIndex, getLangLabel, LangOption } from './templates';
import { generateSidebarMd } from './sidebar';
import { loadI18nConfig, getAvailableLanguages } from '../utils/i18n';

/**
 * 准备所有可用语言的 wiki 目录用于 docsify 服务 / Prepare wiki directories for all available languages for docsify service
 */
export function prepareDocsify(
  wikiBasePath: string,
  projectName?: string,
): { primaryWikiDir: string; languages: LangOption[] } {
  const primaryDir = path.join(wikiBasePath, 'wiki');
  if (!fs.existsSync(primaryDir)) {
    throw new Error(`Wiki directory does not exist: ${primaryDir}`);
  }

  const name = projectName || path.basename(path.resolve(wikiBasePath, '..'));
  const available = getAvailableLanguages(wikiBasePath);

  const languages: LangOption[] = available.map(a => ({
    lang: a.lang,
    label: getLangLabel(a.lang),
  }));

  // 为每个可用语言目录生成 docsify 文件 / Generate docsify files for each available language directory
  for (const a of available) {
    fs.writeFileSync(path.join(a.dir, 'index.html'), generateDocsifyIndex(name, languages, a.lang), 'utf-8');
    fs.writeFileSync(path.join(a.dir, '_sidebar.md'), generateSidebarMd(a.dir, a.lang), 'utf-8');
    const nojekyllPath = path.join(a.dir, '.nojekyll');
    if (!fs.existsSync(nojekyllPath)) {
      fs.writeFileSync(nojekyllPath, '', 'utf-8');
    }
  }

  return { primaryWikiDir: primaryDir, languages };
}

function parseCookie(req: http.IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      result[part.substring(0, eq).trim()] = part.substring(eq + 1).trim();
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// Sidebar 缓存 / Sidebar cache
// ─────────────────────────────────────────────

const sidebarCache = new Map<string, string>();

function getCachedSidebar(wikiDir: string, lang: string): string {
  const key = `${wikiDir}:${lang}`;
  let content = sidebarCache.get(key);
  if (!content) {
    content = generateSidebarMd(wikiDir, lang);
    sidebarCache.set(key, content);
  }
  return content;
}

// ─────────────────────────────────────────────
// SSE 热重载 / SSE hot reload
// ─────────────────────────────────────────────

/** 活跃的 SSE 客户端连接 */
const sseClients = new Set<http.ServerResponse>();

/** 向所有 SSE 客户端广播事件 */
function broadcastSSE(data: object): void {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res);
    }
  }
}

/** 失效侧边栏缓存并通知浏览器刷新 */
function invalidateAndReload(changedPath: string): void {
  sidebarCache.clear();
  broadcastSSE({ type: 'reload', path: changedPath });
}

// ─────────────────────────────────────────────
// 启动静态文件 HTTP 服务 / Start static file HTTP server
// ─────────────────────────────────────────────

/**
 * 启动静态文件 HTTP 服务（支持多语言切换 + 热重载）
 * / Start static file HTTP server (supports multi-language switching + hot reload)
 */
export function startServer(wikiBasePath: string, port: number, projectName?: string): http.Server {
  const { primaryWikiDir, languages } = prepareDocsify(wikiBasePath, projectName);
  const config = loadI18nConfig(wikiBasePath);

  // 所有语言 wiki 目录（用于文件监视）
  const watchedDirs = new Set<string>([primaryWikiDir]);
  if (config?.primaryLang) {
    watchedDirs.add(path.join(wikiBasePath, `wiki_${config.primaryLang}`));
  }
  // 监视器实例
  const watchers: fs.FSWatcher[] = [];

  function resolveWikiDir(req: http.IncomingMessage): { dir: string; lang: string } {
    const cookies = parseCookie(req);
    const lang = cookies['nw_lang'];
    if (lang && lang !== config?.primaryLang) {
      const langDir = path.join(wikiBasePath, `wiki_${lang}`);
      if (fs.existsSync(langDir)) return { dir: langDir, lang };
    }
    return { dir: primaryWikiDir, lang: config?.primaryLang ?? 'en' };
  }

  // ── 文件监视 / File watcher ──────────────────
  for (const dir of watchedDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // 只响应 .md 文件和 _sidebar.md 变化
        if (filename.endsWith('.md') || filename === '.nojekyll') {
          invalidateAndReload(filename);
        }
      });
      watcher.on('error', () => { /* 忽略单次监视错误 */ });
      watchers.push(watcher);
    } catch { /* 忽略不可监视的目录 */ }
  }

  // ── HTTP 请求处理 / HTTP request handling ────
  const server = http.createServer((req, res) => {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(req.url || '/');
    } catch {
      urlPath = '/';
    }

    // 去掉 query string
    const qIdx = urlPath.indexOf('?');
    const query = qIdx !== -1 ? urlPath.substring(qIdx + 1) : '';
    if (qIdx !== -1) urlPath = urlPath.substring(0, qIdx);

    // API: 可用语言列表 / Available language list
    if (urlPath === '/_api/languages') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(languages));
      return;
    }

    // API: 切换语言 / Switch language
    if (urlPath === '/_api/switch-lang') {
      const params = new URLSearchParams(query);
      const lang = params.get('lang') ?? config?.primaryLang ?? 'en';
      res.writeHead(302, {
        'Set-Cookie': `nw_lang=${lang}; Path=/; SameSite=Lax`,
        'Location': '/',
      });
      res.end();
      return;
    }

    // API: SSE 热重载流 / SSE hot reload stream
    if (urlPath === '/_api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // 发送初始连接确认
      res.write('data: {"type":"connected"}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Vendor 静态资源 / Vendor static resources
    if (handleVendorRequest(urlPath, res)) return;

    const { dir: wikiDir, lang: currentLang } = resolveWikiDir(req);

    // 所有 _sidebar.md 请求返回缓存的侧边栏 / Return cached sidebar for all _sidebar.md requests
    if (urlPath.endsWith('/_sidebar.md')) {
      const sidebarContent = getCachedSidebar(wikiDir, currentLang);
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(sidebarContent);
      return;
    }

    // 默认路由到 index.html（docsify SPA）/ Default route to index.html (docsify SPA)
    if (urlPath === '/' || urlPath === '') {
      urlPath = '/index.html';
    }

    const filePath = path.join(wikiDir, urlPath);

    // 安全检查：防止路径遍历 / Security check: prevent path traversal
    const resolved = path.resolve(filePath);
    const resolvedWiki = path.resolve(wikiDir);
    if (!resolved.startsWith(resolvedWiki)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(resolved, (err, stats) => {
      if (err || !stats) {
        // docsify SPA fallback：非文件请求返回 index.html / docsify SPA fallback: non-file requests return index.html
        const indexFile = path.join(wikiDir, 'index.html');
        if (fs.existsSync(indexFile) && !urlPath.includes('.')) {
          fs.readFile(indexFile, (readErr, data) => {
            if (readErr) {
              res.writeHead(500);
              res.end('Internal Server Error');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
          });
          return;
        }
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      if (stats.isDirectory()) {
        // 目录请求：尝试 index.html 或 index.md / Directory request: try index.html or index.md
        const dirIndex = path.join(resolved, 'index.html');
        const dirMd = path.join(resolved, 'index.md');
        const target = fs.existsSync(dirIndex) ? dirIndex : fs.existsSync(dirMd) ? dirMd : null;
        if (target) {
          const ext = path.extname(target);
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          fs.readFile(target, (readErr, data) => {
            if (readErr) {
              res.writeHead(500);
              res.end('Internal Server Error');
              return;
            }
            res.writeHead(200, { 'Content-Type': mime });
            res.end(data);
          });
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
        return;
      }

      // 普通文件
      const ext = path.extname(resolved).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(resolved, (readErr, data) => {
        if (readErr) {
          res.writeHead(500);
          res.end('Internal Server Error');
          return;
        }
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    });
  });

  // 优雅关闭：清理所有监视器和 SSE 连接
  server.on('close', () => {
    for (const w of watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    watchers.length = 0;
    sseClients.clear();
  });

  server.listen(port, () => {
    console.log(`\n📖 Nium-Wiki documentation server started\n`);
    console.log(`   Local access: http://localhost:${port}`);
    console.log(`   Docs directory: ${primaryWikiDir}`);
    if (languages.length > 1) {
      console.log(`   Available languages: ${languages.map(l => l.label).join(', ')}`);
    }
    console.log(`\n   Press Ctrl+C to stop the server\n`);
  });

  return server;
}
