import fs from 'node:fs';
import { optionsFor } from '../lib/validate.js';

const defaults = {
  // Bounds on a TL;DR's word count: past max_words it's a paragraph, under
  // min_words it's a fragment.
  min_words: 8,
  max_words: 80,
};

/**
 * Validate TL;DR sections are reasonable length (1-3 sentences).
 * Flags TL;DRs that are too long (likely paragraph-length) or suspiciously short.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @param {{min_words?: number, max_words?: number}} [options]
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateTldrLength(indexFiles, options = optionsFor('tldr-length', defaults)) {
  const warnings = [];
  const MAX_WORDS = options.max_words;
  const MIN_WORDS = options.min_words;

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, 'utf8');

    // Extract TL;DR content between ::: {.tldr ...} and :::
    const tldrMatch = content.match(
      /:::\s*\{\.tldr[^}]*\}\s*\n([\s\S]*?)\n\s*:::/
    );
    if (!tldrMatch) continue;

    const tldrText = tldrMatch[1].trim();
    if (!tldrText) continue;

    const wordCount = tldrText.split(/\s+/).length;

    if (wordCount > MAX_WORDS) {
      warnings.push(
        `TL;DR too long (${wordCount} words, max ${MAX_WORDS}) in ${file}`
      );
    } else if (wordCount < MIN_WORDS) {
      warnings.push(
        `TL;DR too short (${wordCount} words, min ${MIN_WORDS}) in ${file}`
      );
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'tldr-length',
  tags: ['style'],
  defaults,
  run: (ctx) => validateTldrLength(ctx.indexFiles, ctx.options),
};
