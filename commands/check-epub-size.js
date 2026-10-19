#!/usr/bin/env node

/**
 * EPUB size budget checker.
 * Fails CI if any EPUB exceeds its size threshold.
 *
 * Usage: book-kit check-epub-size [--ci]
 *   --ci: exit with non-zero code on budget violation (default: warn only)
 */

import { existsSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { loadConfig, outputFile } from '../lib/config.js';

const config = loadConfig();
const rootDir = config.root;
const ci = process.argv.includes('--ci');

// Size budget in bytes, from checks.epub_max_mb (MB = 1024 × 1024 bytes).
const budget = (config.checks?.epub_max_mb ?? 2) * 1024 * 1024;

// The retail EPUBs always; the advance reader copies when they've been built.
const budgets = Object.fromEntries(
  ['.epub', '-kindle.epub', '-arc.epub', '-kindle-arc.epub']
    .map((suffix) => outputFile(suffix, config))
    .filter((file, i) => i < 2 || existsSync(file))
    .map((file) => [relative(rootDir, file), budget]),
);

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

let violations = 0;

console.log('EPUB Size Budget Report');
console.log('═══════════════════════');

for (const [file, budget] of Object.entries(budgets)) {
  const path = `${rootDir}/${file}`;
  try {
    const { size } = statSync(path);
    const pct = ((size / budget) * 100).toFixed(1);
    const status = size > budget ? '❌ OVER' : size > budget * 0.9 ? '⚠️  WARN' : '✅ OK';

    console.log(`\n${file}:`);
    console.log(`  Size:   ${formatSize(size)}`);
    console.log(`  Budget: ${formatSize(budget)}`);
    console.log(`  Usage:  ${pct}%  ${status}`);

    if (size > budget) {
      violations++;
      console.log(`  → Exceeds budget by ${formatSize(size - budget)}`);
    }
  } catch {
    console.log(`\n${file}: not found (skipped)`);
  }
}

console.log('\n───────────────────────');
if (violations > 0) {
  console.log(`${violations} file(s) exceeded their size budget.`);
  if (ci) process.exit(1);
} else {
  console.log('All files within budget.');
}
