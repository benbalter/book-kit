import fs from 'node:fs';
import { headingToAnchor } from '../lib/validate.js';

/**
 * Validate no duplicate H2 headings across production chapters.
 * Duplicate H2 headings cause anchor ID collisions in the combined output.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateDuplicateHeadings(indexFiles) {
  const warnings = [];
  // Map anchor -> [files where it appears]
  const anchorSources = new Map();

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');

    for (const line of content.split('\n')) {
      // Only check H2 headings (chapters)
      if (/^##\s/.test(line)) {
        const anchor = headingToAnchor(line);
        if (!anchor) continue;

        if (!anchorSources.has(anchor)) {
          anchorSources.set(anchor, []);
        }
        anchorSources.get(anchor).push(file);
      }
    }
  }

  // "Key takeaways" is intentionally repeated across section key-takeaways files
  const ALLOWED_DUPLICATES = ['key-takeaways'];

  for (const [anchor, files] of anchorSources) {
    if (files.length > 1 && !ALLOWED_DUPLICATES.includes(anchor)) {
      warnings.push(
        `Duplicate H2 anchor "#${anchor}" in: ${files.join(', ')}`
      );
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'duplicate-headings',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateDuplicateHeadings(ctx.indexFiles),
};
