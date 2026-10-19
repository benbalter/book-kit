import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { deepMerge, loadConfig, outputFile, get, kitPath } from '../lib/config.js';

describe('deepMerge', () => {
  it('merges maps recursively', () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3 } })).toEqual({ a: { b: 1, c: 3 } });
  });

  it('replaces lists wholesale', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] });
  });

  it('keeps keys only the override has', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });
});

describe('loadConfig', () => {
  const config = loadConfig({ fresh: true });

  it('overlays the book config on the kit defaults', () => {
    expect(config.metadata.title).toBe('Fixture Book');
    expect(config.output.basename).toBe('book');
    expect(config.output.pdfx_suffix).toBe('-pdfx');
    expect(config.paths.src).toBe('src');
  });

  it('derives defaults that point at other keys', () => {
    expect(config.llm.title).toBe('Fixture Book');
    expect(config.accessibility.certified_by).toBe('Example Press');
    expect(config.print.pdfx_title).toBe('Fixture Book');
  });

  it('ships neutral callouts by default', () => {
    const defaults = yaml.load(readFileSync(kitPath('defaults', 'book.config.yml'), 'utf8'));
    expect(defaults.callouts.map((c) => c.class)).toEqual(['note', 'tip', 'warning']);
    expect(defaults.structure.required_callout).toBeNull();
  });

  it('gets the six business-nonfiction callouts from the preset', () => {
    expect(config.callouts.map((c) => c.class)).toEqual([
      'tldr',
      'pro-tip',
      'for-managers',
      'for-ics',
      'common-objection',
      'takeaways',
    ]);
  });

  it('resolves output files under dist with the basename', () => {
    expect(outputFile('-kindle.epub', config)).toBe(`${config.root}/dist/book-kindle.epub`);
  });

  it('looks up dotted keys', () => {
    expect(get(config, 'metadata.title')).toBe('Fixture Book');
    expect(get(config, 'nope.missing')).toBeUndefined();
  });

  it('resolves kit paths inside the package', () => {
    expect(kitPath('defaults', 'book.config.yml')).toMatch(/defaults\/book\.config\.yml$/);
  });
});
