import fs from 'node:fs';

/**
 * Validate quote punctuation against two rules:
 *
 *   1. Periods and commas belong INSIDE the closing quote (US convention):
 *      `left".` must read `left."` and `"fit",` must read `"fit,"`.
 *      Flagged as: a *letter* + closing quote (straight " or curly ") + `.`/`,`.
 *      Requiring a letter before the quote deliberately excludes inch/foot
 *      measurements (`6".`, `0.75"`) — a digit, not a letter, precedes the quote.
 *
 *   2. No comma after a quoted question or exclamation (Chicago style):
 *      `"…ready?", she asked` must read `"…ready?" she asked`.
 *      Flagged as: `?` or `!` + closing quote + `,`.
 *
 * Inline code, fenced code blocks, and YAML frontmatter are skipped.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateQuotePunctuation(indexFiles) {
  const errors = [];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let inFrontmatter = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track YAML frontmatter
      if (i === 0 && line.trim() === '---') {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter && line.trim() === '---') {
        inFrontmatter = false;
        continue;
      }
      if (inFrontmatter) continue;

      // Track fenced code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const isInInlineCode = (index) =>
        ((line.slice(0, index).match(/`/g) || []).length % 2) === 1;
      const context = (index, len) =>
        line.slice(Math.max(0, index - 15), index + len + 15).trim();

      // Rule 1: letter, closing quote (straight or curly), then period/comma.
      const leaked = /[A-Za-z]["”][.,]/g;
      let m;
      while ((m = leaked.exec(line)) !== null) {
        if (isInInlineCode(m.index)) continue;
        errors.push(
          `Quote punctuation: period/comma belongs inside the closing quote in ${file}:${i + 1}: "...${context(m.index, m[0].length)}..."`
        );
      }

      // Rule 2: comma after a quoted question/exclamation (drop it, Chicago style).
      const questionComma = /[?!]["”],/g;
      while ((m = questionComma.exec(line)) !== null) {
        if (isInInlineCode(m.index)) continue;
        errors.push(
          `Quote punctuation: drop the comma after a quoted question/exclamation in ${file}:${i + 1}: "...${context(m.index, m[0].length)}..."`
        );
      }
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'quote-punctuation',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateQuotePunctuation(ctx.indexFiles),
};
