// The reusable workflow calls the kit's own actions at the floating tag the
// release workflow moves (vMAJOR.MINOR before 1.0, vMAJOR after). Keep those
// refs, and the README's, in step with package.json's version.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kitPath } from '../lib/config.js';

const { version } = JSON.parse(readFileSync(kitPath('package.json'), 'utf8'));
const [major, minor] = version.split('.');
const floating = major === '0' ? `v0.${minor}` : `v${major}`;

describe('floating release tag', () => {
  for (const file of ['.github/workflows/build.yml', '.github/workflows/parity.yml', 'README.md']) {
    it(`${file} references benbalter/book-kit at ${floating}`, () => {
      const refs = [...readFileSync(kitPath(file), 'utf8').matchAll(/benbalter\/book-kit\/[^\s@]+@(\S+)/g)].map((m) => m[1]);
      expect(refs.length).toBeGreaterThan(0);
      expect(new Set(refs)).toEqual(new Set([floating]));
    });
  }
});
