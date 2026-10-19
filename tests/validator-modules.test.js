import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as yaml from 'js-yaml';
import { kitPath, loadConfig } from '../lib/config.js';
import { optionsFor } from '../lib/validate.js';
import { BUILTIN_VALIDATORS } from '../validators/index.js';
import {
  listValidators,
  loadPlugins,
  loadPresetValidators,
  resolvePlugin,
  validateDoubledWords,
  validateHypotheticalHooks,
  validateParagraphLength,
  validateSentenceStarters,
  validateTldrLength,
  VALIDATORS,
} from '../commands/validate.js';
import { calloutPairs, validateCalloutBalance } from '../validators/callout-balance.js';
import { auditChapterLengths } from '../commands/audit-chapter-lengths.js';

/**
 * Built-in validators as modules with the plugin interface
 * ({ name, tags, defaults, run(ctx) }), plus preset validators, npm-package
 * plugins, per-validator options, and `validate --list --verbose`.
 */

// The run order before validators became modules (commands/validate.js's
// VALIDATORS array, with the per-chapter check first). Output order depends
// on it, so it's frozen here.
const ORDER = [
  'chapter',
  'section-intros',
  'section-intro-no-tldr',
  'section-intro-has-lead',
  'section-intro-final-lead',
  'no-transition-todos',
  'no-todo-markers',
  'no-bare-url-link-text',
  'min-opener-length',
  'chapter-lengths',
  'cross-references',
  'index-integrity',
  'smallcaps',
  'escaped-smallcaps',
  'callout-balance',
  'tldr-length',
  'duplicate-headings',
  'acronym-expansion',
  'em-dashes',
  'number-range-dashes',
  'quote-punctuation',
  'doubled-words',
  'callout-divs',
  'callout-labels',
  'footnotes',
  'heading-hierarchy',
  'sentence-starters',
  'list-punctuation',
  'bold-keywords',
  'hypothetical-hooks',
  'paragraph-length',
];

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// A temp tree from { 'relative/path': yamlObject | string }.
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'book-kit-validators-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : yaml.dump(content));
  }
  return root;
}

// A minimal book: one chapter listed in index.yml.
function book(config, chapter = '# One\n\nA chapter.\n', extra = {}) {
  return tree({
    'book.config.yml': config,
    'index.yml': { 'input-files': ['src/one.md'] },
    'src/one.md': chapter,
    ...extra,
  });
}

function validate(root, ...args) {
  return spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'validate', ...args], {
    encoding: 'utf8',
    env: { ...process.env, BOOK_ROOT: root },
  });
}

const plugin = (name, message) =>
  `export default { name: '${name}', tags: ['custom'], run: () => ({ errors: [], warnings: ['${message}'] }) };\n`;

// Run fn with the working directory set to a temp tree.
function inTree(files, fn) {
  const root = tree(files);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    return fn();
  } finally {
    process.chdir(cwd);
  }
}

describe('built-in validator modules', () => {
  it('each export default { name, tags, defaults, run }', () => {
    for (const validator of BUILTIN_VALIDATORS) {
      expect(typeof validator.name, validator.name).toBe('string');
      expect(existsSync(kitPath('validators', `${validator.name}.js`)), validator.name).toBe(true);
      expect(validator.tags.length, validator.name).toBe(1);
      expect(['structure', 'style'], validator.name).toContain(validator.tags[0]);
      expect(validator.defaults, validator.name).toBeTypeOf('object');
      expect(validator.run, validator.name).toBeTypeOf('function');
    }
  });

  it('live in validators/<name>.js', async () => {
    for (const validator of BUILTIN_VALIDATORS) {
      const mod = await import(kitPath('validators', `${validator.name}.js`));
      expect(mod.default).toBe(validator);
    }
  });

  it('run in the original order', () => {
    expect(BUILTIN_VALIDATORS.map((v) => v.name)).toEqual(ORDER);
    expect(VALIDATORS.map(([name]) => name)).toEqual(ORDER.slice(1));
  });

  it('tag exactly the checks the kit defaults turn off as style', () => {
    const defaults = yaml.load(readFileSync(kitPath('defaults', 'book.config.yml'), 'utf8'));
    const off = Object.entries(defaults.validators.severity)
      .filter(([, severity]) => severity === 'off')
      .map(([name]) => name)
      .sort();
    const style = BUILTIN_VALIDATORS.filter((v) => v.tags.includes('style')).map((v) => v.name).sort();
    expect(style).toEqual(off);
  });

  it('keep VALIDATORS as [name, fn(indexFiles)] pairs', () => {
    const [, run] = VALIDATORS.find(([name]) => name === 'index-integrity');
    expect(run(['src/does-not-exist.md'])).toEqual({
      errors: ['index.yml lists a file that does not exist on disk: src/does-not-exist.md'],
      warnings: [],
    });
  });
});

describe('validator options', () => {
  it('deep-merge validators.options.<name> over the defaults', () => {
    const cfg = { validators: { options: { 'tldr-length': { max_words: 40 } } } };
    expect(optionsFor('tldr-length', { min_words: 8, max_words: 80 }, cfg)).toEqual({ min_words: 8, max_words: 40 });
    // Lists replace rather than merge.
    const lists = { validators: { options: { 'doubled-words': { allowlist: ['so'] } } } };
    expect(optionsFor('doubled-words', { allowlist: ['had', 'that'] }, lists)).toEqual({ allowlist: ['so'] });
    // A bare key (null in YAML) keeps the defaults.
    expect(optionsFor('x', { a: 1 }, { validators: { options: { x: null } } })).toEqual({ a: 1 });
  });

  it('expose today\'s thresholds as defaults', () => {
    const defaults = Object.fromEntries(BUILTIN_VALIDATORS.map((v) => [v.name, v.defaults]));
    expect(defaults['min-opener-length']).toEqual({ min_words: 60 });
    expect(defaults['tldr-length']).toEqual({ min_words: 8, max_words: 80 });
    expect(defaults['sentence-starters']).toEqual({ threshold: 3 });
    expect(defaults['doubled-words']).toEqual({ allowlist: ['had', 'that'] });
    expect(defaults['paragraph-length']).toEqual({ max_words: 120 });
    expect(defaults['chapter-lengths']).toEqual({ min_words: 500, max_words: 2500 });
    expect(defaults['hypothetical-hooks']).toEqual({ extra_patterns: [] });
  });

  it('override a threshold', () => {
    const tldr = '## Ch\n\n::: {.tldr}\nOne two three four five six seven eight nine ten.\n:::\n';
    inTree({ 'src/ch.md': tldr }, () => {
      expect(validateTldrLength(['src/ch.md']).warnings).toEqual([]);
      expect(validateTldrLength(['src/ch.md'], { min_words: 8, max_words: 5 }).warnings).toEqual([
        'TL;DR too long (10 words, max 5) in src/ch.md',
      ]);
    });

    const repeated = 'We went. We saw. We left.\n';
    inTree({ 'src/ch.md': repeated }, () => {
      expect(validateSentenceStarters(['src/ch.md']).warnings).toHaveLength(1);
      expect(validateSentenceStarters(['src/ch.md'], { threshold: 4 }, new Set()).warnings).toEqual([]);
    });

    inTree({ 'src/ch.md': 'It had had enough.\n' }, () => {
      expect(validateDoubledWords(['src/ch.md']).errors).toEqual([]);
      expect(validateDoubledWords(['src/ch.md'], { allowlist: [] }).errors).toHaveLength(1);
    });

    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    inTree({ 'src/ch.md': `## Ch\n\n${words}\n` }, () => {
      expect(validateParagraphLength(['src/ch.md']).errors).toEqual([]);
      expect(validateParagraphLength(['src/ch.md'], { max_words: 20 }, new Set()).errors).toEqual([
        'Paragraph too long (30 words, max 20) in src/ch.md:3 — split it up for skim-ability',
      ]);
    });
  });

  it('add hypothetical-hooks patterns with extra_patterns', () => {
    inTree({ 'src/ch.md': '## Ch\n\nSuppose you plant a garden.\n' }, () => {
      expect(validateHypotheticalHooks(['src/ch.md']).warnings).toEqual([]);
      expect(validateHypotheticalHooks(['src/ch.md'], { extra_patterns: ['^suppose\\b'] }, new Set()).warnings).toEqual([
        'Formulaic hypothetical opener "^suppose\\b" in src/ch.md:3 — rephrase to avoid AI-sounding hooks',
      ]);
    });
  });

  it('pass chapter-lengths options through to the audit', () => {
    const root = tree({
      'index.yml': { 'input-files': ['src/ch.md'] },
      'src/ch.md': `## Ch\n\n${'word '.repeat(50)}\n`,
    });
    const index = join(root, 'index.yml');
    expect(auditChapterLengths(index).warnings).toEqual(['Chapter too short (51 words, min 500): src/ch.md [Unknown]']);
    expect(auditChapterLengths(index, { min_words: 10, max_words: 40 }).warnings).toEqual([
      'Chapter too long (51 words, max 40): src/ch.md [Unknown]',
    ]);
  });

  it('reach validators through book.config.yml', () => {
    const root = book({}, '# One\n\nIt had had enough.\n');
    expect(validate(root).status).toBe(0);
    const strict = book({ validators: { options: { 'doubled-words': { allowlist: [] } } } }, '# One\n\nIt had had enough.\n');
    const result = validate(strict);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^Doubled word "had had" in src\/one\.md:3/m);
  });
});

describe('callout pair_with', () => {
  const registry = [
    { class: 'question', label: 'Question:', pair_with: 'answer' },
    { class: 'answer', label: 'Answer:' },
  ];

  it('derives pairs from the registry', () => {
    expect(calloutPairs(registry)).toEqual([['question', 'answer']]);
    const preset = yaml.load(readFileSync(kitPath('presets', 'business-nonfiction', 'preset.yml'), 'utf8'));
    expect(calloutPairs(preset.callouts)).toEqual([
      ['for-managers', 'for-ics'],
      ['for-ics', 'for-managers'],
    ]);
    expect(calloutPairs([{ class: 'note' }])).toEqual([]);
  });

  it('warns when a chapter has a callout without its partner', () => {
    inTree({ 'src/ch.md': '::: {.question}\nWhy?\n:::\n' }, () => {
      expect(validateCalloutBalance(['src/ch.md'], { names: {} }, new Set(), registry).warnings).toEqual([
        'src/ch.md has "Question" callout but no "Answer" callout',
      ]);
    });
    // One-way: an answer alone is fine.
    inTree({ 'src/ch.md': '::: {.answer}\nBecause.\n:::\n' }, () => {
      expect(validateCalloutBalance(['src/ch.md'], { names: {} }, new Set(), registry).warnings).toEqual([]);
    });
  });

  it('keeps the business-nonfiction messages', () => {
    inTree({ 'src/ch.md': '::: {.for-ics}\nShip it.\n:::\n' }, () => {
      expect(validateCalloutBalance(['src/ch.md']).warnings).toEqual([
        'src/ch.md has "For ICs" callout but no "For managers" callout',
      ]);
    });
  });

  it('checks nothing without pairs', () => {
    inTree({ 'src/ch.md': '::: {.question}\nWhy?\n:::\n' }, () => {
      expect(validateCalloutBalance(['src/ch.md'], {}, new Set(), [{ class: 'question' }]).warnings).toEqual([]);
    });
  });
});

describe('preset validators and plugins', () => {
  it('loads every *.js in a preset\'s validators/, sorted', async () => {
    const root = book(
      { extends: './house' },
      undefined,
      {
        'house/preset.yml': { output: { basename: 'house' } },
        'house/validators/b-second.js': plugin('second', 'from b'),
        'house/validators/a-first.js': plugin('first', 'from a'),
        'house/validators/README.md': 'not a validator',
      },
    );
    const entries = await loadPresetValidators(loadConfig({ root, fresh: true }));
    expect(entries.map((e) => [e.validator.name, e.source])).toEqual([
      ['first', 'preset ./house'],
      ['second', 'preset ./house'],
    ]);
  });

  it('rejects a preset validator without { name, run }', async () => {
    const root = book({ extends: './house' }, undefined, {
      'house/preset.yml': {},
      'house/validators/bad.js': 'export default { name: "bad" };\n',
    });
    await expect(loadPresetValidators(loadConfig({ root, fresh: true }))).rejects.toThrow(
      'Validator bad.js in preset ./house must export default { name, run(ctx) }',
    );
  });

  it('resolves plugins as book paths or npm packages', async () => {
    const root = book(
      { validators: { plugins: ['./checks/local.js', 'checks/other.mjs', 'book-kit-plugin-sample'] } },
      undefined,
      {
        'package.json': '{ "name": "a-book", "private": true }\n',
        'checks/local.js': plugin('local', 'local'),
        'checks/other.mjs': plugin('other', 'other'),
        'node_modules/book-kit-plugin-sample/package.json':
          '{ "name": "book-kit-plugin-sample", "type": "module", "main": "main.js" }\n',
        'node_modules/book-kit-plugin-sample/main.js': plugin('sample', 'from npm'),
      },
    );
    expect(resolvePlugin('./checks/local.js', root)).toBe(join(root, 'checks/local.js'));
    expect(resolvePlugin('checks/other.mjs', root)).toBe(join(root, 'checks/other.mjs'));
    expect(resolvePlugin('book-kit-plugin-sample', root)).toMatch(/node_modules\/book-kit-plugin-sample\/main\.js$/);
    const entries = await loadPlugins(loadConfig({ root, fresh: true }));
    expect(entries.map((e) => [e.validator.name, e.source])).toEqual([
      ['local', 'plugin ./checks/local.js'],
      ['other', 'plugin checks/other.mjs'],
      ['sample', 'plugin book-kit-plugin-sample'],
    ]);
  });

  it('explains a plugin package that isn\'t installed', () => {
    const root = book({});
    expect(() => resolvePlugin('book-kit-plugin-missing', root)).toThrow(/isn't installed in the book/);
  });

  it('runs built-ins, then preset validators, then plugins, with options', () => {
    const root = book(
      {
        extends: './house',
        validators: {
          plugins: ['book-kit-plugin-sample'],
          options: { sample: { word: 'configured' } },
          severity: { first: 'error' },
        },
      },
      '# One\n\nA [broken link](#nowhere).\n',
      {
        'house/preset.yml': {},
        'house/validators/first.js': plugin('first', 'from the preset'),
        'node_modules/book-kit-plugin-sample/package.json': '{ "name": "book-kit-plugin-sample", "main": "main.mjs" }\n',
        'node_modules/book-kit-plugin-sample/main.mjs':
          "export default { name: 'sample', defaults: { word: 'default' }, run: ({ options }) => ({ errors: [], warnings: [options.word] }) };\n",
      },
    );
    const result = validate(root);
    expect(result.stdout.split('\n')).toEqual([
      'Broken cross-reference "#nowhere" in src/one.md:3',
      'from the preset',
      'Warning: configured',
      '',
      '✗ Found 2 error(s)',
      'ℹ 1 warning(s)',
      '',
    ]);
    expect(result.status).toBe(1);
  });
});

describe('validate --list', () => {
  it('prints the built-in names, one per line', () => {
    const result = validate(kitPath('tests', 'fixtures', 'book'), '--list');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${ORDER.join('\n')}\n`);
  });

  it('--verbose adds severity, tags, and source in aligned columns', async () => {
    const root = book(
      { extends: './house', validators: { plugins: ['./checks/mine.js'], severity: { 'em-dashes': 'on', mine: 'warn' } } },
      undefined,
      {
        'house/preset.yml': {},
        'house/validators/house.js': plugin('house-rule', 'x'),
        'checks/mine.js': plugin('mine', 'y'),
      },
    );
    for (const flag of ['--verbose', '-v']) {
      const result = validate(root, '--list', flag);
      expect(result.status).toBe(0);
      const lines = result.stdout.trimEnd().split('\n');
      expect(lines).toHaveLength(ORDER.length + 2);
      expect(lines[0]).toMatch(/^chapter\s+default\s+structure\s+kit$/);
      expect(lines).toContainEqual(expect.stringMatching(/^cross-references\s+error\s+structure\s+kit$/));
      expect(lines).toContainEqual(expect.stringMatching(/^smallcaps\s+off\s+style\s+kit$/));
      expect(lines).toContainEqual(expect.stringMatching(/^em-dashes\s+default\s+style\s+kit$/));
      expect(lines.at(-2)).toMatch(/^house-rule\s+default\s+custom\s+preset \.\/house$/);
      expect(lines.at(-1)).toMatch(/^mine\s+warn\s+custom\s+plugin \.\/checks\/mine\.js$/);
      // Columns line up: every row's severity starts at the same offset.
      const offsets = new Set(lines.map((line) => line.search(/ (default|error|warn|off) /)));
      expect(offsets.size).toBe(1);
    }
    expect(await listValidators()).toBe(ORDER.join('\n'));
  });
});
