import fs from 'node:fs';
import { allowFor, optionsFor } from '../lib/validate.js';

const defaults = {
  // Consecutive sentences with the same first word that trigger a warning.
  threshold: 3,
};

/**
 * Validate sentence starter variety within paragraphs.
 * Warns when `threshold` (3) or more consecutive sentences in a paragraph start with the same word.
 * Repetitive openings make prose feel monotonous and AI-generated.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @param {{threshold?: number}} [options]
 * @param {Set<string>} [allowed] - "file:line" paragraphs exempt (validators.allow)
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateSentenceStarters(
  indexFiles,
  options = optionsFor('sentence-starters', defaults),
  allowed = allowFor('sentence-starters'),
) {
  const warnings = [];
  const THRESHOLD = options.threshold; // consecutive sentences with same starter

  // Intentional rhetorical patterns (parallel structure, escalation, question lists)
  // Format: "file:line" using the paragraph start line reported by the checker
  const RHETORICAL_ALLOWLIST = allowed;

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let inCallout = false;
    let paragraphLines = [];
    let paragraphStartLine = 0;

    const checkParagraph = () => {
      if (paragraphLines.length === 0) return;
      const text = paragraphLines.join(' ');

      // Split into sentences (simple heuristic: period/!/? followed by space and uppercase)
      const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"'*[])/).filter(s => s.trim());
      if (sentences.length < THRESHOLD) return;

      // Check for consecutive same-word starters
      let streak = 1;
      let prevStarter = '';
      for (let i = 0; i < sentences.length; i++) {
        // Extract first word (skip markdown formatting: **, *, [)
        const starterMatch = sentences[i].match(/^[*_[\]]*([A-Za-z]+)/);
        if (!starterMatch) {
          streak = 1;
          prevStarter = '';
          continue;
        }
        const starter = starterMatch[1].toLowerCase();

        if (starter === prevStarter && starter.length > 1) {
          streak++;
          if (streak >= THRESHOLD) {
            const location = `${file}:${paragraphStartLine}`;
            if (!RHETORICAL_ALLOWLIST.has(location)) {
              warnings.push(
                `${streak} consecutive sentences start with "${starterMatch[1]}" in ${location}`
              );
            }
            break;
          }
        } else {
          streak = 1;
        }
        prevStarter = starter;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        checkParagraph();
        paragraphLines = [];
        continue;
      }
      if (inCodeBlock) continue;

      // Skip callout divs (their content is intentionally structured)
      if (/^:::\s*\{/.test(line.trim())) {
        checkParagraph();
        paragraphLines = [];
        inCallout = true;
        continue;
      }
      if (/^:::\s*$/.test(line.trim())) {
        inCallout = false;
        paragraphLines = [];
        continue;
      }
      if (inCallout) continue;

      // Skip headings, list items, and blank lines
      if (/^#{1,6}\s/.test(line) || /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
        checkParagraph();
        paragraphLines = [];
        continue;
      }

      if (line.trim() === '') {
        checkParagraph();
        paragraphLines = [];
        continue;
      }

      if (paragraphLines.length === 0) {
        paragraphStartLine = i + 1;
      }
      paragraphLines.push(line.trim());
    }
    checkParagraph();
  }

  return { errors: [], warnings };
}

export default {
  name: 'sentence-starters',
  tags: ['style'],
  defaults,
  run: (ctx) => validateSentenceStarters(ctx.indexFiles, ctx.options, ctx.allow),
};
