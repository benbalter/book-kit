#!/usr/bin/env node

/**
 * Stage a print copy of the book's source for the PDF and Kindle builds.
 *
 * Print readers can't click, so links become footnotes (links-to-footnotes).
 * That rewrite runs on a copy, never on src/:
 *
 *   1. Copy paths.src to dist/.book-kit/print-src/.
 *   2. Convert links to footnotes there. With --link-footnote-urls (Kindle),
 *      each footnote's URL stays a tappable link.
 *   3. Write dist/.book-kit/print-index.yml: index.yml pointed at the copy,
 *      minus build.print_exclude files. Marker comments listed in
 *      build.print_inject become those files with --inject (PDF) and are
 *      dropped without it (Kindle).
 *
 * Usage: book-kit prep-print-src [--preserve-internal-links] [--link-footnote-urls] [--inject]
 * Prints the path of the generated index file.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, pathFor } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function printIndex(indexText, { srcRel, printRel, exclude = [], inject = {}, includeInjected = false }) {
  const srcPrefix = new RegExp(escapeRegExp(`${srcRel}/`), 'g');
  const lines = [];
  for (const line of indexText.split('\n')) {
    const marker = Object.keys(inject).find((m) => line.includes(m));
    if (marker) {
      if (includeInjected) lines.push(`  - ${printRel}/${inject[marker]}`);
      continue;
    }
    if (exclude.some((f) => line.includes(f.replace(/\.md$/, '')))) continue;
    lines.push(line.replace(srcPrefix, `${printRel}/`));
  }
  return lines.join('\n');
}

function main(argv) {
  const config = loadConfig();
  const preserveInternal = argv.includes('--preserve-internal-links');
  const includeInjected = argv.includes('--inject');
  const linkFootnoteUrls = argv.includes('--link-footnote-urls');

  const src = pathFor('src', config);
  const work = join(pathFor('dist', config), '.book-kit');
  const printSrc = join(work, 'print-src');
  rmSync(printSrc, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(src, printSrc, { recursive: true });

  const l2f = fileURLToPath(new URL('./links-to-footnotes.js', import.meta.url));
  execFileSync('node', [l2f, printSrc, '--no-backup', ...(preserveInternal ? ['--preserve-internal-links'] : []), ...(linkFootnoteUrls ? ['--link-footnote-urls'] : [])], {
    stdio: ['ignore', process.stderr, 'inherit'],
  });

  const indexOut = join(work, 'print-index.yml');
  const text = printIndex(readFileSync(pathFor('index', config), 'utf8'), {
    srcRel: relative(config.root, src),
    printRel: relative(config.root, printSrc),
    exclude: config.build.print_exclude,
    inject: config.build.print_inject,
    includeInjected,
  });
  writeFileSync(indexOut, text);
  console.log(indexOut);
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2));
}
