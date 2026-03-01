#!/usr/bin/env node
/**
 * Post-build script: Copy vendor static files from node_modules to dist/vendor/
 * Only copy files actually needed by the serve page, not the entire package
 */

const fs = require('fs');
const path = require('path');

const DIST_VENDOR = path.join(__dirname, '..', 'dist', 'vendor');

// 源文件映射: dist/vendor/ 下的目标路径 → node_modules 中的源路径
const VENDOR_FILES = {
  'docsify/vue.css': 'docsify/lib/themes/vue.css',
  'docsify/docsify.min.js': 'docsify/lib/docsify.min.js',
  'docsify/search.min.js': 'docsify/lib/plugins/search.min.js',
  'prismjs/prism-typescript.min.js': 'prismjs/components/prism-typescript.min.js',
  'prismjs/prism-python.min.js': 'prismjs/components/prism-python.min.js',
  'prismjs/prism-bash.min.js': 'prismjs/components/prism-bash.min.js',
  'prismjs/prism-json.min.js': 'prismjs/components/prism-json.min.js',
  'prismjs/prism-yaml.min.js': 'prismjs/components/prism-yaml.min.js',
  'prismjs/prism-go.min.js': 'prismjs/components/prism-go.min.js',
  'prismjs/prism-rust.min.js': 'prismjs/components/prism-rust.min.js',
  'prismjs/prism-java.min.js': 'prismjs/components/prism-java.min.js',
  'mermaid/mermaid.min.js': 'mermaid/dist/mermaid.min.js',
  'docsify-mermaid/docsify-mermaid.js': 'docsify-mermaid/dist/docsify-mermaid.js',
};

let copied = 0;
let failed = 0;

for (const [dest, src] of Object.entries(VENDOR_FILES)) {
  const srcPath = path.join(__dirname, '..', 'node_modules', src);
  const destPath = path.join(DIST_VENDOR, dest);

  if (!fs.existsSync(srcPath)) {
    console.error(`  MISS  ${src}`);
    failed++;
    continue;
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  // Special handling for vue.css: Remove Google Fonts external dependency
  if (dest === 'docsify/vue.css') {
    let content = fs.readFileSync(srcPath, 'utf-8');
    content = content.replace(/@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\);?\s*/g, '');
    fs.writeFileSync(destPath, content, 'utf-8');
  } else {
    fs.copyFileSync(srcPath, destPath);
  }

  copied++;
}

const totalSize = getTotalSize(DIST_VENDOR);
console.log(`vendor: ${copied} files copied (${formatSize(totalSize)}), ${failed} missing`);

if (failed > 0) {
  process.exit(1);
}

function getTotalSize(dir) {
  let size = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) size += getTotalSize(p);
      else size += fs.statSync(p).size;
    }
  } catch { /* ignore */ }
  return size;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
