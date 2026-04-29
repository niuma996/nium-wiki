#!/usr/bin/env node
/**
 * Post-bundle cleanup + ESM compatibility fix
 *
 * ncc 0.38.4 outputs ESM (top-level import/export, no CJS IIFE wrapper).
 * The bundle may be loaded in an ESM context. This script:
 *   1. Strips the leading shebang (not valid JS syntax in ESM)
 *   2. Prepends ESM polyfills (createRequire, import.meta.url shims)
 *      so that any embedded require() calls keep working
 *   3. Removes .d.ts / .d.ts.map files and empty directories
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BIN_DIR = path.join(__dirname, '..', 'skills', 'nium-wiki', 'scripts');
const bundlePath = path.join(BIN_DIR, 'index.js');

let content = fs.readFileSync(bundlePath, 'utf-8');

// ── 1. Strip leading shebang ──────────────────────────────────────────────────
if (content.startsWith('#!/usr/bin/env node\n')) {
  content = content.slice(20);
} else if (content.startsWith('#!/usr/bin/env node\r\n')) {
  content = content.slice(21);
}

// ── 2. Prepend ESM polyfill ──────────────────────────────────────────────────
// The polyfill provides require/createRequire/__filename/__dirname so that
// any require() calls inside the bundle continue to work in ESM contexts.
// No CJS IIFE wrapping is needed — ncc 0.38.4 outputs pure ESM.
const esmPolyfill = `import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

`;

content = esmPolyfill + content;

// ── 3. Remove .d.ts/.d.ts.map files and empty directories ───────────────────

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

  // remove dir if empty
  try {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch { /* ignore */ }
}

walk(BIN_DIR);
fs.writeFileSync(bundlePath, content, 'utf-8');
console.log('post-bundle: ESM polyfill injected, shebang removed');
console.log(`cleanup: ${removed} files removed`);
