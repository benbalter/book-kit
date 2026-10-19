import fs from 'node:fs';
import { getSectionIntros } from '../lib/validate.js';

/**
 * Validate that section intro files use H1 headings (not H2 or lower).
 * Section intros must use # (H1) to appear as top-level entries in the PDF table of contents.
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateSectionIntros() {
  const errors = [];
  const warnings = [];
  const intros = getSectionIntros();

  for (const { section, file } of intros) {
    const firstLine = fs.readFileSync(file, 'utf8').split('\n')[0] || '';
    const match = firstLine.match(/^(#+)\s/);
    if (match && match[1].length > 1) {
      errors.push(
        `Section intro "${section}" in ${file} uses H${match[1].length} heading instead of H1. ` +
        `Section intros must use # (H1) to appear in the PDF table of contents.`
      );
    }
  }

  return { errors, warnings };
}

export default {
  name: 'section-intros',
  tags: ['style'],
  defaults: {},
  run: () => validateSectionIntros(),
};
