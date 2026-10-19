import fs from 'node:fs';
import { getIndexFiles } from '../lib/validate.js';

/**
 * Validate that no production chapter contains a `TODO: TRANSITION` marker.
 * A writer (or a drafting tool) leaves one where a transition between
 * sections is still owed; it must be resolved before production builds.
 * @param {string[]} [chapters] - Files listed in index.yml (read from it by default)
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateNoTransitionTodos(chapters = getIndexFiles()) {
  const errors = [];
  const warnings = [];

  for (const file of chapters) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (/TODO:\s*TRANSITION/i.test(content)) {
      errors.push(
        `${file} contains an unresolved "TODO: TRANSITION" marker. ` +
        `Write the transition, or remove the marker, before merging.`
      );
    }
  }

  return { errors, warnings };
}

export default {
  name: 'no-transition-todos',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateNoTransitionTodos(ctx.indexFiles),
};
