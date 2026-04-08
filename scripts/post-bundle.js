#!/usr/bin/env node
/**
 * Post-bundle cleanup + ESM compatibility fix
 *
 * The ncc bundle is a CJS IIFE with no parameters, but it may be loaded in an
 * ESM context (target package.json has "type": "module"). This script:
 *   1. Strips the shebang (not valid JS syntax in ESM)
 *   2. Injects ESM polyfills (import.meta.url, createRequire)
 *   3. Passes the polyfilled `require` into the ncc IIFE so internal
 *      __nccwpck_require__ calls keep working
 */

const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'skills', 'nium-wiki', 'scripts');
const bundlePath = path.join(BIN_DIR, 'index.js');

let content = fs.readFileSync(bundlePath, 'utf-8');

// ── 1. Strip leading shebang (not valid as JS in ESM) ────────────────────────
if (content.startsWith('#!/usr/bin/env node\n')) {
  content = content.slice(20); // remove shebang + \n
} else if (content.startsWith('#!/usr/bin/env node\r\n')) {
  content = content.slice(21); // remove shebang + \r\n
}

// ── 2. Inject ESM polyfill before the ncc IIFE ───────────────────────────────
const esmPolyfill = `import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const exports = {};
const module = { exports };
`;

const iifeStart = content.indexOf('(()=>{');
if (iifeStart === -1) {
  console.error('post-bundle: could not find ncc IIFE start, skipping ESM patch');
} else {
  // Remove any shebang lines between the polyfill and the IIFE body
  // (ncc embeds the source file's shebang as-is into the bundle body)
  let between = content.slice(esmPolyfill.length, iifeStart);
  between = between.replace(/^#!.*?\n\r?/, '').replace(/^#!.*?\r?\n/, '');
  content = esmPolyfill + between + content.slice(iifeStart);
}

// ── 3. Pass all 5 CJS globals into the ncc IIFE ───────────────────────────────
// ncc IIFE signature: (exports, module, require, __dirname, __filename)
// But its parameters are minified (e.g. "var n=..."), so we pass by position.
// We inject module/exports shims above; __dirname/__filename are real values.
content = content.replace(
  /(__nccwpck_require__\(\d+\);module\.exports=\w+)\}\)\(\);$/,
  '$1})(module.exports,module,require,__dirname,__filename);'
);

fs.writeFileSync(bundlePath, content, 'utf-8');
console.log('post-bundle: ESM polyfill injected, shebang removed');

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

  // remove dir if empty
  try {
    const remaining = fs.readdirSync(dir);
    if (remaining.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch { /* ignore */ }
}

walk(BIN_DIR);
console.log(`cleanup: ${removed} files removed`);
