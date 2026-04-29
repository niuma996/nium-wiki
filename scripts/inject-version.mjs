#!/usr/bin/env node
/**
 * Inject version into bundled index.js via process.env.NIUM_WIKI_VERSION replacement.
 * This makes the version available regardless of where the skill is copied to.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const version = require('../package.json').version;
const bundlePath = path.join(__dirname, '..', 'skills', 'nium-wiki', 'scripts', 'index.js');
const versionJsonPath = path.join(__dirname, '..', 'skills', 'nium-wiki', 'scripts', 'version.json');

let content = fs.readFileSync(bundlePath, 'utf-8');

content = content.replace(/process\.env\.NIUM_WIKI_VERSION/g, JSON.stringify(version));
fs.writeFileSync(bundlePath, content, 'utf-8');
console.log(`inject-version: index.js -> ${version}`);

// Also update version.json for LLM to read
const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
if (versionJson.version !== version) {
  versionJson.version = version;
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionJson, null, 2) + '\n', 'utf-8');
  console.log(`inject-version: version.json -> ${version}`);
}
