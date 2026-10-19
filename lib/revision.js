// The build stamp: "<semver> (<short sha>)", e.g. "1.2.0 (0123abcd)".
//
// It's passed to pandoc as the `date` metadata and filled into any
// [...]{.revision} span by filters/revision.lua, so builds never rewrite
// tracked files. $BOOK_KIT_REVISION overrides it (reproducible parity builds).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathFor, loadConfig } from './config.js';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DEFAULT_VERSION = '0.1.0';

export function readVersion(path) {
  if (!existsSync(path)) return DEFAULT_VERSION;
  const raw = readFileSync(path, 'utf8').trim();
  if (!SEMVER.test(raw)) {
    console.warn(`Warning: ${path} holds "${raw}", which isn't semver; using ${DEFAULT_VERSION}`);
    return DEFAULT_VERSION;
  }
  return raw;
}

export function gitSha(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

export function revision(config = loadConfig()) {
  if (process.env.BOOK_KIT_REVISION) return process.env.BOOK_KIT_REVISION;
  return `${readVersion(pathFor('version', config))} (${gitSha(config.root)})`;
}
