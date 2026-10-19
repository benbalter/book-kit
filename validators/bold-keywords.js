import fs from 'node:fs';

/**
 * Validate that bold keywords (**Keyword.** Body / **Keyword:** Body) are not
 * used outside of callout divs. Prefer H4 headings for accessibility.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateBoldKeywords(indexFiles) {
  const warnings = [];
  // Matches **Text.** or **Text:** at start of line followed by body text
  const pattern = /^\*\*[^*]+[.:]\*\*\s+\S/;

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

      if (!inCallout && pattern.test(line)) {
        const keyword = line.match(/^\*\*(.+?)[.:]\*\*/)?.[1] || '';
        warnings.push(
          `Bold keyword "${keyword}" should be an H4 heading in ${file}:${i + 1}`
        );
      }
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'bold-keywords',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateBoldKeywords(ctx.indexFiles),
};
