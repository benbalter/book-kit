import fs from 'node:fs';

/**
 * Validate that numeric ranges use an en dash (–), not a hyphen (CMOS 6.78):
 * "9–5", "25–30", "50–60%", not "9-5". A hyphenated digit-hyphen-digit run in
 * prose is almost always a range typed with the wrong dash.
 *
 * Matches a standalone `\d{1,4}-\d{1,4}` — the surrounding negative look-arounds
 * (`[\w./-]`) exclude version numbers (`1.2-3`), ISBNs (`979-8-…`), slashed
 * sequences, and hyphenated identifiers. Inline code, fenced code blocks, URLs,
 * and YAML frontmatter are skipped. (Comma/`$`-bearing ranges like
 * `$10,000-$15,000` are out of scope — the digit-hyphen-digit run is broken by
 * the comma or symbol.)
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateNumberRangeDashes(indexFiles) {
  const errors = [];

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

      const range = /(?<![\w./-])\d{1,4}-\d{1,4}(?![\w./-])/g;
      let m;
      while ((m = range.exec(line)) !== null) {
        const before = line.slice(0, m.index);

        // Skip if inside inline code (odd number of backticks before match)
        if ((before.match(/`/g) || []).length % 2 === 1) continue;

        // Skip if inside a URL
        if (/https?:\/\/\S*$/.test(before)) continue;

        errors.push(
          `Number range should use an en dash (–), not a hyphen, in ${file}:${i + 1}: "...${line.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15).trim()}..."`
        );
      }
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'number-range-dashes',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateNumberRangeDashes(ctx.indexFiles),
};
