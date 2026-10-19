#!/usr/bin/env node

// book-kit markdownlint [markdownlint-cli2 options] [globs]
//
// Markdown lint with markdownlint-cli2 and the book's resolved config
// (lib/lint.js): the kit's base config with lint.markdownlint merged in.
// Globs default to every chapter in paths.src.

import { spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/config.js';
import { namesFiles, prepareMarkdownlint } from '../lib/lint.js';

const config = loadConfig();
const configFile = prepareMarkdownlint(config);

// Arguments pass through in order; the chapters glob is added only when none names files.
const args = process.argv.slice(2);

const result = spawnSync(
  'npx',
  ['markdownlint-cli2', '--config', configFile, ...(namesFiles(args, config.root) ? [] : [`${config.paths.src}/*.md`]), ...args],
  { stdio: 'inherit', cwd: config.root },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
