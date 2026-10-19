import fs from 'node:fs';
import { collectAllAnchors } from '../lib/validate.js';

/**
 * Validate that internal cross-references (#anchor) resolve to actual headings.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateCrossReferences(indexFiles) {
  const warnings = [];
  const anchors = collectAllAnchors(indexFiles);

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip code blocks
      if (line.trim().startsWith('```')) continue;

      // Find all internal cross-references: [text](#anchor)
      const refPattern = /\]\(#([a-z][a-z0-9-]*)\)/g;
      let match;
      while ((match = refPattern.exec(line)) !== null) {
        const anchor = match[1];
        if (!anchors.has(anchor)) {
          warnings.push(
            `Broken cross-reference "#${anchor}" in ${file}:${i + 1}`
          );
        }
      }
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'cross-references',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateCrossReferences(ctx.indexFiles),
};
