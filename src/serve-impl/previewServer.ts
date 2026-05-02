/**
 * 本地预览服务 / Local preview server
 * 准备 docsify 文件并启动 HTTP 服务 / Prepare docsify files and start HTTP server
 * 支持多语言切换（cookie 驱动）/ Supports multi-language switching (cookie-driven)
 * 支持侧边栏缓存 + 热重载 / Supports sidebar caching + hot reload via SSE
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { execSync } from 'child_process';

import { MIME_TYPES } from './utils';
import { handleVendorRequest } from './vendor';
import { generateDocsifyIndex, getLangLabel, LangOption } from './templates';
import { getSidebarMarkdown } from './sidebarJson';
import { generateSidebarMd } from './sidebar';
import { generateSidebarJson, migrateFromSidebarMd } from '../generation/generateSidebarJson';
import { loadI18nConfig, getAvailableLanguages } from '../utils/i18n';

// ─────────────────────────────────────────────
// Sidebar bootstrap: ensure sidebar.json exists
// ─────────────────────────────────────────────

/**
 * Ensure sidebar.json exists in the wiki directory.
 * Server-side bootstrap — called once at startup, not on each request.
 *
 * 兜底逻辑：
 *   - 已有 sidebar.json → 跳过
 *   - 有 _sidebar.md → 迁移
 *   - 均无 → 扫描目录生成（目录名作为 alias，folder-aliases.json 不存在时直接用目录名）
 */
function ensureSidebarJson(wikiDir: string, lang: string): void {
  const sidebarJsonPath = path.join(wikiDir, 'sidebar.json');
  const legacyPath = path.join(wikiDir, '_sidebar.md');

  if (fs.existsSync(sidebarJsonPath)) return;

  if (fs.existsSync(legacyPath)) {
    const markdown = fs.readFileSync(legacyPath, 'utf-8');
    migrateFromSidebarMd(wikiDir, markdown);
    return;
  }

  // 目录扫描生成，folder-aliases.json 不存在时用目录名本身作为 label
  const content = generateSidebarJson(wikiDir, lang);
  fs.writeFileSync(sidebarJsonPath, content, 'utf-8');
}

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

  // 为每个可用语言目录准备 docsify 文件（server 动态返回 index.html，不写磁盘）
  for (const a of available) {
    const nojekyllPath = path.join(a.dir, '.nojekyll');
    if (!fs.existsSync(nojekyllPath)) {
      fs.writeFileSync(nojekyllPath, '', 'utf-8');
    }

    // 兜底：确保 sidebar.json 存在（server 启动时一次性完成，不在请求路径上判断）
    ensureSidebarJson(a.dir, a.lang);

    // 生成搜索索引 / Build search index
    try {
      execSync(`node "${path.resolve(__dirname, '..', '..', 'scripts', 'build-search-index.mjs')}" "${a.dir}"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
    } catch (e) {
      // non-fatal: search will fall back to dynamic crawling
    }
  }

  return { primaryWikiDir: primaryDir, languages };
}

// ─────────────────────────────────────────────
// Index.html 内存缓存 / Index.html in-memory cache
// ─────────────────────────────────────────────

/** key: wikiDir, value: cached HTML string */
const indexHtmlCache = new Map<string, string>();

/**
 * Get the dynamically-generated index.html for a given wiki directory.
 * Cached per wikiDir — languages are handled by the lang switcher in the HTML.
 */
function getCachedIndexHtml(
  wikiDir: string,
  projectName: string,
  languages: LangOption[],
): string {
  const cached = indexHtmlCache.get(wikiDir);
  if (cached) return cached;
  const html = generateDocsifyIndex(projectName, languages);
  indexHtmlCache.set(wikiDir, html);
  return html;
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
  const cached = sidebarCache.get(key);
  if (cached) return cached;

  // 优先从 sidebar.json 渲染（server 端读 JSON，不写文件）
  let content: string;
  const fromJson = getSidebarMarkdown(wikiDir, lang);
  if (fromJson !== null) {
    content = fromJson;
  } else {
    // 老 wiki 兼容：sidebar.json 不存在，fallback 到旧逻辑
    content = generateSidebarMd(wikiDir, lang);
  }
  sidebarCache.set(key, content);
  return content;
}

// ─────────────────────────────────────────────
// SSE 热重载 / SSE hot reload
// ─────────────────────────────────────────────

/** 活跃的 SSE 客户端连接 / Active SSE client connections */
const sseClients = new Set<http.ServerResponse>();

/** 向所有 SSE 客户端广播事件 / Broadcast event to all SSE clients */
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

/** 失效侧边栏缓存并通知浏览器刷新 / Invalidate sidebar cache and notify browser to reload */
function invalidateAndReload(changedPath: string): void {
  sidebarCache.clear();
  broadcastSSE({ type: 'reload', path: changedPath });
}

// ─────────────────────────────────────────────
// 启动静态文件 HTTP 服务 / Start static file HTTP server
// ─────────────────────────────────────────────

/**
 * 启动静态文件 HTTP 服务（支持多语言切换 + 热重载）
 * Start static file HTTP server (supports multi-language switching + hot reload)
 */
export function startServer(wikiBasePath: string, port: number, projectName?: string): http.Server {
  const { primaryWikiDir, languages } = prepareDocsify(wikiBasePath, projectName);
  const config = loadI18nConfig(wikiBasePath);
  const name = projectName || path.basename(path.resolve(wikiBasePath, '..'));

  // 所有语言 wiki 目录（用于文件监视）
  // All language wiki directories (for file watching)
  const watchedDirs = new Set<string>([primaryWikiDir]);
  if (config?.primaryLang) {
    watchedDirs.add(path.join(wikiBasePath, `wiki_${config.primaryLang}`));
  }
  // 监视器实例 / Watcher instances
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
        // Only respond to .md files and _sidebar.md changes
        // 只响应 .md 文件和 _sidebar.md 变化
        if (
          filename.endsWith('.md') ||
          filename === '.nojekyll' ||
          filename === 'sidebar.json' ||
          filename === 'folder-aliases.json'
        ) {
          invalidateAndReload(filename);
        }
      });
      watcher.on('error', () => { /* ignore single watch error */ });
      watchers.push(watcher);
    } catch { /* ignore inaccessible directories */ }
  }

  // ── HTTP 请求处理 / HTTP request handling ────
  const server = http.createServer((req, res) => {
    let urlPath: string;
    try {
      urlPath = decodeURIComponent(req.url || '/');
    } catch {
      urlPath = '/';
    }

    // Strip query string / 去掉 query string
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
      // Send initial connection acknowledgement
      // 发送初始连接确认
      res.write('data: {"type":"connected"}\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // /_is-source?path=<encoded-path> → check if file exists in .nium-wiki/raw/
    // Always returns 200; body is "1" if exists, "0" if not
    if (urlPath.startsWith('/_is-source')) {
      const params = new URLSearchParams(query);
      const filePath = params.get('path') ?? '/';
      const rawBase = path.join(wikiBasePath, 'raw');
      const fullPath = path.join(rawBase, decodeURIComponent(filePath));
      const resolved = path.resolve(fullPath);
      const resolvedBase = path.resolve(rawBase);
      if (!resolved.startsWith(resolvedBase)) {
        res.writeHead(403);
        res.end('0');
        return;
      }
      const exists = fs.existsSync(resolved);
      res.writeHead(200);
      res.end(exists ? '1' : '0');
      return;
    }

    // /_raw/* → serve source files from .nium-wiki/raw/ (for source code drawer)
    if (urlPath.startsWith('/_raw/')) {
      const rawBase = path.join(wikiBasePath, 'raw');
      const relPath = urlPath.substring('/_raw'.length);
      const filePath = path.join(rawBase, relPath);
      const resolved = path.resolve(filePath);
      const resolvedBase = path.resolve(rawBase);
      if (!resolved.startsWith(resolvedBase)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(resolved)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(resolved).toLowerCase();

      // Prism dependency graph: lang → additional script names (beyond base core+markup+clike)
      const PRISM_DEPS: Record<string, string[]> = {
        typescript: ['javascript'],
        markup: [],
        clike: [],
        javascript: [],
        css: [],
        less: [],
        scss: [],
        'markup-templating': [],
        php: ['markup-templating'],
        java: ['java'],
        kotlin: ['kotlin'],
        scala: ['scala'],
        ruby: ['ruby'],
        python: ['python'],
        bash: ['bash'],
        json: ['json'],
        yaml: ['yaml'],
        go: ['go'],
        rust: ['rust'],
        csharp: ['csharp'],
        fsharp: ['fsharp'],
        vbnet: ['vbnet'],
        c: ['c'],
        cpp: ['cpp'],
        toml: ['toml'],
        markdown: ['markdown'],
        plaintext: [],
      };

      const langMap: Record<string, string> = {
        // JavaScript/TypeScript
        '.js': 'javascript', '.jsx': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescript',
        '.mjs': 'javascript', '.cjs': 'javascript',
        '.vue': 'markup', '.svelte': 'markup', '.astro': 'markup',
        // Python
        '.py': 'python', '.pyi': 'python',
        // Go / Rust
        '.go': 'go', '.rs': 'rust',
        // Java / JVM
        '.java': 'java', '.kt': 'kotlin', '.scala': 'scala',
        // Ruby / PHP
        '.rb': 'ruby', '.php': 'php',
        // .NET
        '.cs': 'csharp', '.fs': 'fsharp', '.vb': 'vbnet',
        // Shell
        '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
        // Config
        '.json': 'json',
        '.yaml': 'yaml', '.yml': 'yaml',
        '.xml': 'markup', '.toml': 'toml',
        // Web
        '.md': 'markdown', '.html': 'markup',
        '.css': 'css', '.scss': 'css', '.less': 'less',
        // C/C++
        '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
      };
      const lang = langMap[ext] || 'plaintext';

      // Build only the scripts needed for this language: base + deps
      const deps = PRISM_DEPS[lang] ?? [];
      const scripts = ['core', 'markup', 'clike', ...deps];
      const prismScripts = scripts
        .map(s => `  <script src="/_vendor/prismjs/prism-${s}.min.js"></script>`)
        .join('\n');

      fs.readFile(resolved, (err, data) => {
        if (err) { res.writeHead(500); res.end('Internal Server Error'); return; }
        const content = data.toString('utf-8');
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lines = content.split('\n');
        const lineNumbers = lines.map((_, i) => `<div class="line-num">${i + 1}</div>`).join('');
        const codeLines = lines.map(line => `<div class="code-line">${esc(line)}</div>`).join('');
        const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="/_vendor/prismjs/prism.min.css">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; background: #fafafa; font-family: 'SF Mono', 'Fira Code', Consolas, monospace; font-size: 14px; line-height: 1.8; }
  .code-wrapper { display: flex; margin: 0; padding: 20px; background: #fafafa; }
  .line-numbers { flex-shrink: 0; width: 60px; text-align: right; color: #999; user-select: none; border-right: 1px solid #ddd; margin-right: 20px; padding-right: 16px; }
  .line-num { display: block; min-height: 1.8em; line-height: 1.8; }
  .code-content { flex: 1; overflow-x: auto; }
  .code-line { display: block; min-height: 1.8em; line-height: 1.8; white-space: pre; }
</style>
</head>
<body>
<div class="code-wrapper">
  <div class="line-numbers">${lineNumbers}</div>
  <div class="code-content">${codeLines}</div>
</div>
${prismScripts}
<script>
  (function() {
    var lang = '${lang}';
    // Fallback chain: specific lang → javascript → clike → markup → plaintext
    var tries = 0;
    function applyHighlight() {
      var grammar = Prism.languages[lang]
        || Prism.languages.javascript
        || Prism.languages.clike
        || Prism.languages.markup;
      if (!grammar) {
        if (++tries < 20) { setTimeout(applyHighlight, 25); return; }
        return;
      }
      document.querySelectorAll('.code-line').forEach(function(el) {
        var text = el.textContent || '';
        if (text.trim()) {
          el.innerHTML = Prism.highlight(text, grammar, lang);
        }
      });
    }
    applyHighlight();
  })();
</script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
      });
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

    // index.html 请求从内存动态返回 / Serve index.html from memory
    if (urlPath === '/index.html' || urlPath === 'index.html') {
      const html = getCachedIndexHtml(wikiDir, name, languages);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
      return;
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
        if (!urlPath.includes('.')) {
          const html = getCachedIndexHtml(wikiDir, name, languages);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(html);
          return;
        }
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      if (stats.isDirectory()) {
        // 目录请求：优先 index.md，否则返回动态 index.html / Directory: prefer index.md, fallback to dynamic index.html
        const dirMd = path.join(resolved, 'index.md');
        if (fs.existsSync(dirMd)) {
          fs.readFile(dirMd, (readErr, data) => {
            if (readErr) { res.writeHead(500); res.end('Internal Server Error'); return; }
            res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
            res.end(data);
          });
          return;
        }
        // 无 index.md → 返回动态 index.html
        const html = getCachedIndexHtml(wikiDir, name, languages);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
        return;
      }

      // Regular file / 普通文件
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

  // Graceful shutdown: clean up all watchers and SSE connections
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
