import fs from 'node:fs';
import { GENERATED_FILES, UNIVERSALLY_KNOWN_ACRONYMS } from '../lib/validate.js';

/**
 * Validate that acronyms are expanded on first use in the book.
 * Reads chapters in index.yml order and checks that each acronym's first
 * occurrence includes a parenthetical expansion nearby.
 *
 * Accepted patterns:
 *   - "Full Name ([ACRONYM]{.smallcaps})" — expansion before acronym
 *   - "[ACRONYM]{.smallcaps} (Full Name)" — expansion after acronym
 *
 * @param {string[]} indexFiles - Files listed in index.yml (in order)
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateAcronymExpansion(indexFiles) {
  const warnings = [];
  // Track which acronyms we've seen and whether they were expanded
  const seen = new Map(); // acronym -> { file, line, expanded }

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    if (GENERATED_FILES.has(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Find all [ACRONYM]{.smallcaps} occurrences on this line
      const pattern = /\[([A-Z][A-Za-z0-9+/.]+)\]\{\.smallcaps\}/g;
      let m;
      while ((m = pattern.exec(line)) !== null) {
        const acr = m[0]; // full match e.g. [TLS]{.smallcaps}
        const acronym = m[1]; // just the letters e.g. TLS

        if (seen.has(acronym)) continue; // already tracked first use

        // Skip timezone offsets (UTC+1, UTC+5), date formats (YYYY-MM-DD),
        // and degree abbreviations (J.D., M.B.A.) — these aren't expandable acronyms
        if (/^UTC[+-]/.test(acronym)) continue;
        if (/^[YMD]{2,}/.test(acronym)) continue;
        if (/^[A-Z]\.[A-Z]\./.test(acronym)) continue;

        // Check if there's an expansion nearby on this line
        // Pattern 1: "Full Name ([ACRONYM]{.smallcaps})" — open paren before
        const beforeAcr = line.slice(0, m.index);
        const afterAcr = line.slice(m.index + acr.length);
        // Allow trailing punctuation in the expansion (e.g. a title that ends
        // in "?": "What Comes Next? ([WCN]{.smallcaps})").
        const hasExpansionBefore = /\w+[?!.…]?\s*\($/.test(beforeAcr.trimEnd());

        // Pattern 2: "[ACRONYM]{.smallcaps} (Full Name)" — open paren after
        // Also handles plurals: "[ACRONYM]{.smallcaps}s (Full Name)"
        const hasExpansionAfter = /^s?\s*\([A-Za-z]/.test(afterAcr);

        // Pattern 3: Inline expansion near the acronym on the same line
        // e.g., "denial-of-service attack...a [DoS]{.smallcaps} attack"
        // or book title containing expansion text before the acronym
        const hasInlineExpansion = false; // conservative: only parenthetical counts

        const expanded = hasExpansionBefore || hasExpansionAfter || hasInlineExpansion;

        seen.set(acronym, { file, line: i + 1, expanded });
      }
    }
  }

  // Report acronyms not expanded on first use (skip universally known ones)
  for (const [acronym, info] of seen) {
    if (UNIVERSALLY_KNOWN_ACRONYMS.includes(acronym)) continue;
    if (!info.expanded) {
      warnings.push(
        `Acronym "${acronym}" not expanded on first use in ${info.file}:${info.line}`
      );
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'acronym-expansion',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateAcronymExpansion(ctx.indexFiles),
};
