import fs from 'node:fs';

/**
 * Validate index.yml ↔ disk integrity: every file listed in index.yml must
 * exist on disk. The reverse direction — an on-disk, non-excluded chapter that
 * is missing from index.yml — is already caught by validateChapter, so between
 * the two, both directions of the orphan check are covered.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateIndexIntegrity(indexFiles) {
  const errors = [];
  for (const file of indexFiles) {
    if (!fs.existsSync(file)) {
      errors.push(
        `index.yml lists a file that does not exist on disk: ${file}`
      );
    }
  }
  return { errors, warnings: [] };
}

export default {
  name: 'index-integrity',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateIndexIntegrity(ctx.indexFiles),
};
