import fs from 'node:fs';
import { getSectionIntros } from '../lib/validate.js';

/**
 * Validate that section intro files use {.section-opener} on their H1 heading.
 * The .section-opener class triggers page-level CSS that applies lead styling
 * to all direct paragraphs and lists, replacing the need for individual .lead divs.
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateSectionIntroHasLead() {
  const errors = [];
  const warnings = [];
  const intros = getSectionIntros();

  for (const { section, file } of intros) {
    const content = fs.readFileSync(file, 'utf8');
    // Only check narrative section intros: those whose first heading is an H1.
    // Front-matter files (copyright, dedication) and the back cover don't serve
    // as narrative bridges between sections.
    const firstHeading = content.split('\n').find((l) => /^#+\s/.test(l.trim()));
    if (!firstHeading || !/^#\s/.test(firstHeading.trim())) continue;
    if (section === 'Back cover') continue;

    const hasSectionOpener = /^#\s.*\{[^}]*\.section-opener[^}]*\}/m.test(content);
    if (!hasSectionOpener) {
      errors.push(
        `Section intro "${section}" in ${file} is missing {.section-opener} on its H1 heading. ` +
        `Add {.section-opener} to the H1 for page-level lead styling.`
      );
    }
  }

  return { errors, warnings };
}

export default {
  name: 'section-intro-has-lead',
  tags: ['style'],
  defaults: {},
  run: () => validateSectionIntroHasLead(),
};
