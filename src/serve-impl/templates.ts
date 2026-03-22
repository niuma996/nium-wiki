/**
 * HTML Template Generation: docsify index.html
 * HTML 模板生成：docsify index.html
 */

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

export function getLangLabel(lang: string): string {
  return LANG_LABELS[lang] || lang;
}

/**
 * Generate docsify index.html / 生成 docsify index.html
 */
export function generateDocsifyIndex(projectName: string, languages?: LangOption[]): string {
  const hasMultiLang = languages && languages.length > 1;

  const langSwitcherStyle = hasMultiLang ? `
    .lang-switcher { position: fixed; top: 10px; right: 16px; z-index: 100; }
    .lang-switcher select { padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc; font-size: 0.85em; background: #fff; cursor: pointer; }` : '';

  const langSwitcherHtml = hasMultiLang
    ? `\n  <div class="lang-switcher">
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
    .sidebar { width: 260px; }
    .markdown-section { max-width: 900px; }
    .markdown-section table { display: table; width: 100%; }
    .app-name-link { font-size: 1.2em; }${langSwitcherStyle}
  </style>
</head>
<body>${langSwitcherHtml}
  <div id="app">加载中...</div>
  <script>
    window.$docsify = {
      name: '${escapeJs(projectName)}',
      loadSidebar: true,
      homepage: 'index.md',
      subMaxLevel: 3,
      search: {
        placeholder: '搜索文档...',
        noData: '没有找到结果',
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
${VENDOR_SCRIPTS}
</body>
</html>
`;
}

