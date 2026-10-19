import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

// Filters read the resolved config from dist/.book-kit/config.json, which only
// exists after `book-kit prepare`. On a fresh checkout (a book's tests calling
// a filter directly, or pandoc run by hand) they must fall back to asking the
// CLI rather than erroring.
describe('filter config without a prepared build', () => {
  it('a filter loads the config from the CLI when config.json is missing', () => {
    const out = execFileSync(
      'pandoc',
      ['-f', 'markdown', '-t', 'html', `--lua-filter=${kitPath('filters', 'add-div-titles.lua')}`],
      {
        cwd: kitPath('example'),
        input: '::: {.pro-tip custom-style="pro-tip"}\nKeep it short.\n:::\n',
        encoding: 'utf8',
        env: { ...process.env, BOOK_KIT_CONFIG: join(kitPath('example'), 'no-such-dir', 'config.json') },
      },
    );
    expect(out).toContain('role="doc-notice"');
    expect(out).toContain('Pro-Tip:');
  });
});
