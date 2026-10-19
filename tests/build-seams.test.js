import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import { kitPath, loadConfig } from '../lib/config.js';
import { pandocDefaults, resolveAsset } from '../lib/pandoc.js';

/**
 * build.filters and build.templates: the filter chains and templates that
 * used to be hardcoded in lib/pandoc.js, now config a book or preset can
 * change.
 */

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function book(files) {
  const root = mkdtempSync(join(tmpdir(), 'book-kit-seams-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : yaml.dump(content));
  }
  return root;
}

const load = (root) => loadConfig({ root, fresh: true });
// EPUB defaults need a stable identifier.
const ID = { uuid: '00000000-0000-4000-8000-000000000000' };

describe('build.filters', () => {
  it('slots extra_filters where the chain says', () => {
    const config = load(book({ 'book.config.yml': { metadata: ID, build: { extra_filters: { epub: ['mine.lua'] } } } }));
    expect(pandocDefaults('epub', config).filters).toEqual([
      kitPath('filters', 'callout-classes.lua'),
      kitPath('filters', 'revision.lua'),
      kitPath('filters', 'add-div-titles.lua'),
      join(config.root, 'mine.lua'),
      kitPath('filters', 'arc-notice.lua'),
      kitPath('filters', 'strip-comments.lua'),
    ]);
  });

  it('lets a book restate a chain: drop, reorder, and add filters by path', () => {
    const config = load(book({ 'book.config.yml': { build: { filters: { html: ['./filters/first.lua', 'strip-comments'] } } } }));
    expect(pandocDefaults('html', config).filters).toEqual([
      join(config.root, 'filters/first.lua'),
      kitPath('filters', 'strip-comments.lua'),
    ]);
  });

  it("finds a bare name in a preset's filters/ before the kit's", () => {
    const config = load(book({
      'book.config.yml': { extends: './house' },
      'house/preset.yml': { build: { filters: { html: ['revision', 'house-filter', 'strip-comments'] } } },
      'house/filters/house-filter.lua': 'return {}\n',
      'house/filters/strip-comments.lua': 'return {}\n',
    }));
    expect(pandocDefaults('html', config).filters).toEqual([
      kitPath('filters', 'revision.lua'),
      join(config.root, 'house/filters/house-filter.lua'),
      join(config.root, 'house/filters/strip-comments.lua'),
    ]);
  });

  it('callout-classes gives unthemed registry callouts the generic look and a label', () => {
    const configFile = join(book({}), 'config.json');
    writeFileSync(configFile, JSON.stringify({
      callouts: [
        { class: 'note', label: 'Note:' },
        { class: 'exercise', label: 'Exercise:', emoji: '✏️' },
        { class: 'aside', label: 'Aside:', generic: false },
      ],
    }));
    const out = spawnSync('pandoc', ['-f', 'markdown', '-t', 'html', `--lua-filter=${kitPath('filters', 'callout-classes.lua')}`], {
      input: '::: note\nA.\n:::\n\n::: exercise\nB.\n:::\n\n::: aside\nC.\n:::\n',
      encoding: 'utf8',
      env: { ...process.env, BOOK_KIT_CONFIG: configFile },
    }).stdout;
    expect(out).toContain('<div class="note">');
    expect(out).toContain('<div class="exercise callout" data-label="✏️ Exercise:">');
    expect(out).toContain('<div class="aside">');
  });

  it('callout-classes lists exactly the callouts the theme styles', () => {
    // THEMED in the filter must match the classes css/theme/ styles, or a
    // themed callout would also get the generic look (or a book's would miss it).
    const lua = readFileSync(kitPath('filters', 'callout-classes.lua'), 'utf8');
    const themed = [...lua.matchAll(/\["([a-z-]+)"\] = true/g)].map((m) => m[1]).sort();
    const css = readdirSync(kitPath('css', 'theme')).map((f) => readFileSync(kitPath('css', 'theme', f), 'utf8')).join('\n');
    const styled = [...new Set([...css.matchAll(/^\s*\.([a-z-]+)\s*[,{]$/gm)].map((m) => m[1]))];
    for (const cls of themed) expect(styled, cls).toContain(cls);
    const registry = [...yaml.load(readFileSync(kitPath('defaults', 'book.config.yml'), 'utf8')).callouts,
      ...yaml.load(readFileSync(kitPath('presets', 'business-nonfiction', 'preset.yml'), 'utf8')).callouts].map((c) => c.class);
    expect(themed).toEqual([...new Set(registry)].sort());
  });

  it('names an unknown filter', () => {
    const config = load(book({ 'book.config.yml': { build: { filters: { html: ['nope'] } } } }));
    expect(() => pandocDefaults('html', config)).toThrow(/build\.filters: no filter named "nope"/);
  });
});

describe('build.templates', () => {
  it('defaults to the kit templates, none for PDF and DOCX', () => {
    const config = load(book({ 'book.config.yml': { metadata: ID } }));
    expect(pandocDefaults('epub', config).template).toBe(kitPath('templates', 'template-epub.html'));
    expect(pandocDefaults('html', config).template).toBe(kitPath('templates', 'template.html'));
    expect(pandocDefaults('pdf', config).template).toBeUndefined();
  });

  it('takes a book-relative template', () => {
    const config = load(book({ 'book.config.yml': { build: { templates: { html: './templates/mine.html' } } } }));
    expect(pandocDefaults('html', config).template).toBe(join(config.root, 'templates/mine.html'));
  });

  it("finds a preset's template by name", () => {
    const config = load(book({
      'book.config.yml': { extends: './house', metadata: ID, build: { templates: { epub: 'house.html' } } },
      'house/preset.yml': {},
      'house/templates/house.html': '$body$\n',
    }));
    expect(resolveAsset('house.html', 'templates', '', config)).toBe(join(config.root, 'house/templates/house.html'));
    expect(pandocDefaults('epub', config).template).toBe(join(config.root, 'house/templates/house.html'));
  });
});

describe('strings', () => {
  it('the ARC notice comes from strings.arc_notice', () => {
    const configFile = join(book({}), 'config.json');
    writeFileSync(configFile, JSON.stringify({ strings: { arc_notice: { heading: 'Exemplar de leitura.', body: 'Não redistribua.' } } }));
    const out = spawnSync(
      'pandoc',
      ['-f', 'markdown', '-t', 'html', '--metadata', 'arc=true', `--lua-filter=${kitPath('filters', 'arc-notice.lua')}`],
      { input: '::: {#copyright-container}\nCopyright.\n:::\n', encoding: 'utf8', env: { ...process.env, BOOK_KIT_CONFIG: configFile } },
    ).stdout;
    expect(out).toContain('<strong>Exemplar de leitura.</strong> Não redistribua.');
  });

  it('the EPUB cover label comes from strings.cover_label', () => {
    const config = load(book({ 'book.config.yml': { metadata: ID, strings: { cover_label: 'Capa do livro:' } } }));
    expect(pandocDefaults('epub', config).metadata['cover-label']).toBe('Capa do livro:');
    expect(pandocDefaults('html', config).metadata['cover-label']).toBeUndefined();
  });
});

describe('check-epub-size', () => {
  const run = (root) =>
    spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'check-epub-size', '--ci'], {
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: root },
    });

  it('uses checks.epub_max_mb and checks the ARC EPUBs when they exist', () => {
    const root = book({ 'book.config.yml': { checks: { epub_max_mb: 0.001 } } });
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist/book.epub'), Buffer.alloc(512));
    writeFileSync(join(root, 'dist/book-arc.epub'), Buffer.alloc(2048));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Budget: 1.0 KB');
    expect(result.stdout).toMatch(/dist\/book-arc\.epub:[\s\S]*❌ OVER/);
    expect(result.stdout).not.toContain('book-kindle-arc.epub');
    expect(result.stdout).toContain('1 file(s) exceeded');
  });
});
