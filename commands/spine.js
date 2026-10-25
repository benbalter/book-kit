#!/usr/bin/env node

/**
 * Print the cover spine width and full wrap size for each printer.
 *
 * A paperback cover is one sheet: back, spine, and front, plus bleed. The
 * spine is the page count times the paper's thickness per page (its
 * caliper), which differs by printer even for "white" paper, so a wrap cut
 * for one printer is wrong for another.
 *
 * Usage:
 *   book-kit spine [--pages N] [--paper white|cream|standard-color|premium-color]
 *                  [--caliper printer=inches-per-page ...] [--json]
 *
 * Pages come from --pages, then print.page_count, then the built print PDF.
 * KDP's figures are published; add other printers under print.caliper in
 * book.config.yml (or with --caliper), using the figure their own cover
 * template gives, since that template is what the cover is checked against.
 */

import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig, outputFile } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';
import { countPdfPages } from './check-pdf-page-count.js';

// KDP paper thickness, inches per page, from "Paperback cover templates and
// calculator": https://kdp.amazon.com/en_US/help/topic/G201953020
export const KDP_CALIPER = {
  white: 0.002252,
  cream: 0.0025,
  'standard-color': 0.002252,
  'premium-color': 0.002347,
};

// Bleed added to the top, bottom, and outside edges of the wrap (same page).
export const BLEED = 0.125;
// KDP wants at least this much space between spine text and each spine edge.
export const SPINE_TEXT_MARGIN = 0.0625;
// KDP allows spine text on books with more than 79 pages.
export const KDP_SPINE_TEXT_MIN_PAGES = 80;
export const DPI = 300;

const round = (inches) => +inches.toFixed(4);

/**
 * Spine and wrap dimensions for one printer.
 *
 * @param {{pages: number, trim: [number, number], caliper: number, bleed?: number}} options
 */
export function wrap({ pages, trim, caliper, bleed = BLEED }) {
  const [trimWidth, trimHeight] = trim;
  const spine = pages * caliper;
  const width = bleed + trimWidth + spine + trimWidth + bleed;
  const height = bleed + trimHeight + bleed;
  return {
    pages,
    caliper,
    spine: round(spine),
    spineTextWidth: round(Math.max(0, spine - 2 * SPINE_TEXT_MARGIN)),
    width: round(width),
    height: round(height),
    pixels: [Math.ceil(width * DPI), Math.ceil(height * DPI)],
  };
}

/**
 * Printers to report: KDP for the chosen paper, then each print.caliper entry
 * (which can also replace KDP's figure).
 *
 * @returns {Record<string, number>} printer name to inches per page
 */
export function calipers(paper, extra = {}) {
  if (!(paper in KDP_CALIPER)) {
    throw new Error(`unknown paper "${paper}"; use one of ${Object.keys(KDP_CALIPER).join(', ')}`);
  }
  const out = { kdp: KDP_CALIPER[paper], ...extra };
  for (const [printer, value] of Object.entries(out)) {
    if (typeof value !== 'number' || !(value > 0)) {
      throw new Error(`caliper for ${printer} must be a positive number of inches per page, got ${JSON.stringify(value)}`);
    }
  }
  return out;
}

/** Parse repeated `--caliper printer=0.002` flags into a map. */
export function parseCalipers(values = []) {
  return Object.fromEntries(
    values.map((pair) => {
      const [printer, inches] = pair.split('=');
      if (!printer || inches === undefined) throw new Error(`--caliper expects printer=inches, got "${pair}"`);
      return [printer, Number(inches)];
    }),
  );
}

function pageCount(flag, config) {
  if (flag !== undefined) {
    const pages = Number(flag);
    if (!Number.isInteger(pages) || pages <= 0) throw new Error(`--pages must be a positive whole number, got "${flag}"`);
    return { pages, source: '--pages' };
  }
  if (config.print.page_count) return { pages: config.print.page_count, source: 'print.page_count' };
  const pdf = outputFile('.pdf', config);
  if (existsSync(pdf)) return { pages: countPdfPages(pdf), source: pdf };
  throw new Error('no page count: pass --pages, set print.page_count in book.config.yml, or build the PDF (`just pdf`)');
}

function main() {
  const { values } = parseArgs({
    options: {
      pages: { type: 'string' },
      paper: { type: 'string' },
      caliper: { type: 'string', multiple: true },
      json: { type: 'boolean' },
    },
  });
  const config = loadConfig();
  const { pages, source } = pageCount(values.pages, config);
  const paper = values.paper ?? config.print.paper;
  const printers = calipers(paper, { ...config.print.caliper, ...parseCalipers(values.caliper) });
  const trim = config.print.trim;
  const results = Object.fromEntries(
    Object.entries(printers).map(([printer, caliper]) => [printer, wrap({ pages, trim, caliper })]),
  );

  if (values.json) {
    console.log(JSON.stringify({ pages, trim, paper, bleed: BLEED, dpi: DPI, printers: results }, null, 2));
    return;
  }

  console.log(`${pages} pages (from ${source}), ${trim[0]}×${trim[1]} in trim, ${paper} paper, ${BLEED} in bleed`);
  if (pages % 2 !== 0) {
    console.log(`⚠️  ${pages} is odd. Perfect-bound interiors need an even count; the printer will add a blank page.`);
  }
  for (const [printer, r] of Object.entries(results)) {
    console.log(`\n${printer} (${r.caliper} in/page)`);
    console.log(`  spine:  ${r.spine} in`);
    console.log(`  wrap:   ${r.width} × ${r.height} in (${r.pixels[0]} × ${r.pixels[1]} px at ${DPI} dpi)`);
    console.log(`  spine text: ${r.spineTextWidth} in wide after ${SPINE_TEXT_MARGIN} in margins`);
  }
  if (pages < KDP_SPINE_TEXT_MIN_PAGES) {
    console.log(`\n⚠️  KDP allows spine text only from ${KDP_SPINE_TEXT_MIN_PAGES} pages; leave this spine blank there.`);
  }
  console.log('\nCheck the final cover against each printer\'s own template before uploading.');
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`book-kit spine: ${error.message}`);
    process.exit(2);
  }
}
