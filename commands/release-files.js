#!/usr/bin/env node

/**
 * Stage a release: copy the built formats to version-named files and write
 * their checksums.
 *
 * Downloads all named book.epub look alike, so a stale one is easy to upload
 * by mistake. The copies carry the version, e.g. dist/release/book-v1.2.0.epub
 * and book-kindle-v1.2.0.epub, beside a sha256sum-compatible checksums.txt.
 * dist/ keeps its plain names for local builds and scripts.
 *
 * The version comes from paths.version, the same file the build stamps on the
 * copyright page. Pass the release tag with --tag and a tag that disagrees
 * with it fails, so a file can't be named for one version and stamped with
 * another.
 *
 * Usage: book-kit release-files [--tag vX.Y.Z] [--out DIR]
 * Prints the output directory.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import { loadConfig, outputFile, pathFor } from '../lib/config.js';
import { readVersion } from '../lib/revision.js';
import { isMain } from '../lib/is-main.js';

// The retail formats, in the order checksums.txt lists them. A book that
// doesn't build one (no Kindle, no PDF/X) just ships the rest.
export function releaseSources(config) {
  return [
    outputFile('.epub', config),
    outputFile('-kindle.epub', config),
    outputFile('.pdf', config),
    outputFile(`${config.output.pdfx_suffix}.pdf`, config),
  ];
}

// book-kindle.epub + v1.2.0 -> book-kindle-v1.2.0.epub
export function versionedName(file, label) {
  const ext = extname(file);
  return `${basename(file, ext)}-${label}${ext}`;
}

export function stageRelease({ config = loadConfig(), tag, out } = {}) {
  const versionFile = pathFor('version', config);
  if (!existsSync(versionFile)) {
    throw new Error(`no ${versionFile}: a release needs the version the build stamps`);
  }
  const label = `v${readVersion(versionFile)}`;
  if (tag && tag !== label) {
    throw new Error(`tag ${tag} doesn't match ${basename(versionFile)} (${label}); bump it in the tagged commit`);
  }

  const sources = releaseSources(config).filter((f) => existsSync(f));
  if (sources.length === 0) throw new Error('nothing to release: build the formats first');

  const dir = out ? resolve(config.root, out) : join(pathFor('dist', config), 'release');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const lines = sources.map((src) => {
    const name = versionedName(src, label);
    copyFileSync(src, join(dir, name));
    const hash = createHash('sha256').update(readFileSync(src)).digest('hex');
    return `${hash}  ${name}`;
  });
  writeFileSync(join(dir, 'checksums.txt'), `${lines.join('\n')}\n`);
  return { dir, label, files: lines.map((l) => l.split('  ')[1]) };
}

function main(argv) {
  const opt = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  try {
    const { dir, files } = stageRelease({ tag: opt('--tag') || undefined, out: opt('--out') });
    for (const f of files) console.error(`  ${f}`);
    console.log(dir);
  } catch (e) {
    console.error(`book-kit release-files: ${e.message}`);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2));
}
