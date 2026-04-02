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
    if (e.key === 'Escape') closeMermaidModal();
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
