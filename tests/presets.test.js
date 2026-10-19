import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as yaml from 'js-yaml';
import { configSources, kitPath, kitPresets, loadConfig } from '../lib/config.js';

/**
 * Presets: config layered between the kit defaults and the book, named in
 * `extends` (lib/config.js).
 */

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// A temp tree from { 'relative/path': yamlObject | string }.
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'book-kit-presets-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : yaml.dump(content));
  }
  return root;
}

const load = (root) => loadConfig({ root, fresh: true });

describe('extends', () => {
  it('layers a preset between the kit defaults and the book', () => {
    const root = tree({
      'book.config.yml': { extends: './house', metadata: { title: 'Mine' } },
      'house/preset.yml': { metadata: { title: 'House', publisher: 'House Press' }, output: { basename: 'house' } },
    });
    const config = load(root);
    expect(config.metadata.title).toBe('Mine');
    expect(config.metadata.publisher).toBe('House Press');
    expect(config.output.basename).toBe('house');
    expect(config.output.pdfx_suffix).toBe('-pdfx'); // still the kit default
    expect(config.extends).toBeUndefined();
  });

  it('applies a list of presets in order, later ones winning', () => {
    const root = tree({
      'book.config.yml': { extends: ['./a', './b'] },
      'a/preset.yml': { output: { basename: 'a', pdfx_suffix: '-a' } },
      'b/preset.yml': { output: { basename: 'b' } },
    });
    expect(load(root).output).toMatchObject({ basename: 'b', pdfx_suffix: '-a' });
  });

  it('lets presets extend presets, resolving paths from the preset', () => {
    const root = tree({
      'book.config.yml': { extends: './presets/child' },
      'presets/child/preset.yml': { extends: '../parent', output: { basename: 'child' } },
      'presets/parent/preset.yml': { output: { basename: 'parent', pdfx_suffix: '-parent' } },
    });
    const config = load(root);
    expect(config.output).toMatchObject({ basename: 'child', pdfx_suffix: '-parent' });
    expect(config.presets.map((p) => p.name)).toEqual(['../parent', './presets/child']);
  });

  it('applies a preset shared by two others once, where first reached', () => {
    const root = tree({
      'book.config.yml': { extends: ['./a', './b'] },
      'a/preset.yml': { extends: '../base', output: { basename: 'a' } },
      'b/preset.yml': { extends: '../base' },
      'base/preset.yml': { output: { basename: 'base' } },
    });
    // base is applied before a, and not again before b, so a's value stands.
    expect(load(root).output.basename).toBe('a');
    expect(load(root).presets.map((p) => p.name)).toEqual(['../base', './a', './b']);
  });

  it('reports a cycle', () => {
    const root = tree({
      'book.config.yml': { extends: './a' },
      'a/preset.yml': { extends: '../b' },
      'b/preset.yml': { extends: '../a' },
    });
    expect(() => load(root)).toThrow(/Preset cycle in extends/);
  });

  it('finds an npm package with a preset.yml in node_modules', () => {
    const root = tree({
      'book.config.yml': { extends: '@someone/book-style' },
      'node_modules/@someone/book-style/preset.yml': { output: { basename: 'from-npm' } },
    });
    const config = load(root);
    expect(config.output.basename).toBe('from-npm');
    expect(config.presets[0].dir).toBe(join(root, 'node_modules/@someone/book-style'));
  });

  it('names the kit presets when a preset is unknown', () => {
    const root = tree({ 'book.config.yml': { extends: 'nope' } });
    expect(() => load(root)).toThrow(/Unknown preset "nope" in extends\. Kit presets: business-nonfiction/);
  });

  it('explains a path without a preset.yml', () => {
    const root = tree({ 'book.config.yml': { extends: './missing' } });
    expect(() => load(root)).toThrow(/has no preset\.yml/);
  });

  it('rejects a non-string entry', () => {
    const root = tree({ 'book.config.yml': { extends: [{ name: 'x' }] } });
    expect(() => load(root)).toThrow(/extends entries must be preset names or paths/);
  });

  it('has no presets without extends', () => {
    const root = tree({ 'book.config.yml': { metadata: { title: 'Plain' } } });
    expect(load(root).presets).toEqual([]);
  });
});

describe('configSources', () => {
  it('names the layer that set each key', () => {
    const root = tree({
      'book.config.yml': { extends: './house', metadata: { title: 'Mine' } },
      'house/preset.yml': { metadata: { publisher: 'House Press' }, callouts: [{ class: 'note' }] },
    });
    const sources = configSources({ root });
    expect(sources['metadata.title']).toBe('book.config.yml');
    expect(sources['metadata.publisher']).toBe('preset ./house');
    expect(sources.callouts).toBe('preset ./house'); // a list is one value
    expect(sources['output.basename']).toBe('kit defaults');
  });

  it('is printed by book-kit config --sources', () => {
    const root = tree({
      'book.config.yml': { extends: './house' },
      'house/preset.yml': { output: { basename: 'house' } },
    });
    const result = spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'config', '--sources', 'output'], {
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: root },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^output\.basename\s+preset \.\/house$/m);
    expect(result.stdout).toMatch(/^output\.pdfx_suffix\s+kit defaults$/m);
  });

  it('reports a bad extends in one line', () => {
    const root = tree({ 'book.config.yml': { extends: 'nope' } });
    const result = spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'config'], {
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: root },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^book-kit: Unknown preset "nope"/);
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});

describe('kit presets', () => {
  it('ships business-nonfiction', () => {
    expect(kitPresets()).toContain('business-nonfiction');
  });

  // The upgrade promise: a 0.3 book that adds `extends: business-nonfiction`
  // resolves every key 0.3 had to the value 0.3 gave it (frozen in
  // tests/fixtures/defaults-0.3.yml). Keys added since are new settings whose
  // defaults restate what was hardcoded; their own tests cover them (lint
  // configs in tests/lint.test.js, filter chains in tests/pandoc.test.js).
  it('business-nonfiction plus the kit defaults reproduces the 0.3 defaults', () => {
    const book = { metadata: { title: 'Upgraded' } };
    const old = yaml.load(readFileSync(new URL('./fixtures/defaults-0.3.yml', import.meta.url), 'utf8'));
    const upgraded = load(tree({ 'book.config.yml': { extends: 'business-nonfiction', ...book } }));

    // The upgraded config, limited to the maps' keys that `shape` has. Lists
    // and scalars compare whole.
    const onlyKeysOf = (shape, value) =>
      shape && typeof shape === 'object' && !Array.isArray(shape) && value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(shape).map((k) => [k, onlyKeysOf(shape[k], value[k])]))
        : value;

    const expected = structuredClone({ ...old, metadata: { ...old.metadata, title: 'Upgraded' } });
    // Derived defaults, as loadConfig applies them.
    expected.llm.title = 'Upgraded';
    expected.print.pdfx_title = 'Upgraded';
    const actual = onlyKeysOf(expected, structuredClone(upgraded));
    // callouts is a list, compared whole: pair_with is new (callout-balance
    // read the for-managers/for-ics pairing from code before).
    for (const callout of actual.callouts) delete callout.pair_with;
    expect(actual).toEqual(expected);

    // Severity entries 0.3 didn't have must be "on" (run as written, as a
    // missing entry did then), never a new "off" or a changed severity.
    const added = Object.entries(upgraded.validators.severity).filter(([name]) => !(name in old.validators.severity));
    for (const [name, value] of added) expect(value, name).toBe('on');
  });

  it('the neutral defaults turn every business-nonfiction validator off', () => {
    const preset = yaml.load(readFileSync(kitPath('presets', 'business-nonfiction', 'preset.yml'), 'utf8'));
    const defaults = yaml.load(readFileSync(kitPath('defaults', 'book.config.yml'), 'utf8'));
    for (const name of Object.keys(preset.validators.severity)) {
      expect(defaults.validators.severity[name], name).toBe('off');
    }
  });
});
