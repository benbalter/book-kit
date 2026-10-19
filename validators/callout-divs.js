import fs from 'node:fs';

/**
 * Validate that Pandoc fenced divs (:::) are properly balanced.
 * Every opening ::: {.class} must have a matching closing :::.
 * Unclosed divs silently swallow content or break rendering.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateCalloutDivs(indexFiles) {
  const errors = [];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    // Stack of opening div line numbers
    const divStack = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code blocks (fenced divs inside code are literal text)
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Opening div: ::: {.class ...} or ::: {custom-style="..."}
      if (/^:::\s*\{/.test(line.trim())) {
        divStack.push(i + 1);
        continue;
      }

      // Closing div: ::: alone on a line (possibly with trailing whitespace)
      if (/^:::\s*$/.test(line.trim())) {
        if (divStack.length === 0) {
          errors.push(
            `Unmatched closing ::: in ${file}:${i + 1} (no opening div)`
          );
        } else {
          divStack.pop();
        }
        continue;
      }
    }

    // Any remaining unclosed divs
    for (const openLine of divStack) {
      errors.push(
        `Unclosed fenced div (:::) opened at ${file}:${openLine}`
      );
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'callout-divs',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateCalloutDivs(ctx.indexFiles),
};
