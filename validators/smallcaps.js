import fs from 'node:fs';
import { GENERATED_FILES, KNOWN_ACRONYMS } from '../lib/validate.js';

/**
 * Validate that known acronyms use [ACRONYM]{.smallcaps} formatting.
 * Reports warnings for bare acronyms found outside code blocks and URLs.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateSmallcaps(indexFiles) {
  const warnings = [];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    if (GENERATED_FILES.has(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      for (const acr of KNOWN_ACRONYMS) {
        // Build regex for bare acronym with word boundaries. The trailing `s?`
        // catches bare *plurals* ("ICs", "Q&As"): `\bIC\b` can't match inside
        // "ICs" — C and s are both word characters, so there's no boundary
        // between them — which left an entire class of misses invisible. The
        // correct form keeps the "s" outside the span ([IC]{.smallcaps}s), so
        // the leading lookbehind still skips properly-marked-up plurals.
        const pattern = new RegExp(`(?<!\\[)(?<!\\\\\\[)\\b${acr}s?\\b(?!\\]\\{)(?![^[]*\\{\\.)`, 'g');
        let m;
        while ((m = pattern.exec(line)) !== null) {
          const before = line.slice(0, m.index);

          // Skip if inside inline code (odd number of backticks before)
          if ((before.match(/`/g) || []).length % 2 === 1) continue;

          // Skip if inside a URL
          if (/https?:\/\/\S*$/.test(before)) continue;

          // Skip if inside a markdown link URL: [text](http...ACRONYM
          if (/\]\([^)]*$/.test(before)) continue;

          warnings.push(
            `Bare acronym "${acr}" without smallcaps in ${file}:${i + 1}`
          );
        }
      }
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'smallcaps',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateSmallcaps(ctx.indexFiles),
};
