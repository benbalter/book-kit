#!/usr/bin/env node

/**
 * Lock the print PDF's page count to a known value so it can't drift, and
 * check its page size against print.trim.
 *
 * The page count is load-bearing launch metadata: it drives the print spine
 * width (and therefore the cover wrap), the page-count tier that sets the
 * gutter margin, and the figure the designer and distributors are given. A
 * silent change to chapter length, CSS, or fonts can shift it by a page or
 * two — enough to make a pre-cut spine wrong. This gate fails loudly when the
 * built PDF no longer matches EXPECTED_PAGE_COUNT.
 *
 * Usage:
 *   book-kit check-pdf-page-count [path-to-pdf]
 *
 * Defaults to the print PDF (outputFile('.pdf')). The PDF/X file is the same
 * interior, so it shares the same expected count.
 *
 * To change the locked value INTENTIONALLY (e.g. after deliberate content
 * changes), update print.page_count in book.config.yml, then recut the cover
 * spine and update the page count wherever the book is listed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig, outputFile } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';

const __filename = fileURLToPath(import.meta.url);

// The locked page count for the print interior (`print.page_count` in
// book.config.yml; null disables the check).
//
// Lock it once the book is final: the page count drives the cover spine width,
// the gutter-margin tier, and distributor metadata, so a silent drift (a
// pandoc or WeasyPrint upgrade, a hyphenation change, a cascade reorder) can
// invalidate a print cover. Pandoc's version is the dominant lever on
// pagination, which is why toolchain.json pins it. Perfect-bound interiors
// must have an even page count.
export function expectedPageCount(config = loadConfig()) {
  return config.print.page_count ?? null;
}

/**
 * Count pages in a PDF without any external dependency.
 *
 * Counts page objects (`/Type /Page`, excluding the `/Pages` tree node) in the
 * raw PDF. This matches pdfinfo/qpdf for the WeasyPrint-generated output, which
 * writes uncompressed page objects. If a future toolchain change emits an
 * object-stream / compressed-xref PDF, the page objects would be hidden inside
 * compressed streams and this count would collapse — so we throw rather than
 * silently report 0, pointing at the likely cause.
 *
 * @param {string} pdfPath absolute or relative path to the PDF
 * @returns {number} page count
 */
export function countPdfPages(pdfPath) {
  const raw = readFileSync(pdfPath, 'latin1');
  // `/Type /Page` but not `/Type /Pages` (the page-tree root). The trailing
  // \b after "Page" fails when followed by "s" (both word chars), so `/Pages`
  // is excluded; it matches when "Page" is followed by /, whitespace, etc.
  const pages = (raw.match(/\/Type\s*\/Page\b/g) || []).length;

  if (pages === 0) {
    throw new Error(
      `Counted 0 pages in ${pdfPath}. The PDF may now use object streams / ` +
        `a compressed cross-reference table, hiding page objects from this ` +
        `text-based counter. Update countPdfPages() (e.g. use pdfinfo/qpdf).`
    );
  }

  return pages;
}

/**
 * Every distinct page size in a PDF, in points, from its `/MediaBox` entries
 * (same uncompressed-object caveat as countPdfPages).
 *
 * @param {string} pdfPath
 * @returns {Array<[number, number]>} [width, height] pairs
 */
export function pdfPageSizes(pdfPath) {
  const raw = readFileSync(pdfPath, 'latin1');
  const sizes = new Map();
  for (const [, box] of raw.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)) {
    const [x0, y0, x1, y1] = box.trim().split(/\s+/).map(Number);
    const size = [Math.abs(x1 - x0), Math.abs(y1 - y0)];
    sizes.set(size.join('x'), size);
  }
  return [...sizes.values()];
}

/**
 * Page sizes that don't match print.trim (inches; a PDF point is 1/72 in).
 * print.trim is what the book tells printers and retailers; the CSS @page
 * size is what WeasyPrint actually lays out, so a mismatch between the two
 * would ship a wrong-sized interior.
 *
 * @returns {string[]} one message per mismatched size; empty when they agree
 */
export function trimMismatches(sizes, trim) {
  if (!Array.isArray(trim) || trim.length !== 2) return [];
  const [w, h] = trim.map((inches) => inches * 72);
  const near = (a, b) => Math.abs(a - b) < 1;
  return sizes
    .filter(([pw, ph]) => !(near(pw, w) && near(ph, h)))
    .map(([pw, ph]) => `${+(pw / 72).toFixed(3)}×${+(ph / 72).toFixed(3)} in`);
}

/** CLI entry point. */
function main() {
  const arg = process.argv[2];
  const pdfPath = arg ? resolve(arg) : outputFile('.pdf');
  const EXPECTED_PAGE_COUNT = expectedPageCount();

  if (!existsSync(pdfPath)) {
    console.error(`❌ PDF not found: ${pdfPath}`);
    console.error('   Build it first (e.g. `just pdf`), then re-run this check.');
    process.exit(1);
  }

  const actual = countPdfPages(pdfPath);

  const trim = loadConfig().print.trim;
  const wrongSizes = trimMismatches(pdfPageSizes(pdfPath), trim);
  if (wrongSizes.length > 0) {
    console.error(`❌ Page size mismatch: ${pdfPath} has ${wrongSizes.join(', ')} pages; print.trim is ${trim[0]}×${trim[1]} in.`);
    console.error('   Make the @page size in the book\'s CSS match print.trim (or fix print.trim).');
    process.exit(1);
  }

  if (EXPECTED_PAGE_COUNT === null) {
    console.log(`ℹ️  ${pdfPath}: ${actual} pages (no lock; set print.page_count in book.config.yml to lock it).`);
    return;
  }

  if (actual !== EXPECTED_PAGE_COUNT) {
    console.error(
      `❌ Page count drift: ${pdfPath} has ${actual} pages, expected ${EXPECTED_PAGE_COUNT}.`
    );
    console.error(
      '   The print page count is locked because it drives the spine width,'
    );
    console.error(
      '   gutter-margin tier, and distributor metadata. If this change is'
    );
    console.error(
      '   intentional, update print.page_count in book.config.yml,'
    );
    console.error('   then recut the cover spine and refresh the metadata to match.');
    process.exit(1);
  }

  console.log(`✅ ${pdfPath}: ${actual} pages (matches locked value ${EXPECTED_PAGE_COUNT}).`);
}

// Run as CLI only when invoked directly, not when imported by tests.
if (isMain(import.meta.url)) {
  main();
}
