import { describe, it, expect, afterEach } from 'vitest';

import format from '../lib/textlint-github-formatter.js';

const workspace = process.env.GITHUB_WORKSPACE;
afterEach(() => {
  if (workspace === undefined) delete process.env.GITHUB_WORKSPACE;
  else process.env.GITHUB_WORKSPACE = workspace;
});

const finding = (overrides = {}) => ({
  ruleId: 'no-cliches',
  message: '"Leverage" is a buzzword.',
  line: 49,
  column: 136,
  severity: 2,
  ...overrides,
});

describe('textlint-github-formatter', () => {
  it('emits one workflow command per finding, relative to the workspace', () => {
    process.env.GITHUB_WORKSPACE = '/repo';
    const out = format([{ filePath: '/repo/book/src/a.md', messages: [finding()] }]);
    expect(out.split('\n')).toEqual([
      '::error file=book/src/a.md,line=49,col=136,title=textlint (no-cliches)::"Leverage" is a buzzword.',
      '1 prose problem',
    ]);
  });

  it('keeps every finding on its own file, including fixable ones', () => {
    process.env.GITHUB_WORKSPACE = '/repo';
    const out = format([
      { filePath: '/repo/src/a.md', messages: [finding({ message: '"AI" should use smallcaps: [AI]{.smallcaps}', fix: { range: [0, 2], text: 'x' } })] },
      { filePath: '/repo/src/b.md', messages: [finding({ line: 3 })] },
    ]);
    const [first, second] = out.split('\n');
    expect(first).toMatch(/^::error file=src\/a\.md,/);
    expect(first).toMatch(/\[AI\]\{\.smallcaps\}\. Fixable with `just prose --fix`\.$/);
    expect(second).toMatch(/^::error file=src\/b\.md,line=3,/);
  });

  it('escapes newlines in messages and commas or colons in properties', () => {
    process.env.GITHUB_WORKSPACE = '/repo';
    const out = format([{
      filePath: '/repo/src/a,b.md',
      messages: [finding({ ruleId: 'x:y', message: 'Too long.\nOver 58 characters. 100%' })],
    }]);
    expect(out).toContain('file=src/a%2Cb.md,');
    expect(out).toContain('title=textlint (x%3Ay)::');
    expect(out).toContain('::Too long.%0AOver 58 characters. 100%25');
  });

  it('maps severity to annotation level', () => {
    const levels = [1, 2, 3].map((severity) =>
      format([{ filePath: `${process.cwd()}/a.md`, messages: [finding({ severity })] }]).split(' ')[0]);
    expect(levels).toEqual(['::warning', '::error', '::notice']);
  });

  it('prints nothing for a clean run', () => {
    expect(format([{ filePath: '/repo/src/a.md', messages: [] }])).toBe('');
  });
});
