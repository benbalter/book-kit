import fs from 'node:fs';
import { isNonChapter } from '../lib/structure.js';
import { config, isExcluded, REQUIRED_CALLOUT } from '../lib/validate.js';

/**
 * Validate a chapter file
 * @param {string} chapter - Path to chapter file
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateChapter(chapter, indexFiles) {
  const errors = [];
  const warnings = [];
  
  // Check if chapter is in index.yml
  if (!indexFiles.includes(chapter)) {
    errors.push(`Chapter not found in index.yml: ${chapter}`);
  }
  
  // Read chapter contents
  const contents = fs.readFileSync(chapter, 'utf8');
  
  // Check for TODO markers
  if (contents.includes('TODO')) {
    errors.push(`Chapter contains TODO: ${chapter}`);
  }
  
  // Check for the required opening callout (TL;DR by default). Structural
  // pages and takeaways collections aren't chapters, so they're exempt.
  if (REQUIRED_CALLOUT && !isNonChapter(chapter, config) && !contents.includes(`.${REQUIRED_CALLOUT}`)) {
    errors.push(`Chapter missing ${REQUIRED_CALLOUT === 'tldr' ? 'TL;DR' : `.${REQUIRED_CALLOUT} callout`}: ${chapter}`);
  }
  
  return { errors, warnings };
}

// Runs validateChapter over every chapter under paths.src that isn't in
// lint.exclude. The per-chapter results are concatenated into one, which
// prints in the same order as reporting each chapter separately only because
// validateChapter emits errors and never warnings; keep it that way, or report
// per chapter again.
export default {
  name: 'chapter',
  tags: ['structure'],
  defaults: {},
  run(ctx) {
    const errors = [];
    const warnings = [];
    for (const chapter of ctx.chapters) {
      if (isExcluded(chapter)) continue;
      const result = validateChapter(chapter, ctx.indexFiles);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
    return { errors, warnings };
  },
};
