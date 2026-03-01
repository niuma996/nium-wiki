#!/usr/bin/env node
/**
 * Nium-Wiki Server 入口 / Server Entry Point
 * 提供 serve 子命令 / Provides serve subcommand
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { getVersion } from './utils/version';
import { startServer } from './serve-impl';

const program = new Command();

program
  .name('nium-wiki')
  .description('Nium-Wiki documentation server')
  .version(getVersion());

program
  .command('serve', { isDefault: true })
  .description('Start docsify documentation server to read Wiki in browser')
  .argument('[wiki-path]', '.nium-wiki directory path', '.nium-wiki')
  .option('-p, --port <port>', 'Server port number', '4000')
  .option('-n, --name <name>', 'Project name (used for page title)')
  .action((wikiPath: string, opts: { port: string; name?: string }) => {
    const port = parseInt(opts.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`❌ Invalid port number: ${opts.port}`);
      process.exitCode = 1;
      return;
    }

    const resolved = path.resolve(wikiPath);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Path does not exist: ${resolved}`);
      process.exitCode = 1;
      return;
    }
    startServer(resolved, port, opts.name);
  });

program.parse();
