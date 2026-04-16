// @ts-nocheck
/**
 * App Client Script: Static JS injected into docsify index.html
 * No server-side dependencies — safe to serve as a static asset.
 *
 * Contains: initControls (Mermaid wrap + copy buttons),
 *           click delegation, SSE hot reload.
 */

(function () {
  'use strict';

  // ── Source code drawer (simple iframe version) ─────────────────────

  /**
   * Resolve href to a clean path (without hash/query, project-root-relative).
   */
  function getSourceFilePath(href) {
    var cleanHref = href;
    if (cleanHref.startsWith('#')) cleanHref = cleanHref.substring(1);
    cleanHref = cleanHref.split('?')[0];
    var baseUrl = location.href.split('#')[0];
    try {
      var resolved = new URL(cleanHref, baseUrl);
      return resolved.pathname;
    } catch (_) {
      return cleanHref;
    }
  }

  /**
   * Check if href is an internal link (not external protocol).
   */
  function isInternalHref(href) {
    if (!href) return false;
    return !/^(https?|mailto|tel):/.test(href);
  }

  function openSourceDrawer(filePath) {
    var drawer = document.getElementById('src-drawer');
    var iframe = document.getElementById('src-drawer-iframe');
    var filename = document.getElementById('src-drawer-filename');
    if (!drawer || !iframe) return;

    filename.textContent = filePath;
    iframe.src = '/_raw' + filePath;
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeSourceDrawer() {
    var drawer = document.getElementById('src-drawer');
    var iframe = document.getElementById('src-drawer-iframe');
    if (drawer) drawer.classList.remove('open');
    document.body.style.overflow = '';
    if (iframe) iframe.src = 'about:blank';
  }

  // Initialize drawer close handlers
  document.addEventListener('DOMContentLoaded', function () {
    var closeBtn = document.getElementById('src-drawer-close');
    var overlay = document.getElementById('src-drawer-overlay');
    if (closeBtn) closeBtn.addEventListener('click', closeSourceDrawer);
    if (overlay) overlay.addEventListener('click', closeSourceDrawer);

    // Drawer resize handle (left side, drag to resize width)
    var handle = document.getElementById('src-drawer-resize-handle');
    var drawer = document.getElementById('src-drawer');
    if (handle && drawer) {
      var minW = window.innerWidth * 0.4; // 下限 40vw
      var maxW = window.innerWidth * 0.9;  // 上限 90vw
      var startX = 0, startW = 0;
      var viewportRight = 0;

      function onMouseMove(e) {
        var newW = Math.min(maxW, Math.max(minW, viewportRight - e.clientX));
        drawer.style.width = newW + 'px';
      }

      function onMouseUp() {
        drawer.classList.remove('dragging');
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        startX = e.clientX;
        startW = drawer.offsetWidth;
        viewportRight = window.innerWidth;
        maxW = viewportRight * 0.9;
        drawer.classList.add('dragging');
        handle.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  });

  // Intercept clicks on source links (capture phase, on document for dynamic content).
  // Determination is delegated to the server: asks /_is-source whether the file
  // exists in .nium-wiki/raw/. This makes the drawer work for any project structure
  // (non-standard layouts, root config files, etc.) without hardcoded patterns.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    if (!isInternalHref(href)) return;

    // Strip hash so /#/src/foo.ts → /src/foo.ts
    var cleanHref = href.replace(/^#/, '');
    var filePath = getSourceFilePath(cleanHref);
    e.preventDefault();
    e.stopPropagation();

    // Decide whether to open the drawer based on server response.
    function decide(open) {
      if (open) {
        openSourceDrawer(filePath);
      } else {
        // Not a source file — manually restore navigation since we called preventDefault.
        location.href = href;
      }
    }

    // fetch() with navigate:'manual' prevents the browser from navigating while we check.
    // This keeps the UI responsive (no sync XHR blocking).
    // Supported in Chrome 102+. For other browsers, we preventDefault and restore
    // navigation manually after the async fetch resolves.
    var navOption = typeof Navigation !== 'undefined' ? { navigate: 'manual' } : undefined;
    fetch('/_is-source?path=' + encodeURIComponent(filePath), {
      method: 'GET',
      navigate: navOption,
    }).then(function (res) {
      return res.text();
    }).then(function (body) {
      decide(body === '1');
    }).catch(function () {
      // Network error → treat as non-source, restore navigation
      decide(false);
    });
  }, true);

  // ── Prism fix ───────────────────────────────────────────────────────
  // docsify 4.x bundles its own Prism in a closure, isolating external
  // prism-*.min.js language additions (typescript, python, etc.).
  // Re-highlight all code blocks in the DOM using window.Prism after each render.
  if (window.$docsify) {
    window.$docsify.plugins = window.$docsify.plugins || [];
    window.$docsify.plugins.push(function prismFix(hook) {
      hook.doneEach(function () {
        var Prism = window.Prism;
        if (!Prism || !Prism.languages) return;
        document.querySelectorAll('pre[data-lang]').forEach(function (pre) {
          var codeEl = pre.querySelector('code');
          if (!codeEl) return;
          var lang = (pre.getAttribute('data-lang') || 'markup').match(/\S*/)[0] || 'markup';
          var grammar = Prism.languages[lang] || Prism.languages.markup;
          if (!grammar) return;
          if (codeEl.querySelector('.token')) return;
          var text = codeEl.textContent || '';
          if (text) {
            codeEl.innerHTML = Prism.highlight(text.replace(/@DOCSIFY_QM@/g, '`'), grammar, lang);
          }
        });
      });
    });
  }

  // ── Search modal ────────────────────────────────────────────────────

  var searchModal, searchInput, searchResults, searchEmpty, searchHint;
  var searchIndex = null;
  var searchDebounceTimer = null;
  var searchI18n = { noData: 'No results found', hint: 'Esc to close · Click result to navigate', indexing: 'Indexing docs...', close: 'Close' };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlight(text, term) {
    if (!term) return escapeHtml(text);
    var regex = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  function openSearchModal() {
    if (!searchModal) {
      searchModal = document.getElementById('search-modal');
      searchInput = document.getElementById('search-modal-input');
      searchResults = document.getElementById('search-modal-results');
      searchEmpty = document.getElementById('search-modal-empty');
      searchHint = document.getElementById('search-modal-hint');
      // Read i18n from data attribute
      try {
        var raw = searchModal.getAttribute('data-i18n');
        if (raw) searchI18n = JSON.parse(raw);
      } catch (_) { /* use defaults */ }
      var closeBtn = searchModal.querySelector('#search-modal-close');
      if (closeBtn) closeBtn.setAttribute('aria-label', searchI18n.close || 'Close');
      searchModal.querySelector('#search-modal-close').addEventListener('click', closeSearchModal);
      searchModal.addEventListener('click', function(e) {
        if (e.target === searchModal) closeSearchModal();
      });
      searchInput.addEventListener('input', function() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(runSearch, 150);
      });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeSearchModal();
      });
    }
    searchModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchEmpty.style.display = 'none';
    searchEmpty.textContent = '';
    searchHint.style.display = 'block';
    searchHint.textContent = searchI18n.hint;
    searchInput.focus();
    // Pre-fill from docsify search input if present
    var docsifyInput = document.querySelector('.search input[type=text], .search input[type=search]');
    if (docsifyInput && docsifyInput.value) {
      searchInput.value = docsifyInput.value;
      runSearch();
    }
  }

  function closeSearchModal() {
    if (!searchModal) return;
    searchModal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function runSearch() {
    var term = searchInput.value.trim();
    if (!term) { searchResults.innerHTML = ''; searchEmpty.style.display = 'none'; return; }
    if (!searchIndex) {
      searchResults.innerHTML = '';
      searchEmpty.style.display = 'block';
      searchEmpty.textContent = searchI18n.indexing;
      fetchSearchIndex(function(idx) {
        searchIndex = idx;
        renderResults(term);
      });
    } else {
      renderResults(term);
    }
  }

  function fetchSearchIndex(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/search_index.json', true);
    xhr.onload = function() {
      if (xhr.status === 200 && xhr.responseText.trim().startsWith('{')) {
        try { callback(JSON.parse(xhr.responseText)); } catch (_) { buildIndexFromFetch(callback); }
      } else {
        buildIndexFromFetch(callback);
      }
    };
    xhr.onerror = function() { buildIndexFromFetch(callback); };
    xhr.send();
  }

  // Fallback: build a mini search index by fetching all markdown links from sidebar
  function buildIndexFromFetch(callback) {
    var result = {};
    var pending = 0;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/_sidebar.md', true);
    xhr.onload = function() {
      if (xhr.status !== 200) { callback({}); return; }
      var links = [];
      var temp = document.createElement('div');
      temp.innerHTML = xhr.responseText;
      temp.querySelectorAll('a[href]').forEach(function(a) {
        var href = a.getAttribute('href');
        if (href && href.endsWith('.md') && !href.startsWith('http') && !href.startsWith('//')) {
          links.push(href);
        }
      });
      if (links.length === 0) { callback({}); return; }
      pending = links.length;
      links.forEach(function(link) {
        var fx = new XMLHttpRequest();
        fx.open('GET', link, true);
        fx.onload = function() {
          if (fx.status === 200) {
            var text = fx.responseText;
            var titleMatch = text.match(/^#\s+(.+)/m);
            var title = titleMatch ? titleMatch[1].trim() : link.replace('.md', '').replace(/.*\//, '');
            result[link] = { title: title, url: link.replace(/\.md$/, '.html'), body: text.replace(/^#.+$/gm, '').replace(/```[\s\S]*?```/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').substring(0, 2000) };
          }
          pending--;
          if (pending <= 0) callback(result);
        };
        fx.onerror = function() { pending--; if (pending <= 0) callback(result); };
        fx.send();
      });
    };
    xhr.onerror = function() { callback({}); };
    xhr.send();
  }

  function renderResults(term) {
    var termLower = term.toLowerCase();
    var maxDepth = 6;
    var results = [];

    function walk(data, depth) {
      if (depth > maxDepth || !data || typeof data !== 'object') return;
      for (var key in data) {
        var val = data[key];
        if (val && typeof val === 'object') {
          // docsify search index: each entry has title + url + body
          if (val.title && val.url) {
            var body = val.body || '';
            var titleMatch = val.title.toLowerCase().includes(termLower);
            var bodyMatch = String(body).toLowerCase().includes(termLower);
            if (titleMatch || bodyMatch) {
              results.push({
                url: val.url,
                title: val.title,
                body: typeof body === 'string' ? body : '',
                titleMatch: titleMatch
              });
            }
          } else {
            walk(val, depth + 1);
          }
        }
      }
    }

    walk(searchIndex, 0);

    // Sort: title matches first
    results.sort(function(a, b) {
      var aTitle = a.title.toLowerCase().includes(termLower) ? 0 : 1;
      var bTitle = b.title.toLowerCase().includes(termLower) ? 0 : 1;
      return aTitle - bTitle;
    });

    searchResults.innerHTML = '';
    if (results.length === 0) {
      searchEmpty.textContent = searchI18n.noData;
      searchEmpty.style.display = 'block';
      return;
    }
    searchEmpty.style.display = 'none';

    var maxResults = 20;
    results.slice(0, maxResults).forEach(function(r) {
      var excerpt = '';
      var bodyLower = r.body.toLowerCase();
      var idx = bodyLower.indexOf(termLower);
      if (idx >= 0) {
        var start = Math.max(0, idx - 40);
        var end = Math.min(r.body.length, idx + term.length + 60);
        excerpt = (start > 0 ? '...' : '') + r.body.substring(start, end) + (end < r.body.length ? '...' : '');
      }
      var a = document.createElement('a');
      a.className = 'search-result-item';
      var rawUrl = r.url;
      // Normalize to docsify hash routing: /path.html -> /#/path
      var normalizedUrl = rawUrl.replace(/\.html$/, '').replace(/^\/(?!\/)/, '/#');
      a.href = normalizedUrl;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        closeSearchModal();
        if (window.$docsify && window.$docsify.router && window.$docsify.router.resolve) {
          window.$docsify.router.resolve(rawUrl, true, true);
        } else {
          location.href = normalizedUrl;
        }
      });
      a.innerHTML =
        '<div class="search-result-title">' + highlight(r.title, term) + '</div>' +
        (excerpt ? '<div class="search-result-excerpt">' + highlight(excerpt, term) + '</div>' : '');
      searchResults.appendChild(a);
    });
  }

  // Intercept clicks on docsify's search input to open our modal
  // Use capture phase + mousedown to intercept before docsify stops propagation
  document.addEventListener('mousedown', function(e) {
    var searchEl = e.target.closest ? e.target.closest('.search') : null;
    if (!searchEl) return;
    var input = searchEl.querySelector('input');
    if (!input) return;
    e.preventDefault();
    e.stopPropagation();
    openSearchModal();
  }, true);

  // / key opens search modal (like GitHub/VuePress)
  document.addEventListener('keydown', function(e) {
    if (e.key !== '/') return;
    var tag = (e.target as Element).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as Element).isContentEditable) return;
    e.preventDefault();
    openSearchModal();
  });

  // ── Mermaid fullscreen modal ─────────────────────────────────────────

  function getMermaidModal() {
    var modal = document.getElementById('mermaid-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mermaid-modal';
      modal.innerHTML =
        '<button class="mermaid-modal-close" aria-label="Close">&#10005;</button>' +
        '<div class="mermaid-modal-content"></div>';
      modal.querySelector('.mermaid-modal-close').addEventListener('click', closeMermaidModal);
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeMermaidModal();
      });
      document.body.appendChild(modal);
    }
    return modal;
  }

  function openMermaidModal(svgEl) {
    var modal = getMermaidModal();
    modal.querySelector('.mermaid-modal-content').innerHTML = '';
    modal.querySelector('.mermaid-modal-content').appendChild(svgEl.cloneNode(true));
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeMermaidModal() {
    var modal = document.getElementById('mermaid-modal');
    if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
  }

  // ── Mermaid wrap + copy button init ────────────────────────────────

  function initControls() {
    // Mermaid: wrap + add control bar + code view
    document.querySelectorAll('div.mermaid:not(.mermaid-diagram *)').forEach(function (div: Element) {
      var wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';
      div.parentNode.insertBefore(wrapper, div);

      var diagramBox = document.createElement('div');
      diagramBox.className = 'mermaid-diagram';
      diagramBox.style.cursor = 'zoom-in';
      diagramBox.addEventListener('click', function(e) {
        if (e.target.closest('.mermaid-controls')) return;
        var svg = div.querySelector('svg');
        if (svg) openMermaidModal(svg);
      });
      diagramBox.appendChild(div);
      wrapper.appendChild(diagramBox);

      var originalCode = div.getAttribute('data-code') || div.textContent || '';
      var codeView = document.createElement('div');
      codeView.className = 'mermaid-code-view';
      codeView.innerHTML =
        '<div class="code-block-wrapper">' +
          '<pre data-lang="mermaid"><code>' + originalCode.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>' +
          '<button class="nw-btn copy-btn">Copy</button>' +
        '</div>';
      wrapper.appendChild(codeView);

      var controls = document.createElement('div');
      controls.className = 'mermaid-controls';
      controls.innerHTML =
        '<button class="mermaid-btn active" data-view="diagram">Diagram</button>' +
        '<button class="mermaid-btn" data-view="code">Code</button>';
      wrapper.parentNode.insertBefore(controls, wrapper);
    });

    // Regular code blocks: wrap + add copy button
    document.querySelectorAll('pre[data-lang]:not(.code-block-wrapper *)').forEach(function (pre: Element) {
      if (pre.closest('.mermaid-wrapper')) return;
      var wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      var btn = document.createElement('button');
      btn.className = 'nw-btn copy-btn';
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

  // Re-init after docsify navigation
  if (window.$docsify) {
    var origPlugins = window.$docsify.plugins || [];
    window.$docsify.plugins = origPlugins.concat(function (hook: { doneEach: (fn: () => void) => void }) {
      hook.doneEach(initControls);
    });
  }

  // ── Click delegation: copy + mermaid toggle ────────────────────────

  document.addEventListener('click', function (e: Event) {
    var btn = e.target;

    // Copy button
    if (btn.classList.contains('copy-btn') || btn.classList.contains('mermaid-wrapper-copy')) {
      var wrapper = btn.closest('.code-block-wrapper, .mermaid-wrapper');
      var text = '';
      if (wrapper) {
        var codeEl = wrapper.querySelector('.mermaid-code-view code');
        if (codeEl) text = codeEl.textContent || '';
      }
      if (!text) {
        var pre = btn.closest('.code-block-wrapper');
        if (pre) text = pre.querySelector('code') ? pre.querySelector('code').textContent : pre.querySelector('pre').textContent;
      }
      if (text) {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 1500);
        });
      }
      return;
    }

    // Mermaid toggle: Diagram / Code
    if (btn.classList.contains('mermaid-btn')) {
      var view = btn.getAttribute('data-view');
      var controls = btn.closest('.mermaid-controls');
      var wrapper = controls?.nextElementSibling;
      if (wrapper && view) {
        var diagramBtn = controls.querySelector('[data-view=diagram]');
        var codeBtn = controls.querySelector('[data-view=code]');
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

  // ── Keyboard: Escape closes modal ───────────────────────────────────

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeMermaidModal(); closeSearchModal(); closeSourceDrawer(); }
  });

  // ── SSE hot reload ────────────────────────────────────────────────

  (function () {
    var es = new EventSource('/_api/events');
    es.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data.type === 'reload') {
          location.reload();
        }
      } catch (_) { /* ignore parse errors */ }
    };
    es.onerror = function () { /* silently reconnect */ };
  })();

})();
