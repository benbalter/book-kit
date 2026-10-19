#!/usr/bin/env node

/**
 * Strip CSS `@property` at-rules from the inlined stylesheet of the print HTML
 * before it reaches WeasyPrint.
 *
 * Why: Tailwind v4 emits many `@property --tw-*` declarations (the CSS
 * Properties and Values API) to type its utility custom properties. WeasyPrint
 * doesn't implement that API, so it logs a `WARNING: Unknown rule <AtRule
 * @property …>` for every one — hundreds of lines that bury any real warning.
 * The rules only add type/inheritance/default metadata to custom properties;
 * the properties still resolve as plain `var()` values without them, and the
 * static print output doesn't depend on that metadata. Removing them is purely
 * cosmetic for the rendered PDF and clears the log noise.
 *
 * Print-only: runs against the standalone print HTML in the `pdf` recipe. The
 * HTML build keeps `@property` (browsers support it); the EPUB/Kindle builds
 * already drop it via strip-page-rules.js.
 *
 * `@property` bodies contain only declarations (no nested rules), so the blocks
 * are flat — but this still brace-counts to stay correct if that ever changes.
 *
 * Usage: book-kit strip-property-rules <file.html>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: book-kit strip-property-rules <file.html>');
  process.exit(1);
}

/**
 * Remove every `@property …{ … }` block from a CSS string, counting braces so
 * the match ends at the rule's own closing brace.
 * @param {string} css
 * @returns {{ css: string, removed: number }}
 */
function stripPropertyRules(css) {
  let out = '';
  let removed = 0;
  let i = 0;

  while (i < css.length) {
    const at = css.indexOf('@property', i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }

    // Copy everything up to the at-rule, then find its opening brace.
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) {
      // Malformed/truncated rule — keep the rest verbatim and stop.
      out += css.slice(at);
      break;
    }

    // Walk to the matching close brace.
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }

    removed++;
    i = j + 1; // resume after the closing brace, dropping the block
  }

  return { css: out, removed };
}

const html = readFileSync(file, 'utf8');

// Operate only on inlined <style> blocks (pandoc's embed-resources output).
let total = 0;
const updated = html.replace(
  /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
  (_match, openTag, body, closeTag) => {
    const { css, removed } = stripPropertyRules(body);
    total += removed;
    return openTag + css + closeTag;
  },
);

if (total > 0) {
  writeFileSync(file, updated);
}

console.log(`Stripped ${total} @property rule(s) from ${file}`);
