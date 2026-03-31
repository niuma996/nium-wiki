#!/usr/bin/env node
/**
 * Post-bundle cleanup: remove .d.ts/.d.ts.map files and empty directories
 */

const fs = require('fs');
const path = require('path');

const BIN_DIR = path.join(__dirname, '..', 'skills', 'nium-wiki', 'scripts');

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
