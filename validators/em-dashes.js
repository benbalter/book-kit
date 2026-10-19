import fs from 'node:fs';

/**
 * Validate that em-dashes are used instead of spaced hyphens.
 * Detects patterns like "word - word" which should be "word—word" or "word — word".
 * Skips code blocks, YAML frontmatter, and markdown list markers.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateEmDashes(indexFiles) {
  const warnings = [];

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

      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Skip list markers (- item), horizontal rules (---), and table separators
      if (/^\s*[-*+]\s/.test(line)) continue;
      if (/^-{3,}$/.test(line.trim())) continue;
      if (/^\|/.test(line.trim())) continue;

      // Detect spaced hyphens: "word - word" (not "e.g. - " list continuation)
      // Match: letter/closing-paren/quote, space(s), single hyphen, space(s), letter/opening-quote
      const spacedHyphen = /(?<=[a-zA-Z)'""])\s+-\s+(?=[a-zA-Z('""])/g;
      let m;
      while ((m = spacedHyphen.exec(line)) !== null) {
        // Skip if inside inline code
        const before = line.slice(0, m.index);
        if ((before.match(/`/g) || []).length % 2 === 1) continue;

        // Skip if inside a URL
        if (/https?:\/\/\S*$/.test(before)) continue;

        warnings.push(
          `Spaced hyphen (should be em-dash?) in ${file}:${i + 1}: "...${line.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15).trim()}..."`
        );
      }
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'em-dashes',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateEmDashes(ctx.indexFiles),
};
