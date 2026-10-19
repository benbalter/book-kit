import { describe, it, expect } from 'vitest';
import { isStructural, isStructuralSlug } from '../lib/structure.js';

const config = { structure: { structural_slugs: ['copyright', 'appendix*'] } };

describe('structural slugs', () => {
  it('matches exact slugs', () => {
    expect(isStructuralSlug('copyright', config)).toBe(true);
    expect(isStructuralSlug('copyright-2', config)).toBe(false);
  });

  it('matches a trailing * as a prefix', () => {
    expect(isStructuralSlug('appendix', config)).toBe(true);
    expect(isStructuralSlug('appendix-a', config)).toBe(true);
    expect(isStructuralSlug('the-appendix', config)).toBe(false);
  });

  it('isStructural takes a file path', () => {
    expect(isStructural('src/appendix-a.md', config)).toBe(true);
    expect(isStructural('src/first-steps.md', config)).toBe(false);
  });
});
