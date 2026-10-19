// Scans the kit for book-specific data and credentials (tests/privacy-scan.js
// holds the hashed denylist and how to add to it).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { kitPath } from '../lib/config.js';
import { forbidden, sha256 } from './privacy-scan.js';

// Tracked and staged files, plus untracked ones that aren't ignored.
function files() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: kitPath(),
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/\.(woff2|png|jpe?g|icc|pdf|epub)$/.test(f))
    .filter((f) => f !== 'package-lock.json');
}

describe('privacy', () => {
  it('ships no book-specific data or credentials', () => {
    const hits = [];
    for (const file of files()) {
      let text;
      try {
        text = readFileSync(kitPath(file), 'utf8');
      } catch {
        continue; // deleted in the working tree
      }
      text.split('\n').forEach((line, i) => {
        if (forbidden(line)) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('catches each kind of forbidden text', () => {
    // A placeholder ISBN and plain prose pass; credentials don't.
    expect(forbidden('ISBN 978-0-00-000000-0, published by Example Press.')).toBe(false);
    expect(forbidden(`token ghp_${'a'.repeat(30)}`)).toBe(true);
    expect(forbidden(['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' '))).toBe(true); // split so this file passes its own scan
    // The number-prefix check works through hyphens: hash of digits:123456.
    expect(sha256('digits:123456')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('adds terms from BOOK_KIT_PRIVACY_TERMS', () => {
    const script = `import('${kitPath()}/tests/privacy-scan.js').then(({ forbidden }) => console.log([
      forbidden('The Placeholder Title, chapter one'), forbidden('ISBN 123-4-56-000000-0'), forbidden('plain prose'),
    ].join()))`;
    const out = execFileSync(process.execPath, ['-e', script], {
      encoding: 'utf8', env: { ...process.env, BOOK_KIT_PRIVACY_TERMS: 'placeholder title, digits:123456' },
    });
    expect(out.trim()).toBe('true,true,false');
  });
});
