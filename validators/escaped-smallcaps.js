import fs from 'node:fs';

/**
 * Validate that no smallcaps spans have escaped brackets.
 * A backslash before the opening bracket (e.g., \[AM]{.smallcaps}) prevents
 * pandoc from rendering the span, producing raw markup in the output.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateEscapedSmallcaps(indexFiles) {
  const errors = [];
  const pattern = /\\\[[^\]]*?\]\{\.smallcaps\}/g;

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      let m;
      while ((m = pattern.exec(line)) !== null) {
        errors.push(
          `Escaped smallcaps ${m[0]} in ${file}:${i + 1} — remove the backslash`
        );
      }
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'escaped-smallcaps',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateEscapedSmallcaps(ctx.indexFiles),
};
