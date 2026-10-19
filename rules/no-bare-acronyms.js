/**
 * textlint rule: no-bare-acronyms
 *
 * Detects acronyms not wrapped in `[ACRONYM]{.smallcaps}` formatting.
 * In the business-nonfiction house style, acronyms from a known list (plus
 * lint.acronyms) are written as pandoc smallcaps spans. For plurals, the "s" goes outside the span:
 *   `[API]{.smallcaps}s`
 *
 * Catches:
 *   - Bare acronyms: `API` → `[API]{.smallcaps}`
 *   - Bare plural acronyms: `APIs` → `[API]{.smallcaps}s`
 *
 * Skips acronyms inside:
 *   - Code spans (backticks)
 *   - Already-formatted smallcaps spans `[...]{.smallcaps}`
 *   - URLs and link targets
 *   - Pandoc div/span attributes `{.class ...}`
 *   - Image alt text `![...](...)` and link definitions
 */

import { smallcapsAcronyms } from '../lib/acronyms.js';
import { loadConfigOrDefaults } from '../lib/config.js';

// Known acronyms (base forms, no trailing "s"): the kit's list shared with
// `book-kit validate` (lib/acronyms.js) plus the book's lint.acronyms.
const BASE_ACRONYMS = new Set(smallcapsAcronyms(loadConfigOrDefaults()));

// Acronyms that can appear with a plural "s" suffix
const PLURALIZABLE = new Set([
  'API', 'URL', 'PR', 'GIF', 'IC', 'DM', 'PM', 'VP', 'RFC', 'ADR', 'OKR'
]);

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build a single regex that matches any known acronym (optionally plural)
// sorted longest-first so e.g. HTTPS matches before HTTP
const sortedAcronyms = [...BASE_ACRONYMS].sort((a, b) => b.length - a.length);
const acronymPattern = new RegExp(
  '(?<![\\[\\w])(' + sortedAcronyms.map(escapeRegExp).join('|') + ')(s)?(?![\\w\\]{}])',
  'g'
);

/**
 * Replace regions that should be ignored with equal-length whitespace,
 * preserving character offsets for accurate error reporting.
 */
function maskIgnoredRegions(text) {
  const blank = (m) => ' '.repeat(m.length);

  return text
    // Already-formatted smallcaps: [ACRONYM]{.smallcaps} or [ACRONYM]{.smallcaps}s
    .replace(/\[[^\]]*\]\{\.smallcaps\}s?/g, blank)
    // Inline code spans
    .replace(/`[^`]+`/g, blank)
    // Image alt text and full image syntax: ![alt](url)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, blank)
    // Link targets (the URL part): [text](url) — blank only the (url)
    .replace(/\]\([^)]*\)/g, blank)
    // Autolinks: <http...>
    .replace(/<https?:\/\/[^>]+>/g, blank)
    // Bare URLs: http://... or https://...
    .replace(/https?:\/\/[^\s)>]+/g, blank)
    // Pandoc attributes: {.class ...} or {custom-style="..."}
    .replace(/\{[^}]*\}/g, blank);
}

/**
 * @param {import("@textlint/types").TextlintRuleContext} context
 * @param {Object} options
 * @param {string[]} [options.allow] - Acronyms to skip
 */
function reporter(context, options = {}) {
  const { Syntax, getSource, report, RuleError, fixer } = context;
  const allow = new Set(options.allow || []);

  return {
    [Syntax.Paragraph](node) {
      const text = getSource(node);
      const masked = maskIgnoredRegions(text);

      acronymPattern.lastIndex = 0;
      let match;

      while ((match = acronymPattern.exec(masked)) !== null) {
        const fullMatch = match[0];
        const base = match[1];
        const plural = match[2]; // "s" or undefined

        // Skip allowed acronyms
        if (allow.has(base)) {
          continue;
        }

        // If plural "s" found but this acronym isn't pluralizable, skip
        // (could be a false positive)
        if (plural && !PLURALIZABLE.has(base)) {
          continue;
        }

        const index = match.index;
        const replacement = plural
          ? `[${base}]{.smallcaps}s`
          : `[${base}]{.smallcaps}`;

        const message = plural
          ? `"${fullMatch}" should use smallcaps: ${replacement}`
          : `"${base}" should use smallcaps: ${replacement}`;

        report(
          node,
          new RuleError(message, {
            index,
            fix: fixer.replaceTextRange(
              [index, index + fullMatch.length],
              replacement
            )
          })
        );
      }
    }
  };
}

const rule = {
  linter: reporter,
  fixer: reporter
};

export default rule;
