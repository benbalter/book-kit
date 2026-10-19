#!/usr/bin/env node
// book-kit: build and quality tooling for Markdown books.
//
//   book-kit config [key]        print the resolved config (or one dotted key)
//   book-kit config --sources [key]  show which layer (kit, preset, book) set each key
//   book-kit prepare <format>    write dist/.book-kit/{config.json,pandoc-<format>.yml}
//   book-kit revision            print the build stamp, "<version> (<sha>)"
//   book-kit kit-path [sub]      print the kit's install directory (for justfiles)
//   book-kit <command> [args]    run a kit command from commands/ (see `book-kit help`)
//
// Commands run from the book root (the nearest book.config.yml) with BOOK_ROOT
// and BOOK_KIT_ROOT set, so they work from any subdirectory. Relative path
// arguments resolve against the book root, not the caller's directory.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { extname } from 'node:path';
import { configSources, findBookRoot, get, kitPath, loadConfig, writeConfigJson } from '../lib/config.js';
import { revision } from '../lib/revision.js';
import { writePandocDefaults } from '../lib/pandoc.js';

const RUNNERS = { '.js': 'node', '.mjs': 'node', '.py': 'python3', '.sh': 'bash' };

function commands() {
  return readdirSync(kitPath('commands'))
    // Files starting with "_" are helpers the commands import, not commands.
    .filter((f) => RUNNERS[extname(f)] && !f.startsWith('_'))
    .map((f) => f.slice(0, -extname(f).length))
    .sort();
}

function findCommand(name) {
  if (name.startsWith('_')) return null;
  for (const ext of Object.keys(RUNNERS)) {
    const file = kitPath('commands', `${name}${ext}`);
    if (existsSync(file)) return { file, runner: RUNNERS[ext] };
  }
  return null;
}

function print(value) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

// A usage or config mistake, reported as one line rather than a stack trace.
class UsageError extends Error {}

const [name, ...args] = process.argv.slice(2);

function run() {
  switch (name) {
    case undefined:
    case 'help':
    case '--help':
      console.log('Usage: book-kit <command> [args]\n\nBuilt-ins: config, prepare, revision, kit-path\nCommands:  ' + commands().join(', '));
      break;
    case 'config': {
      if (args[0] === '--sources') {
        // Which layer (kit defaults, a preset, the book) set each key.
        const prefix = args[1];
        const entries = Object.entries(configSources()).filter(
          ([key]) => !prefix || key === prefix || key.startsWith(`${prefix}.`),
        );
        if (prefix && entries.length === 0) throw new UsageError(`unknown config key "${prefix}"`);
        const width = Math.max(...entries.map(([key]) => key.length));
        for (const [key, source] of entries) console.log(`${key.padEnd(width)}  ${source}`);
        break;
      }
      const value = args[0] ? get(loadConfig(), args[0]) : loadConfig();
      if (value === undefined) throw new UsageError(`unknown config key "${args[0]}"`);
      print(value);
      break;
    }
    case 'prepare': {
      if (!args[0]) throw new UsageError('usage: book-kit prepare <html|pdf|epub|kindle|docx>');
      const config = loadConfig();
      writeConfigJson(config);
      console.log(writePandocDefaults(args[0], config));
      break;
    }
    case 'revision':
      print(revision());
      break;
    case 'kit-path':
      print(kitPath(...args));
      break;
    default: {
      const cmd = findCommand(name);
      if (!cmd) {
        console.error(`book-kit: unknown command "${name}". Run \`book-kit help\` for the list.`);
        process.exit(2);
      }
      // Commands run from the book root, so their relative defaults (dist/...) resolve.
      const root = findBookRoot();
      const env = { ...process.env, BOOK_ROOT: root, BOOK_KIT_ROOT: kitPath() };
      const result = spawnSync(cmd.runner, [cmd.file, ...args], { stdio: 'inherit', env, cwd: root });
      if (result.error?.code === 'ENOENT') throw new UsageError(`${cmd.runner} not found (needed by ${name})`);
      if (result.error) throw result.error;
      // Pass a signal on (Ctrl-C, a CI timeout) rather than reporting a bare exit 1.
      if (result.signal) process.kill(process.pid, result.signal);
      process.exit(result.status ?? 1);
    }
  }
}

try {
  run();
} catch (error) {
  // Expected failures (no book.config.yml, a bad key or argument, a bad
  // `extends`, a missing runner) get one line; anything else keeps its stack
  // for debugging.
  const known = error instanceof UsageError || /book\.config\.yml|in extends/.test(error.message);
  console.error(known ? `book-kit: ${error.message}` : error);
  process.exit(2);
}
