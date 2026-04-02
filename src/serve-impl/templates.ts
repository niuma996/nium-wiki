/**
 * HTML Template Generation: docsify index.html
 * HTML 模板生成：docsify index.html
 */

import * as fs from 'fs';
import * as path from 'path';
import { escapeHtml, escapeJs } from './utils';
import { VENDOR_HEAD, VENDOR_SCRIPTS } from './vendor';

export interface LangOption {
  lang: string;
  label: string;
}

const LANG_LABELS: Record<string, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  ru: 'Русский',
};

const SEARCH_LABELS: Record<string, { placeholder: string; noData: string }> = {
  zh: { placeholder: '搜索文档...', noData: '没有找到结果' },
  en: { placeholder: 'Search docs...', noData: 'No results found' },
  ja: { placeholder: 'ドキュメントを検索...', noData: '結果が見つかりません' },
  ko: { placeholder: '문서 검색...', noData: '결과 없음' },
  fr: { placeholder: 'Rechercher...', noData: 'Aucun résultat' },
  de: { placeholder: 'Dokumente suchen...', noData: 'Keine Ergebnisse' },
  es: { placeholder: 'Buscar documentos...', noData: 'Sin resultados' },
  pt: { placeholder: 'Pesquisar documentos...', noData: 'Nenhum resultado' },
  ru: { placeholder: 'Поиск документов...', noData: 'Ничего не найдено' },
};

export function getLangLabel(lang: string): string {
  return LANG_LABELS[lang] || lang;
}

function getSearchLabels(lang: string): { placeholder: string; noData: string } {
  return SEARCH_LABELS[lang] ?? SEARCH_LABELS['en'];
}

/** Load app.js content hash for cache-busting — read at module load time (once) */
function getAppHash(): string {
  try {
    return fs.readFileSync(path.join(__dirname, 'app-hash.txt'), 'utf-8').trim();
  } catch {
    return 'dev'; // fallback for dev without full build
  }
}
const APP_HASH = getAppHash();

/**
 * Generate docsify index.html / 生成 docsify index.html
 */
export function generateDocsifyIndex(projectName: string, languages?: LangOption[], lang?: string): string {
  const search = lang ? getSearchLabels(lang) : getSearchLabels('en');
  const hasMultiLang = languages && languages.length > 1;

  const langSwitcherStyle = hasMultiLang ? `
    .lang-switcher {
      position: fixed; top: 10px; right: 16px; z-index: 100;
      display: flex; align-items: center; gap: 6px;
    }
    .lang-switcher select {
      padding: 4px 8px; border-radius: 4px; border: 1px solid var(--nw-btn-border);
      font-size: 0.85em; background: var(--nw-btn-bg); cursor: pointer;
    }
    .lang-switcher svg { color: var(--nw-btn-color); flex-shrink: 0; }
    /* Docsify search: inline SVG icon via ::before */
    .search { display: flex; align-items: center; }
    .search::before {
      content: '';
      display: inline-block;
      width: 16px; height: 16px;
      margin-right: 6px;
      flex-shrink: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23666' stroke-width='1.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-size: contain;
    }
    .search input[type=text] { border: none; outline: none; background: transparent; box-shadow: none; }
    ` : '';

  const langSwitcherHtml = hasMultiLang
    ? `\n  <div class="lang-switcher">
    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"/>
    </svg>
    <select id="lang-switcher" onchange="if(this.value)window.location.href='/_api/switch-lang?lang='+this.value">
      ${languages!.map(l => `<option value="${escapeHtml(l.lang)}">${escapeHtml(l.label)}</option>`).join('\n      ')}
    </select>
  </div>`
    : '';

  const langSyncScript = hasMultiLang ? `
(function(){
  var m=document.cookie.match(/nw_lang=([a-z]{2})/);
  if(m){var s=document.getElementById('lang-switcher');if(s)s.value=m[1];}
})();` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(projectName)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
${VENDOR_HEAD}
  <style>
    :root {
      --nw-btn-color: #666;
      --nw-btn-bg: rgba(255,255,255,0.95);
      --nw-btn-border: #ddd;
      --nw-btn-hover-bg: #f0f0f0;
      --nw-btn-hover-color: #333;
      --nw-btn-hover-border: #bbb;
      --nw-accent: #18a058;
      --nw-accent-bg: #e8f5ee;
      --nw-copied: #2a8;
      --nw-lang-color: #888;
      --nw-lang-bg: rgba(0,0,0,0.06);
      --nw-code-bg: #f8f8f8;
    }
    * { scroll-behavior: smooth; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #aaa; }
    .sidebar { width: 260px; }
    .markdown-section { max-width: 900px; }
    .markdown-section table { display: table; width: 100%; }
    .app-name-link { font-size: 1.2em; }
    /* Links: theme default color, only underline on hover */
    .markdown-section a { text-decoration: none; }
    .markdown-section a:hover { text-decoration: underline; }
    /* Code blocks: border-radius only */
    .code-block-wrapper pre[data-lang] { border-radius: 8px; }
    /* Mermaid diagram: toggle + copy controls */
    .mermaid-wrapper { position: relative; margin: 0 0 16px; }
    .mermaid-diagram { background: var(--nw-code-bg); border-radius: 8px; padding: 16px; }
    .mermaid-diagram .mermaid { display: block; margin: 0; }
    .mermaid-controls {
      display: flex; justify-content: center; align-items: center; gap: 4px; margin-bottom: 6px;
    }
    .mermaid-btn, .mermaid-copy-btn {
      padding: 3px 10px; font-size: 11px;
      color: var(--nw-btn-color);
      background: var(--nw-btn-bg);
      border: 1px solid var(--nw-btn-border);
      border-radius: 4px; cursor: pointer; font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .mermaid-btn:hover {
      background: var(--nw-btn-hover-bg);
      color: var(--nw-btn-hover-color);
      border-color: var(--nw-btn-hover-border);
    }
    .mermaid-btn.active {
      background: var(--nw-accent-bg);
      color: var(--nw-accent);
      border-color: var(--nw-accent);
      font-weight: 500;
    }
    .mermaid-code-view { display: none; }
    .mermaid-wrapper.show-code .mermaid-diagram { display: none; }
    .mermaid-wrapper.show-code .mermaid-code-view { display: block; }
    .mermaid-code-view .code-block-wrapper {
      position: relative;
      background: var(--nw-code-bg);
      border-radius: 8px;
    }
    .mermaid-code-view .code-block-wrapper pre {
      background: transparent !important;
      border-radius: 0;
      padding: 16px !important;
      overflow-x: auto; font-size: 13px;
    }
    .mermaid-code-view .code-block-wrapper { box-shadow: none; }
    /* Mermaid fullscreen modal */
    #mermaid-modal {
      display: none; position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      align-items: center; justify-content: center; padding: 24px;
    }
    #mermaid-modal.open { display: flex; }
    #mermaid-modal .mermaid-modal-content {
      background: var(--nw-code-bg); border-radius: 8px; padding: 24px;
      width: 80vw; min-width: 300px; max-height: 90vh; overflow: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    }
    #mermaid-modal .mermaid-modal-close {
      position: absolute; top: 16px; right: 20px;
      background: rgba(255,255,255,0.9); border: 1px solid #ddd;
      border-radius: 50%; width: 36px; height: 36px;
      font-size: 20px; line-height: 36px; text-align: center;
      cursor: pointer; color: #333;
    }
    #mermaid-modal .mermaid-modal-close:hover { background: #fff; }
    /* Regular code block: copy button, lang label to top-left */
    .code-block-wrapper { position: relative; }
    .code-block-wrapper:hover .copy-btn { opacity: 1; pointer-events: auto; }
    .code-block-wrapper pre::after { display: none; }
    .code-block-wrapper pre[data-lang]::before {
      content: attr(data-lang);
      position: absolute; top: 0; left: 0;
      padding: 2px 6px; font-size: 10px; font-weight: 500;
      color: var(--nw-lang-color);
      background: var(--nw-lang-bg);
      border-bottom-right-radius: 4px;
      z-index: 1;
    }
    /* Base button: shared by .copy-btn and mermaid buttons */
    .nw-btn {
      padding: 3px 10px; font-size: 11px;
      color: var(--nw-btn-color);
      background: var(--nw-btn-bg);
      border: 1px solid var(--nw-btn-border);
      border-radius: 4px; cursor: pointer; font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s, opacity 0.2s;
    }
    .copy-btn {
      position: absolute; top: 6px; right: 6px; z-index: 10;
      opacity: 0; pointer-events: none;
    }
    .copy-btn:hover {
      background: var(--nw-btn-hover-bg);
      color: var(--nw-btn-hover-color);
      border-color: var(--nw-btn-hover-border);
    }
    .copy-btn.copied { color: var(--nw-copied); border-color: var(--nw-copied); }
    #scroll-top { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 200; width: 36px; height: 36px; font-size: 18px; line-height: 36px; text-align: center; color: var(--nw-btn-color); background: var(--nw-btn-bg); border: 1px solid var(--nw-btn-border); border-radius: 50%; cursor: pointer; transition: opacity 0.2s, background 0.15s; }
    #scroll-top:hover { background: var(--nw-btn-hover-bg); color: var(--nw-btn-hover-color); }
    ${langSwitcherStyle}
  </style>
</head>
<body>${langSwitcherHtml}
  <div id="app">加载中...</div>
  <button id="scroll-top" title="回到顶部">&#8679;</button>
  <script>
    window.$docsify = {
      name: '${escapeJs(projectName)}',
      loadSidebar: true,
      homepage: 'index.md',
      subMaxLevel: 3,
      search: {
        placeholder: '${escapeJs(search.placeholder)}',
        noData: '${escapeJs(search.noData)}',
        depth: 6
      },
      auto2top: true,
      mergeNavbar: true,
      notFoundPage: true,
      alias: {
        '/.*/_sidebar.md': '/_sidebar.md',
      },
      relativePath: true,
    };${langSyncScript}
  </script>
  <script>
    (function() {
      var btn = document.getElementById('scroll-top');
      if (!btn) return;
      function getScrollY() {
        return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      }
      function update() { btn.style.display = getScrollY() > 200 ? 'block' : 'none'; }
      btn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
      window.addEventListener('scroll', update, { passive: true });
      update(); // initial check
    })();
  </script>
  <script src="/_vendor/app.${APP_HASH}.js"></script>
${VENDOR_SCRIPTS}
</body>
</html>
`;
}

