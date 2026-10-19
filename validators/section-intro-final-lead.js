import fs from 'node:fs';
import { getSectionIntros } from '../lib/validate.js';

/**
 * Validate that the final paragraph of each narrative section intro is inside
 * a `.lead` fenced div, matching the lead styling of the rest of the intro.
 * In HTML, `section.section-opener > p` already applies lead styling to direct
 * paragraphs, but EPUB and DOCX rely on the explicit `.lead` div
 * (`custom-style="lead"`), so a trailing plain paragraph renders as body text
 * there while the surrounding intro renders as lead. Only the section-opener
 * preamble (before the first H2) is checked.
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateSectionIntroFinalLead() {
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

    // Only check the section-opener preamble (before the first H2)
    const h2Index = content.search(/^## /m);
    const preamble = h2Index !== -1 ? content.slice(0, h2Index) : content;
    const lines = preamble.split('\n');

    // Walk the preamble tracking fenced divs to find the innermost div class
    // (if any) containing the last content line.
    let inCodeBlock = false;
    const divStack = [];
    let lastContentLine = null;
    let lastContentDivClass = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (/^```/.test(line)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Opening div: ::: {.class ...}
      const openMatch = line.match(/^:::\s*\{[^}]*\.([\w-]+)/);
      if (openMatch) {
        divStack.push(openMatch[1]);
        continue;
      }
      // Opening div without a class: ::: {custom-style="..."} or ::: {#id}
      if (/^:::\s*\{/.test(line)) {
        divStack.push(null);
        continue;
      }
      // Closing div
      if (/^:::\s*$/.test(line)) {
        divStack.pop();
        continue;
      }

      // Skip blanks, headings, and HTML comments
      if (line === '' || /^#+\s/.test(line) || /^<!--/.test(line)) continue;

      lastContentLine = i + 1;
      lastContentDivClass = divStack.length > 0 ? divStack[divStack.length - 1] : null;
    }

    if (lastContentLine !== null && lastContentDivClass !== 'lead') {
      errors.push(
        `Section intro "${section}" in ${file}:${lastContentLine} ends with a paragraph outside a .lead div. ` +
        `Wrap the final paragraph in ::: {.lead custom-style="lead"} so it matches the lead styling ` +
        `of the rest of the section intro in EPUB and DOCX output.`
      );
    }
  }

  return { errors, warnings };
}

export default {
  name: 'section-intro-final-lead',
  tags: ['style'],
  defaults: {},
  run: () => validateSectionIntroFinalLead(),
};
