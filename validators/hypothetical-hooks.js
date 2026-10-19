import fs from 'node:fs';
import { allowFor, optionsFor } from '../lib/validate.js';

const defaults = {
  // More openers to flag: regular-expression sources, matched case-insensitively
  // against each paragraph line (anchor with ^ to match only at its start).
  // The warning quotes the source.
  extra_patterns: [],
};

// An extra_patterns entry as a case-insensitive RegExp, naming the config key
// when the source doesn't parse.
function compilePattern(source) {
  try {
    return new RegExp(source, 'i');
  } catch (error) {
    throw new Error(`validators.options.hypothetical-hooks.extra_patterns: ${error.message}`, { cause: error });
  }
}

/**
 * Validate that paragraphs don't start with formulaic hypothetical-scenario
 * openers ("Picture this:", "Imagine...", etc.) that sound AI-generated.
 * Reports warnings for any matches found.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @param {{extra_patterns?: string[]}} [options]
 * @param {Set<string>} [allowed] - "file:line" openers exempt (validators.allow)
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateHypotheticalHooks(
  indexFiles,
  options = optionsFor('hypothetical-hooks', defaults),
  allowed = allowFor('hypothetical-hooks'),
) {
  const warnings = [];
  // Patterns that flag formulaic hypothetical openers
  const patterns = [
    { regex: /^Picture this:/i, label: 'Picture this:' },
    { regex: /^Imagine\b/i, label: 'Imagine...' },
    { regex: /^Consider a\b/i, label: 'Consider a...' },
    { regex: /^Here'?s a scenario/i, label: "Here's a scenario..." },
    { regex: /^Now picture\b/i, label: 'Now picture...' },
    { regex: /^Let'?s say\b/i, label: "Let's say..." },
    ...(options.extra_patterns ?? []).map((source) => ({ regex: compilePattern(source), label: source })),
  ];

  // Allowlist for intentional uses (analogies, non-workplace metaphors).
  // To exempt a flagged opener, add its "src/chapter.md:line" (the paragraph
  // start line the checker reports). Prune entries when chapters are renamed or
  // removed so the set can't silently drift (cf. the RHETORICAL_ALLOWLIST).
  const HOOK_ALLOWLIST = allowed;

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let inCallout = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      if (line.startsWith('::: {.')) {
        inCallout = true;
        continue;
      }
      if (line === ':::') {
        inCallout = false;
        continue;
      }

      // Skip headings, blank lines, list items, and HTML comments
      if (!line.trim() || line.startsWith('#') || line.startsWith('-') || line.startsWith('<!--')) continue;
      if (inCallout) continue;

      for (const { regex, label } of patterns) {
        if (regex.test(line.trim())) {
          const location = `${file}:${i + 1}`;
          if (!HOOK_ALLOWLIST.has(location)) {
            warnings.push(
              `Formulaic hypothetical opener "${label}" in ${location} — rephrase to avoid AI-sounding hooks`
            );
          }
        }
      }
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'hypothetical-hooks',
  tags: ['style'],
  defaults,
  run: (ctx) => validateHypotheticalHooks(ctx.indexFiles, ctx.options, ctx.allow),
};
