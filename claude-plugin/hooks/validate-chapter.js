#!/usr/bin/env node
// PostToolUse hook: after Claude edits a chapter, run the checks CI would
// otherwise catch later, on that chapter.
//
// - Blocking (exit 2, errors go back to Claude): markdownlint on the file, and
//   `book-kit validate` errors that point at the file. Validate runs on the
//   whole book (it's fast, and cross-references need every chapter), but
//   errors in other chapters aren't this edit's fault, so they only advise.
// - Advisory (additionalContext, never blocks): textlint findings. Whether
//   prose findings fail CI depends on the book's phase, so the hook leaves
//   that call to the book's `just check-all`.
//
// It uses the book's installed kit (node_modules/.bin/book-kit) rather than
// this plugin's copy, so checks match the kit version the book has locked.
// Anything that isn't a book-kit book, or isn't a chapter, passes through.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path;
  if (typeof filePath !== 'string') process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const bk = path.join(root, 'node_modules', '.bin', 'book-kit');
  if (!fs.existsSync(path.join(root, 'book.config.yml'))) process.exit(0);
  if (!fs.existsSync(bk)) {
    advise('book-kit is not installed, so chapter checks were skipped. Run `npm ci` in the book (its CLAUDE.md or README says if the registry needs a token).');
  }

  const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  const output = (result) => `${result.stdout || ''}${result.stderr || ''}`.trim();
  const configValue = (key, fallback) => run(bk, ['config', key]).stdout?.trim() || fallback;

  const src = configValue('paths.src', 'src').replace(/\/+$/, '');
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
  const dir = path.posix.dirname(rel);
  const drafts = `${configValue('structure.draft_suffix', '-scratch')}.md`;
  if (dir !== src || !rel.endsWith('.md') || rel.endsWith(drafts)) process.exit(0);

  const blocking = [];
  const advisory = [];

  // The same resolved configs as `just lint` and `just prose` (lib/lint.js).
  const lint = run(bk, ['markdownlint', rel]);
  if (lint.status !== 0) blocking.push(`## markdownlint\n${output(lint)}`);

  const validate = run(bk, ['validate']);
  if (validate.status !== 0) {
    const errors = output(validate).split('\n').filter((line) => !line.startsWith('Warning:') && !line.startsWith('ℹ'));
    const mine = errors.filter((line) => line.includes(rel));
    if (mine.length > 0) blocking.push(`## book-kit validate\n${mine.join('\n')}`);
    else advisory.push(`book-kit validate fails on other chapters (not this edit):\n${errors.join('\n')}`);
  }

  const prose = run(bk, ['prose', rel]);
  if (prose.status !== 0) advisory.push(`textlint findings in ${rel} (advisory; review in context, fix genuine problems):\n${output(prose)}`);

  if (blocking.length > 0) {
    process.stderr.write(`Chapter checks failed for ${rel}:\n\n${blocking.join('\n\n')}\n`);
    if (advisory.length > 0) process.stderr.write(`\nAlso:\n\n${advisory.join('\n\n')}\n`);
    process.exit(2);
  }
  if (advisory.length > 0) advise(advisory.join('\n\n'));
  process.exit(0);
});

function advise(text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text },
  }));
  process.exit(0);
}
