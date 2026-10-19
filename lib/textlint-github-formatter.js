/**
 * textlint formatter that reports findings as GitHub Actions workflow
 * commands (`::error file=…,line=…::message`), so each one becomes an
 * annotation on the right file and line.
 *
 * The `prose` recipe uses it when GITHUB_ACTIONS is set. Without it,
 * textlint's stylish output gets parsed by the eslint-stylish problem
 * matcher that actions/setup-node registers, which misreads it: its file
 * pattern matches any non-blank line (so a finding becomes the "file" for
 * the next one, annotated on `.github`), the `✓` fixable marker keeps
 * fixable findings from matching at all, and multi-line messages are
 * dropped. Workflow commands carry the file with each finding and escape
 * newlines, so none of that applies.
 */
import path from 'node:path';

const LEVELS = { 1: 'warning', 2: 'error', 3: 'notice' };

// Escaping from @actions/core: data escapes %, CR, LF; properties also , and :
const escapeData = (s) => String(s)
  .replace(/%/g, '%25')
  .replace(/\r/g, '%0D')
  .replace(/\n/g, '%0A');
const escapeProperty = (s) => escapeData(s)
  .replace(/:/g, '%3A')
  .replace(/,/g, '%2C');

/**
 * @param {import('@textlint/types').TextlintResult[]} results
 * @returns {string} One workflow command per finding, then a count
 */
export default function format(results) {
  // Annotation paths are relative to the repository root, which may sit
  // above the book (the workflow's working-directory input).
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  const lines = [];
  let count = 0;

  for (const { filePath, messages } of results) {
    const file = path.relative(root, filePath);
    for (const m of messages) {
      count++;
      const level = LEVELS[m.severity] || 'error';
      const props = [
        `file=${escapeProperty(file)}`,
        `line=${m.line}`,
        `col=${m.column}`,
        `title=${escapeProperty(`textlint (${m.ruleId})`)}`,
      ].join(',');
      let message = m.message;
      if (m.fix) message += `${/[.!?]$/.test(message) ? '' : '.'} Fixable with \`just prose --fix\`.`;
      lines.push(`::${level} ${props}::${escapeData(message)}`);
    }
  }

  if (count) lines.push(`${count} prose problem${count === 1 ? '' : 's'}`);
  return lines.join('\n');
}
