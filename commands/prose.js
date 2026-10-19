#!/usr/bin/env node

// book-kit prose [textlint options] [files]
//
// Prose lint with textlint and the book's resolved config (lib/lint.js): the
// kit's base rules, lint.textlint, and the kit and preset rules lint.rules
// turns on. Files default to every chapter in paths.src. On GitHub Actions,
// findings are reported as annotations on each file and line.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath, loadConfig } from '../lib/config.js';
import { namesFiles, prepareTextlint } from '../lib/lint.js';

const config = loadConfig();
const { config: textlintrc, rulesdir } = prepareTextlint(config);

// Arguments pass through in order; chapters are added only when none names files.
const args = process.argv.slice(2);
const chapters = () =>
  readdirSync(join(config.root, config.paths.src))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(config.paths.src, f));

const format =
  process.env.GITHUB_ACTIONS === 'true' && !args.some((o) => o.startsWith('--format') || o === '-f')
    ? ['--format', kitPath('lib', 'textlint-github-formatter.js')]
    : [];

const result = spawnSync(
  'npx',
  ['textlint', '--config', textlintrc, '--rulesdir', rulesdir, ...format, ...args, ...(namesFiles(args, config.root) ? [] : chapters())],
  { stdio: 'inherit', cwd: config.root },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
