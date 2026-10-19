import fs from 'node:fs';

/**
 * Validate that footnote references and definitions match.
 * Every [^label] reference must have a [^label]: definition, and vice versa.
 * Mismatches break footnote rendering in PDF and EPUB.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateFootnotes(indexFiles) {
  const errors = [];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    const refs = new Map();  // label -> first line number
    const defs = new Map();  // label -> line number

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Footnote definitions: [^label]: at start of line
      const defMatch = line.match(/^\[\^([^\]]+)\]:/);
      if (defMatch) {
        defs.set(defMatch[1], i + 1);
      }

      // Footnote references: [^label] not followed by :
      // Must be careful not to match definitions
      const refPattern = /\[\^([^\]]+)\](?!:)/g;
      let m;
      while ((m = refPattern.exec(line)) !== null) {
        // Skip if this is actually a definition line (starts with [^)
        if (/^\[\^/.test(line)) continue;

        const label = m[1];
        if (!refs.has(label)) {
          refs.set(label, i + 1);
        }
      }
    }

    // Check for references without definitions
    for (const [label, lineNum] of refs) {
      if (!defs.has(label)) {
        errors.push(
          `Footnote reference [^${label}] without definition in ${file}:${lineNum}`
        );
      }
    }

    // Check for definitions without references (orphaned footnotes)
    for (const [label, lineNum] of defs) {
      if (!refs.has(label)) {
        errors.push(
          `Orphaned footnote definition [^${label}]: without reference in ${file}:${lineNum}`
        );
      }
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'footnotes',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateFootnotes(ctx.indexFiles),
};
