#!/usr/bin/env node
/**
 * Build search index for docsify search plugin.
 * Scans all .md files in the given wiki directory and generates a search_index.json
 * matching docsify's expected format: { "/path.md": { title, url, body }, ... }
 *
 * Usage: node scripts/build-search-index.js <wikiDir>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

        // Nium-Wiki files use --- at the start as empty frontmatter convention (---\n\n# Title)
        // and --- near the end as the footer separator (---\n*Footer*).
        // These two --- markers are the SAME string in files with no real frontmatter content,
        // so we must handle them carefully to avoid eating all content.
        let bodyContent = content;
        if (bodyContent.startsWith('---\n\n')) {
          bodyContent = bodyContent.substring(4); // strip frontmatter opener ---\n\n
        }
        // Strip footer: \n---\n followed by footer content at end of file
        const footerMatch = bodyContent.match(/\n---\n([\s\S]*)$/);
        if (footerMatch) {
          bodyContent = bodyContent.substring(0, bodyContent.length - footerMatch[0].length);
        }

        const body = bodyContent
          .replace(/```[\s\S]*?```/g, '')         // code blocks
          .replace(/`[^`]+`/g, '')               // inline code
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> text
          .replace(/[*_~#]+([^*_\n]+)[*_~#]*/g, '$1') // bold/italic
          .replace(/^#+\s+/gm, '')              // headings
          .replace(/^[-*+]\s+/gm, '')            // list bullets
          .replace(/^\s+|\s+$/gm, '')            // leading/trailing whitespace
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
