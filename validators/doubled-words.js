import fs from 'node:fs';
import { optionsFor } from '../lib/validate.js';

const defaults = {
  // Words that are legitimately repeated in English prose and must not be
  // flagged as accidental doubling (e.g. "the fact that that happened").
  // Matching ignores case.
  allowlist: ['had', 'that'],
};

/**
 * Validate that no word is accidentally repeated back-to-back ("the the",
 * "and and") — a classic typo that survives spellcheck. Matches a run of
 * letters immediately followed by the same run (case-insensitive), skipping a
 * small allowlist of legitimate repeats (the `allowlist` option). Inline code,
 * fenced code blocks, and YAML frontmatter are skipped.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @param {{allowlist?: string[]}} [options]
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateDoubledWords(indexFiles, options = optionsFor('doubled-words', defaults)) {
  const errors = [];
  const DOUBLED_WORD_ALLOWLIST = new Set((options.allowlist ?? []).map((w) => String(w).toLowerCase()));

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (i === 0 && line.trim() === '---') {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter && line.trim() === '---') {
        inFrontmatter = false;
        continue;
      }
      if (inFrontmatter) continue;

      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Same letter-run twice in a row, separated only by spaces/tabs.
      const doubled = /\b([A-Za-z]+)([ \t]+)\1\b/gi;
      let m;
      while ((m = doubled.exec(line)) !== null) {
        if (DOUBLED_WORD_ALLOWLIST.has(m[1].toLowerCase())) continue;

        // Skip if inside inline code (odd number of backticks before match)
        const before = line.slice(0, m.index);
        if ((before.match(/`/g) || []).length % 2 === 1) continue;

        errors.push(
          `Doubled word "${m[1]} ${m[1]}" in ${file}:${i + 1}: "...${line.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15).trim()}..."`
        );
      }
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'doubled-words',
  tags: ['structure'],
  defaults,
  run: (ctx) => validateDoubledWords(ctx.indexFiles, ctx.options),
};
