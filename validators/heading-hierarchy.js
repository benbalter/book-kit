import fs from 'node:fs';

/**
 * Validate heading hierarchy — no skipping levels (e.g., H2 → H4 without H3).
 * Skipped heading levels break document outline and PDF/EPUB table of contents.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateHeadingHierarchy(indexFiles) {
  const warnings = [];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let prevLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const headingMatch = line.match(/^(#{1,6})\s+/);
      if (!headingMatch) continue;

      const level = headingMatch[1].length;

      // First heading in file sets the baseline
      if (prevLevel === 0) {
        prevLevel = level;
        continue;
      }

      // Going deeper by more than one level is a hierarchy violation
      if (level > prevLevel + 1) {
        warnings.push(
          `Heading hierarchy skip: H${prevLevel} → H${level} in ${file}:${i + 1}`
        );
      }

      prevLevel = level;
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'heading-hierarchy',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateHeadingHierarchy(ctx.indexFiles),
};
