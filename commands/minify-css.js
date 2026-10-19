#!/usr/bin/env node

/**
 * Minify CSS files using cssnano.
 * Runs AFTER strip-page-rules.js so variable resolution isn't disrupted.
 *
 * Usage: book-kit minify-css [file1.css] [file2.css] ...
 *   If no files given, minifies dist/style-epub.css and dist/style-kindle.css
 */

import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';
import cssnano from 'cssnano';

const files = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['dist/style-epub.css', 'dist/style-kindle.css'];

const processor = postcss([
  cssnano({ preset: ['default', { discardComments: { removeAll: true } }] })
]);

let totalSaved = 0;

for (const file of files) {
  try {
    const input = readFileSync(file, 'utf8');
    const result = await processor.process(input, { from: file, to: file });
    writeFileSync(file, result.css);
    const saved = input.length - result.css.length;
    totalSaved += saved;
    const pct = ((saved / input.length) * 100).toFixed(1);
    console.log(`  ${file}: ${input.length} → ${result.css.length} bytes (−${pct}%)`);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log(`  ${file}: skipped (not found)`);
    } else {
      throw e;
    }
  }
}

console.log(`Minified ${files.length} files, saved ${totalSaved} bytes total`);
