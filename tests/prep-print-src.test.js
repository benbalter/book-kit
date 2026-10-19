import { describe, it, expect } from 'vitest';
import { printIndex } from '../commands/prep-print-src.js';

const INDEX = `input-files:
  # Front matter
  - src/copyright.md
  - src/intro.md
  # __PRINT_ONLY_PAGE__
  - src/web-only.md
`;

describe('printIndex', () => {
  const opts = {
    srcRel: 'src',
    printRel: 'dist/.book-kit/print-src',
    exclude: ['web-only.md'],
    inject: { __PRINT_ONLY_PAGE__: 'print-only.md' },
  };

  it('points chapters at the print copy and drops excluded files', () => {
    const out = printIndex(INDEX, opts);
    expect(out).toContain('  - dist/.book-kit/print-src/intro.md');
    expect(out).not.toContain('web-only');
    expect(out).not.toMatch(/ - src\//);
  });

  it('drops injection markers unless asked to inject', () => {
    expect(printIndex(INDEX, opts)).not.toContain('__PRINT_ONLY_PAGE__');
    expect(printIndex(INDEX, opts)).not.toContain('print-only.md');
  });

  it('replaces markers with their file when injecting (PDF)', () => {
    expect(printIndex(INDEX, { ...opts, includeInjected: true })).toContain('  - dist/.book-kit/print-src/print-only.md');
  });
});
