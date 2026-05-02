#!/usr/bin/env node
/**
 * Post-bundle cleanup
 *
 * ncc 0.38.4 outputs CJS. This script:
 *   1. Reads the ncc CJS output (index.js)
 *   2. Strips the leading shebang (not valid JS syntax in CJS eval context)
 *   3. Writes the result as index.cjs (forces CommonJS regardless of any upstream package.json#type)
 *   4. Removes the ncc output (index.js) and .d.ts/.d.ts.map files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BIN_DIR = path.join(__dirname, '..', 'skills', 'nium-wiki', 'scripts');
const nccOutput = path.join(BIN_DIR, 'index.js');
const cjsBundle = path.join(BIN_DIR, 'index.cjs');

let content = fs.readFileSync(nccOutput, 'utf-8');

// ── 1. Strip leading shebang ──────────────────────────────────────────────────
if (content.startsWith('#!/usr/bin/env node\n')) {
  content = content.slice(20);
} else if (content.startsWith('#!/usr/bin/env node\r\n')) {
  content = content.slice(21);
}
// ── 2. No ESM polyfill needed — bundle stays as pure CJS.
//     .cjs extension guarantees CommonJS regardless of any package.json#type upstream.

// ── 3. Write to .cjs, remove ncc output ──────────────────────────────────────
fs.writeFileSync(cjsBundle, content, 'utf-8');
fs.unlinkSync(nccOutput);
console.log('post-bundle: written to index.cjs, ncc output removed');

// ── 4. Remove .d.ts/.d.ts.map files and empty directories ───────────────────
let removed = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.ts.map')) {
      fs.unlinkSync(full);
      removed++;
    }
  }

  try {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch { /* ignore */ }
}

walk(BIN_DIR);
console.log(`cleanup: ${removed} files removed`);
