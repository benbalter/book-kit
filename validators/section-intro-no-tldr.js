import fs from 'node:fs';
import { getSectionIntros } from '../lib/validate.js';

/**
 * Validate that section intro files do not contain TL;DR blocks in the section-opener
 * portion (before the first H2). TL;DRs under H2 sub-chapters within the file are allowed.
 * Section intros use {.section-opener} on their H1 instead of TL;DR blocks.
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateSectionIntroNoTldr() {
  const errors = [];
  const warnings = [];
  const intros = getSectionIntros();

  for (const { section, file } of intros) {
    const content = fs.readFileSync(file, 'utf8');
    // Only check the portion before the first H2 heading
    const h2Index = content.search(/^## /m);
    const preamble = h2Index !== -1 ? content.slice(0, h2Index) : content;
    const hasTldr = /^:::\s*\{\.tldr\b/m.test(preamble);
    if (hasTldr) {
      errors.push(
        `Section intro "${section}" in ${file} contains a TL;DR block in the section-opener preamble. ` +
        `Section intros should use {.section-opener} on their H1, not .tldr blocks.`
      );
    }
  }

  return { errors, warnings };
}

export default {
  name: 'section-intro-no-tldr',
  tags: ['style'],
  defaults: {},
  run: () => validateSectionIntroNoTldr(),
};
