import fs from 'node:fs';
import { extractParagraphs, isParagraphLengthExempt, MAX_PARAGRAPH_WORDS } from '../lib/paragraphs.js';
import { GENERATED_FILES, allowFor, optionsFor } from '../lib/validate.js';

const defaults = {
  // Longest prose paragraph allowed, in words.
  max_words: MAX_PARAGRAPH_WORDS,
};

/**
 * Validate paragraph lengths for skim-ability.
 *
 * Long paragraphs are walls of text; skimmers (and readers with ADHD) bounce
 * off them. Flags any prose paragraph — body text or callout text — over
 * the `max_words` option (default MAX_PARAGRAPH_WORDS, 120, which flags only
 * the longest few percent of paragraphs in typical prose). Generated key-takeaways chapters, front/back matter, and scratch
 * files are exempt (see isParagraphLengthExempt in lib/paragraphs.js).
 *
 * @param {string[]} indexFiles - Chapter files from index.yml
 * @param {{max_words?: number}} [options]
 * @param {Set<string>} [allowed] - "file:line" paragraphs exempt (validators.allow)
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateParagraphLength(
  indexFiles,
  options = optionsFor('paragraph-length', defaults),
  allowed = allowFor('paragraph-length'),
) {
  const errors = [];
  const MAX_WORDS = options.max_words;

  // Intentional exceptions — paragraphs that genuinely resist splitting
  // (one sustained argument that weakens when broken). Keep this near-empty;
  // splitting is almost always the right call.
  // Format: "file:line" using the paragraph start line.
  const PARAGRAPH_LENGTH_ALLOWLIST = allowed;

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    if (isParagraphLengthExempt(file)) continue;
    if (GENERATED_FILES.has(file)) continue; // generated pages (lint.generated) aren't prose
    const content = fs.readFileSync(file, 'utf8');

    for (const paragraph of extractParagraphs(content)) {
      if (paragraph.words <= MAX_WORDS) continue;
      const location = `${file}:${paragraph.line}`;
      if (PARAGRAPH_LENGTH_ALLOWLIST.has(location)) continue;
      errors.push(
        `Paragraph too long (${paragraph.words} words, max ${MAX_WORDS}) in ${location} — split it up for skim-ability`
      );
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'paragraph-length',
  tags: ['style'],
  defaults,
  run: (ctx) => validateParagraphLength(ctx.indexFiles, ctx.options, ctx.allow),
};
