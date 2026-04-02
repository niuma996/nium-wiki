#!/usr/bin/env node
/**
 * Build search index for docsify search plugin.
 * Scans all .md files in the given wiki directory and generates a search_index.json
 * matching docsify's expected format: { "/path.md": { title, url, body }, ... }
 *
 * Usage: node scripts/build-search-index.js <wikiDir>
 */

const fs = require('fs');
const path = require('path');

const wikiDir = process.argv[2];
if (!wikiDir) {
  console.error('Usage: node scripts/build-search-index.js <wikiDir>');
  process.exit(1);
}

if (!fs.existsSync(wikiDir)) {
  console.error(`Wiki directory does not exist: ${wikiDir}`);
  process.exit(1);
}

const index = {};
const MAX_BODY_LEN = 5000;

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden dirs and common non-content dirs
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walkDir(fullPath);
      }
    } else if (entry.name.endsWith('.md')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const relPath = '/' + path.relative(wikiDir, fullPath).replace(/\\/g, '/');
        const urlPath = relPath.replace(/\.md$/, '.html');

        // Extract first h1 as title
        const titleMatch = content.match(/^#\s+(.+)/m);
        const title = titleMatch
          ? titleMatch[1].trim()
          : entry.name.replace(/\.md$/, '').replace(/[-_]/g, ' ');

        // Strip markdown syntax for body text
        const body = content
          .replace(/^---[\s\S]*?---\n/, '')       // frontmatter
          .replace(/```[\s\S]*?```/g, '')         // code blocks
          .replace(/`[^`]+`/g, '')               // inline code
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> text
          .replace(/[*_~#]+([^*_\n]+)[*_~#]*/g, '$1') // bold/italic
          .replace(/^#+\s+/gm, '')              // headings
          .replace(/^[-*+]\s+/gm, '')            // list bullets
          .replace(/^\s+|s+$/gm, '')            // leading/trailing spaces
          .replace(/\n{3,}/g, '\n\n')           // extra blank lines
          .substring(0, MAX_BODY_LEN);

        index[relPath] = { title, url: urlPath, body };
      } catch (e) {
        // skip unreadable files
      }
    }
  }
}

walkDir(wikiDir);

const outPath = path.join(wikiDir, 'search_index.json');
fs.writeFileSync(outPath, JSON.stringify(index, null, 0), 'utf-8');
console.log(`search_index.json: ${Object.keys(index).length} entries -> ${outPath}`);
