#!/usr/bin/env node

/**
 * Move the print front matter (copyright page + dedication) ahead of the
 * auto-generated table of contents.
 *
 * Why: copyright.md and dedication.md are the first `input-files` in
 * index.yml, so pandoc renders them as the first body content — which lands
 * *after* the template's auto-inserted TOC. That order (Title → TOC →
 * Copyright → Dedication → body) is nonstandard for a printed book, where the
 * copyright page belongs on the verso of the title page, before the TOC.
 *
 * The TOC is emitted by pandoc's template at a fixed position before `$body$`,
 * so it can't be repositioned in Markdown. Instead, the `pdf` recipe renders
 * standalone HTML, runs this script to splice the two front-matter blocks in
 * front of the `<nav id="TOC">`, then hands the HTML to WeasyPrint — which
 * recomputes the TOC page numbers against the new order.
 *
 * Print-only: the EPUB/Kindle builds (nav-first, by convention) are untouched.
 *
 * Usage: book-kit reorder-print-frontmatter <file.html>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: book-kit reorder-print-frontmatter <file.html>');
  process.exit(1);
}

/**
 * Extract a balanced <div>…</div> block starting at the open tag that matches
 * `needle`. Counts nested <div> opens/closes so inner containers don't end the
 * match early.
 * @param {string} html
 * @param {string} needle - literal start of the opening tag, e.g. '<div id="copyright-page"'
 * @returns {string|null} the full block, including its opening and closing
 *   tags, or null when the book has no such block
 */
function extractBalancedDiv(html, needle) {
  const start = html.indexOf(needle);
  if (start === -1) return null;

  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tag.exec(html)) !== null) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  throw new Error(`Unbalanced <div> for anchor: ${needle}`);
}

let html = readFileSync(file, 'utf8');

// Either page is optional: a book without a dedication (or a copyright page)
// just has less to move.
const blocks = [
  ['copyright page', extractBalancedDiv(html, '<div id="copyright-page"')],
  ['dedication', extractBalancedDiv(html, '<div class="dedication"')],
].filter(([, block]) => block !== null);

if (blocks.length === 0) {
  console.log('No copyright page or dedication to move ahead of the table of contents.');
  process.exit(0);
}

const tocAnchor = '<nav id="TOC"';
if (!html.includes(tocAnchor)) throw new Error(`Anchor not found: ${tocAnchor}`);

// Remove the blocks from their current (post-TOC) position…
for (const [, block] of blocks) html = html.replace(block, '');
// …and re-insert them, in reading order, immediately before the TOC.
html = html.replace(tocAnchor, `${blocks.map(([, block]) => block).join('\n')}\n${tocAnchor}`);

writeFileSync(file, html);
console.log(`Moved ${blocks.map(([name]) => name).join(' and ')} ahead of the table of contents.`);
