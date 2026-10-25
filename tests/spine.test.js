import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { calipers, parseCalipers, wrap, KDP_CALIPER } from '../commands/spine.js';
import { kitPath } from '../lib/config.js';

describe('spine: wrap', () => {
  it('adds bleed, both covers, and the spine', () => {
    // 300 pages on KDP white: 300 × 0.002252 = 0.6756 in.
    // Width: 0.125 + 6 + 0.6756 + 6 + 0.125 = 12.9256; height: 9 + 2 × 0.125.
    const r = wrap({ pages: 300, trim: [6, 9], caliper: KDP_CALIPER.white });
    expect(r.spine).toBe(0.6756);
    expect(r.width).toBe(12.9256);
    expect(r.height).toBe(9.25);
    expect(r.pixels).toEqual([3878, 2775]);
  });

  it('leaves 0.0625 in of spine-text margin on each side', () => {
    const r = wrap({ pages: 300, trim: [6, 9], caliper: KDP_CALIPER.white });
    expect(r.spineTextWidth).toBe(0.5506);
  });

  it('gives a different spine for a thinner paper', () => {
    const kdp = wrap({ pages: 500, trim: [6, 9], caliper: 0.002252 });
    const other = wrap({ pages: 500, trim: [6, 9], caliper: 0.002 });
    expect(other.spine).toBe(1);
    expect(kdp.spine).toBe(1.126);
  });

  it('never reports a negative spine-text width', () => {
    expect(wrap({ pages: 24, trim: [5, 8], caliper: 0.002252 }).spineTextWidth).toBe(0);
  });
});

describe('spine: calipers', () => {
  it('starts with KDP for the chosen paper', () => {
    expect(calipers('cream')).toEqual({ kdp: 0.0025 });
  });

  it('adds and overrides printers', () => {
    expect(calipers('white', { other: 0.002, kdp: 0.0023 })).toEqual({ kdp: 0.0023, other: 0.002 });
  });

  it('rejects an unknown paper', () => {
    expect(() => calipers('glossy')).toThrow(/unknown paper "glossy"/);
  });

  it('rejects a caliper that is not a positive number', () => {
    expect(() => calipers('white', { other: 'thin' })).toThrow(/caliper for other/);
    expect(() => calipers('white', { other: 0 })).toThrow(/caliper for other/);
  });

  it('parses --caliper printer=inches', () => {
    expect(parseCalipers(['other=0.002', 'third=0.0021'])).toEqual({ other: 0.002, third: 0.0021 });
    expect(() => parseCalipers(['other'])).toThrow(/printer=inches/);
  });
});

describe('spine: CLI', () => {
  function run(config, args) {
    const dir = mkdtempSync(join(tmpdir(), 'spine-'));
    writeFileSync(join(dir, 'book.config.yml'), config);
    return spawnSync('node', [kitPath('bin/book-kit.js'), 'spine', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: dir },
    });
  }

  it('reads page count, trim, and extra printers from the config', () => {
    const result = run('print:\n  page_count: 300\n  caliper:\n    other: 0.002\n', ['--json']);
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.pages).toBe(300);
    expect(out.printers.kdp.spine).toBe(0.6756);
    expect(out.printers.other.spine).toBe(0.6);
  });

  it('lets --pages override the config and warns on an odd count', () => {
    const result = run('print:\n  page_count: 300\n', ['--pages', '301']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('301 pages (from --pages)');
    expect(result.stdout).toMatch(/301 is odd/);
  });

  it('explains how to supply a page count when there is none', () => {
    const result = run('print:\n  page_count: null\n', []);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/pass --pages, set print.page_count/);
  });
});
