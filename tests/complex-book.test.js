import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath, loadConfig } from '../lib/config.js';
import { pandocDefaults } from '../lib/pandoc.js';
import { printIndex } from '../commands/prep-print-src.js';

/**
 * tests/fixtures/complex-book is shaped like a production book: the preset
 * plus the settings real books add. CI builds it in every format; these are
 * the fast checks that its configuration resolves the way a book expects.
 */

const root = kitPath('tests', 'fixtures', 'complex-book');
const config = loadConfig({ root, fresh: true });
const bk = (...args) => spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), ...args], {
  encoding: 'utf8',
  cwd: root,
  env: { ...process.env, BOOK_ROOT: root },
});

describe('complex fixture book', () => {
  it('passes book-kit validate with no errors or warnings', () => {
    const result = bk('validate');
    expect(result.status, result.stdout).toBe(0);
    expect(result.stdout.trim()).toBe('✓ All chapters validated successfully');
  });

  it('layers the preset, then the book', () => {
    expect(config.presets.map((p) => p.name)).toEqual(['business-nonfiction']);
    expect(config.structure.required_callout).toBe('tldr');
    expect(config.callouts.map((c) => c.class)).toContain('exercise');
    const sources = bk('config', '--sources', 'structure').stdout;
    expect(sources).toMatch(/^structure\.required_callout\s+preset business-nonfiction$/m);
    expect(sources).toMatch(/^structure\.start_reading\s+book\.config\.yml$/m);
  });

  it("slots the book's filter into the EPUB chain only", () => {
    // The fixture lives inside the kit, so name the book's paths first.
    const filters = (format) => pandocDefaults(format, config).filters.map((f) => f.replace(`${root}/`, 'BOOK/').replace(`${kitPath()}/`, 'KIT/'));
    expect(filters('epub')).toEqual([
      'KIT/filters/callout-classes.lua', 'KIT/filters/revision.lua', 'KIT/filters/add-div-titles.lua',
      'BOOK/filters/mark-headings.lua', 'KIT/filters/arc-notice.lua', 'KIT/filters/strip-comments.lua',
    ]);
    expect(filters('kindle')).not.toContain('BOOK/filters/mark-headings.lua');
  });

  it('carries the retail metadata into the pandoc defaults', () => {
    const epub = pandocDefaults('epub', config);
    expect(epub.metadata['belongs-to-collection']).toBe('Example Series');
    expect(epub.metadata.accessibilitySummary).toMatch(/WCAG 2\.1 Level AA/);
    expect(pandocDefaults('pdf', config).metadata.isbn).toBe('978-0-00-000000-0');
  });

  it('drops the web-only page from print and injects the print-only page', () => {
    const index = readFileSync(join(root, 'index.yml'), 'utf8');
    const opts = { srcRel: 'src', printRel: 'dist/.book-kit/print-src', exclude: config.build.print_exclude, inject: config.build.print_inject };
    const pdf = printIndex(index, { ...opts, includeInjected: true });
    const kindle = printIndex(index, opts);
    expect(pdf).toContain('print-src/print-only.md');
    expect(pdf).not.toContain('web-only');
    expect(kindle).not.toContain('print-only');
    expect(kindle).not.toContain('web-only');
  });

  it("lists the book's own callout in its conventions", () => {
    const out = bk('conventions').stdout;
    expect(out).toContain('`.exercise` (label "Exercise:")');
    expect(out).toContain('business-nonfiction house style');
  });

  it("lints with the book's own .textlintrc, passing options through", () => {
    // Escape hatch: the book's config plus every kit rule. --format json is an
    // option with a value; it must reach textlint intact, with the chapters
    // still added.
    const result = bk('prose', '--format', 'json');
    expect(result.status, result.stderr).toBe(0);
    const files = JSON.parse(result.stdout).map((r) => r.filePath.replace(`${root}/`, ''));
    expect(files).toContain('src/web-only.md');
    expect(files).toContain('src/print-only.md');
  }, 60_000);

  it('passes markdownlint, with options passed through', () => {
    const result = bk('markdownlint', '--no-globs');
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/Linting: \d+ file/);
  }, 60_000);
});
