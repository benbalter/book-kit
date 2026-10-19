import fs from 'node:fs';
import { getIndexFiles } from '../lib/validate.js';

/**
 * Validate that link text is not a bare URL. Link text should describe the
 * target; bare-URL link text hurts screen-reader users and print rendering.
 * @param {string[]} [chapters] - Files listed in index.yml (read from it by default)
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateNoBareUrlLinkText(chapters = getIndexFiles()) {
  const errors = [];
  const warnings = [];
  // [https://example.com](https://...) — text identical to URL.
  const bareLinkRe = /\[(https?:\/\/[^\]]+)\]\(([^)]+)\)/g;

  for (const file of chapters) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(bareLinkRe)) {
        errors.push(
          `${file}:${i + 1} uses a bare URL as link text: "${m[0]}". ` +
          `Describe the link's target instead; screen readers read the URL aloud, and print turns it into a footnote anyway.`
        );
      }
    });
  }

  return { errors, warnings };
}

export default {
  name: 'no-bare-url-link-text',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateNoBareUrlLinkText(ctx.indexFiles),
};
