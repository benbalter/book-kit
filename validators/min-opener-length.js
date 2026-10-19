import fs from 'node:fs';
import { isNonChapter } from '../lib/structure.js';
import { config, getIndexFiles, isExcluded, optionsFor } from '../lib/validate.js';

const defaults = {
  // Minimum words in the first two paragraphs after the TL;DR, combined.
  min_words: 60,
};

/**
 * Validate that every production chapter's opening (first two paragraphs
 * after the TL;DR block, combined) is at least `min_words` (60) words. Short punchy
 * hook-then-context patterns are fine — what we're guarding against is
 * accidentally truncated or skeletal openers.
 * @param {string[]} [chapters] - Files listed in index.yml (read from it by default)
 * @param {{min_words?: number}} [options]
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateMinOpenerLength(chapters = getIndexFiles(), options = optionsFor('min-opener-length', defaults)) {
  const errors = [];
  const warnings = [];
  const MIN_WORDS = options.min_words;

  for (const file of chapters) {
    if (!fs.existsSync(file)) continue;
    if (isExcluded(file)) continue;
    // Skip key-takeaway aggregator chapters (they're all-takeaways, no prose).
    // Skip structural pages, takeaways collections, and drafts: not narrative.
    if (isNonChapter(file, config)) continue;

    const content = fs.readFileSync(file, 'utf8');
    // Find the end of the TL;DR block (if any) and then the first two non-blank
    // prose paragraphs after it.
    const tldrEnd = content.search(/^:::\s*$/m);
    let rest;
    if (tldrEnd !== -1 && /:::\s*\{\.tldr/m.test(content.slice(0, tldrEnd))) {
      rest = content.slice(tldrEnd).replace(/^:::\s*$/m, '').trimStart();
    } else {
      // No TL;DR: use the whole body below the first heading.
      const afterHeading = content.replace(/^#+[^\n]*\n/m, '');
      rest = afterHeading.trimStart();
    }

    const isProse = (t) => {
      if (!t) return false;
      if (/^#/.test(t)) return false;
      if (/^:::/.test(t)) return false;
      if (/^```/.test(t)) return false;
      if (/^\|/.test(t)) return false;
      if (/^[-*+]\s/.test(t)) return false;
      // HTML linter-control comments (<!-- vale ... -->, <!-- textlint-... -->)
      // sit between paragraphs but aren't prose — don't let them occupy an
      // opener slot and crowd out the real hook.
      if (/^<!--/.test(t)) return false;
      // A leading blockquote is a valid hook device (e.g. a quoted email the
      // chapter then reacts to), so it counts as opener content — see the word
      // cleanup below, which strips the `>` markers before counting.
      return true;
    };

    const paragraphs = rest.split(/\n{2,}/).map((p) => p.trim()).filter(isProse);
    const opener = paragraphs.slice(0, 2).join(' ');
    if (!opener) continue;

    const words = opener
      .replace(/\[[^\]]*\]\([^)]*\)/g, '$1') // strip link URLs
      .replace(/^\s*>\s?/gm, '') // strip blockquote markers
      .replace(/[*_`]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length < MIN_WORDS) {
      warnings.push(
        `${file}: first two post-TL;DR paragraphs total only ${words.length} words ` +
        `(minimum ${MIN_WORDS}). Chapter may have a truncated or skeletal opener.`
      );
    }
  }

  return { errors, warnings };
}

export default {
  name: 'min-opener-length',
  tags: ['style'],
  defaults,
  run: (ctx) => validateMinOpenerLength(ctx.indexFiles, ctx.options),
};
