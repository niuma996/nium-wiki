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
    .app-name-link { font-size: 1.2em; }
    /* Mermaid diagram: toggle + copy controls */
    .mermaid-wrapper { position: relative; display: inline-block; width: 100%; margin: 16px 0; padding-top: 32px; }
    .mermaid-controls {
      position: absolute; top: 0; left: 0; right: 0;
      display: flex; justify-content: center; align-items: center; gap: 4px; z-index: 10;
    }
    .mermaid-btn, .mermaid-copy-btn {
      padding: 3px 10px; font-size: 11px; color: #666;
      background: rgba(255,255,255,0.95); border: 1px solid #ddd;
      border-radius: 4px; cursor: pointer; font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .mermaid-btn:hover, .mermaid-copy-btn:hover { background: #f0f0f0; color: #333; border-color: #bbb; }
    .mermaid-btn.active { background: #e8f0fe; color: #1a73e8; border-color: #1a73e8; font-weight: 500; }
    .mermaid-copy-btn.copied { color: #2a8; border-color: #2a8; }
    .mermaid-code-view { display: none; }
    .mermaid-wrapper.show-code .mermaid-code-view { display: block; margin: 0; }
    .mermaid-wrapper.show-code .mermaid:not(.mermaid-code-view) { display: none; }
    .mermaid-code-view pre {
      background: #f6f8fa; border: 1px solid #e1e4e8;
      border-radius: 6px; padding: 16px; margin: 0;
      overflow-x: auto; font-size: 13px;
    }
    /* Regular code block: copy button, lang label to top-left */
    .code-block-wrapper { position: relative; }
    .code-block-wrapper:hover .copy-btn,
    .code-block-wrapper:focus-within .copy-btn,
    .copy-btn:focus { opacity: 1; pointer-events: auto; }
    /* Move lang label to top-left (docsify default: top-right via ::after) */
    .code-block-wrapper pre::after { display: none; }
    .code-block-wrapper pre[data-lang]::before {
      content: attr(data-lang);
      position: absolute; top: 0; left: 0;
      padding: 3px 8px; font-size: 11px; font-weight: 600;
      color: #888; background: rgba(0,0,0,0.06);
      border-bottom-right-radius: 4px;
      z-index: 1;
    }
    .copy-btn {
      position: absolute; top: 6px; right: 6px; z-index: 10;
      padding: 3px 8px; font-size: 11px; color: #666;
      background: rgba(255,255,255,0.95); border: 1px solid #ddd;
      border-radius: 4px; cursor: pointer; opacity: 0;
      pointer-events: none; transition: opacity 0.2s, color 0.15s;
      font-family: inherit;
    }
    .copy-btn:hover { color: #333; border-color: #bbb; }
    .copy-btn.copied { color: #2a8; border-color: #2a8; }${langSwitcherStyle}
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
    // Mermaid toggle (Diagram/Code) + Copy buttons for all code blocks
    (function(){
      function initControls() {
        // Mermaid: wrap + add control bar + code view
        document.querySelectorAll('div.mermaid:not(.mermaid-wrapper *)').forEach(function(div) {
          var wrapper = document.createElement('div');
          wrapper.className = 'mermaid-wrapper';
          div.parentNode.insertBefore(wrapper, div);
          wrapper.appendChild(div);

          var originalCode = div.getAttribute('data-code') || div.textContent || '';
          var codeView = document.createElement('div');
          codeView.className = 'mermaid-code-view';
          codeView.innerHTML = '<pre><code>' + originalCode.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
          wrapper.appendChild(codeView);

          var controls = document.createElement('div');
          controls.className = 'mermaid-controls';
          controls.innerHTML =
            '<button class="mermaid-btn active" data-view="diagram">Diagram</button>' +
            '<button class="mermaid-btn" data-view="code">Code</button>' +
            '<button class="mermaid-copy-btn">Copy</button>';
          wrapper.appendChild(controls);
        });

        // Regular code blocks: wrap + add copy button
        document.querySelectorAll('pre[data-lang]:not(.code-block-wrapper *)').forEach(function(pre) {
          if (pre.closest('.mermaid-wrapper')) return;
          var wrapper = document.createElement('div');
          wrapper.className = 'code-block-wrapper';
          pre.parentNode.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);

          var btn = document.createElement('button');
          btn.className = 'copy-btn';
          btn.textContent = 'Copy';
          pre.appendChild(btn);
        });
      }

      // Init on first load and after each docsify page change
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initControls);
      } else {
        initControls();
      }

      // Re-init after docsify navigation (doneEach fires after each page render)
      if (window.$docsify) {
        var origPlugins = window.$docsify.plugins || [];
        window.$docsify.plugins = origPlugins.concat(function(hook) {
          hook.doneEach(initControls);
        });
      }

      // Delegated click handler for all copy + toggle buttons
      document.addEventListener('click', function(e) {
        var btn = e.target;

        // Copy button: find adjacent code and copy it
        if ((btn.classList.contains('copy-btn') || btn.classList.contains('mermaid-copy-btn')) && !btn.classList.contains('mermaid-btn')) {
          var wrapper = btn.closest('.code-block-wrapper, .mermaid-wrapper');
          var text = '';
          if (wrapper) {
            // Always read from the code-view pre/code element for reliability
            var codeEl = wrapper.querySelector('.mermaid-code-view code');
            if (codeEl) text = codeEl.textContent || '';
          }
          if (!text) {
            var pre = btn.closest('.code-block-wrapper');
            if (pre) text = pre.querySelector('code') ? pre.querySelector('code').textContent : pre.querySelector('pre').textContent;
          }
          if (text) {
            navigator.clipboard.writeText(text).then(function() {
              btn.textContent = 'Copied!';
              btn.classList.add('copied');
              setTimeout(function() {
                btn.textContent = 'Copy';
                btn.classList.remove('copied');
              }, 1500);
            });
          }
        }

        // Mermaid toggle: Diagram / Code
        if (btn.classList.contains('mermaid-btn')) {
          var view = btn.getAttribute('data-view');
          var wrapper = btn.closest('.mermaid-wrapper');
          if (wrapper && view) {
            var diagramBtn = wrapper.querySelector('[data-view=diagram]');
            var codeBtn = wrapper.querySelector('[data-view=code]');
            if (view === 'code') {
              wrapper.classList.add('show-code');
              diagramBtn.classList.remove('active');
              codeBtn.classList.add('active');
            } else {
              wrapper.classList.remove('show-code');
              codeBtn.classList.remove('active');
              diagramBtn.classList.add('active');
            }
          }
        }
      });
    })();
  </script>
${VENDOR_SCRIPTS}
</body>
</html>
`;
}

