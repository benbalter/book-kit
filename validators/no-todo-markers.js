import fs from 'node:fs';
import { getIndexFiles } from '../lib/validate.js';

/**
 * Validate that no production chapter contains any unresolved TODO/FIXME/XXX
 * markers. Broader guard than validateNoTransitionTodos; catches stray
 * drafting notes before they ship.
 * @param {string[]} [chapters] - Files listed in index.yml (read from it by default)
 * @returns {{errors: string[], warnings: string[]}} Validation results
 */
export function validateNoTodoMarkers(chapters = getIndexFiles()) {
  const errors = [];
  const warnings = [];
  // Exempt the TRANSITION variant (handled by validateNoTransitionTodos) so
  // the two validators produce one error per marker, not two.
  const markerRe = /\b(TODO(?!:\s*TRANSITION)|FIXME|XXX)(:|\b)/i;

  for (const file of chapters) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      // Skip code blocks and inline code (rough heuristic).
      if (/^\s{4,}/.test(line)) return;
      if (/^\s*```/.test(line)) return;
      // Strip {.revision} spans: deliberate placeholders the build fills in
      // (e.g. [TODO: number]{.revision}), not unfinished writing.
      const stripped = line
        .replace(/\[[^\]]*\]\{\.revision\b[^}]*\}/g, '')
        .replace(/`[^`]*`/g, '');
      const m = stripped.match(markerRe);
      if (m) {
        errors.push(
          `${file}:${i + 1} contains unresolved "${m[1]}" marker: ` +
          `${line.trim().slice(0, 120)}`
        );
      }
    });
  }

  return { errors, warnings };
}

export default {
  name: 'no-todo-markers',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateNoTodoMarkers(ctx.indexFiles),
};
