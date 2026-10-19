import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import { kitPath, loadConfig } from '../lib/config.js';
import { enabledRules, markdownlintConfig, namesFiles, prepareMarkdownlint, prepareTextlint, textlintConfig } from '../lib/lint.js';

/**
 * Lint configs that layer like book.config.yml (lib/lint.js): the kit's
 * mechanical base, plus lint.textlint / lint.rules / lint.markdownlint from
 * presets and the book.
 */

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// A temp book from { 'relative/path': yamlObject | string }.
function book(files) {
  const root = mkdtempSync(join(tmpdir(), 'book-kit-lint-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : yaml.dump(content));
  }
  return root;
}

const load = (root) => loadConfig({ root, fresh: true });
const readJsonc = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const KIT_RULES = ['no-ai-like-patterns', 'no-assumptive', 'no-bare-acronyms', 'no-cliches', 'no-cultural-idioms', 'no-vague-intensifiers'];

describe('business-nonfiction reproduces the 0.4 lint configs', () => {
  // Through 0.4 the kit's configs were the house style. A book on the preset
  // must lint exactly as it did (frozen copies in tests/fixtures/).
  const config = () => load(book({ 'book.config.yml': { extends: 'business-nonfiction' } }));

  it('textlint config', () => {
    expect(textlintConfig(config())).toEqual(readJsonc(new URL('./fixtures/textlintrc-0.4.json', import.meta.url)));
  });

  it('markdownlint config', () => {
    expect(markdownlintConfig(config())).toEqual(readJsonc(new URL('./fixtures/markdownlint-cli2-0.4.jsonc', import.meta.url)));
  });

  it('every kit rule, with no options', () => {
    expect(enabledRules(config()).map((r) => [r.name, r.options])).toEqual(KIT_RULES.map((name) => [name, {}]));
  });
});

describe('neutral defaults', () => {
  const config = () => load(book({ 'book.config.yml': { metadata: { title: 'Plain' } } }));

  it('enable no kit rules', () => {
    expect(enabledRules(config())).toEqual([]);
  });

  it('keep only mechanical textlint rules', () => {
    expect(Object.keys(textlintConfig(config()).rules)).not.toContain('terminology');
    expect(Object.keys(textlintConfig(config()).rules)).toContain('common-misspellings');
  });

  it('drop proper-names from markdownlint', () => {
    expect(markdownlintConfig(config()).config['proper-names']).toBeUndefined();
  });
});

describe('lint settings', () => {
  it('merge lint.textlint over the base and switch kit rules on with options', () => {
    const config = load(book({
      'book.config.yml': {
        lint: { textlint: { rules: { 'max-comma': { max: 4 } } }, rules: { 'no-cliches': { allow: ['Leverage'] }, 'no-assumptive': true } },
      },
    }));
    expect(textlintConfig(config).rules['max-comma']).toEqual({ max: 4 });
    expect(textlintConfig(config).rules['diacritics']).toBe(true);
    expect(enabledRules(config).map((r) => [r.name, r.options])).toEqual([
      ['no-assumptive', {}],
      ['no-cliches', { allow: ['Leverage'] }],
    ]);
  });

  it("turn a preset's rules on by default, and off with false", () => {
    const files = {
      'house/preset.yml': {},
      'house/rules/house-rule.js': 'export default { linter: () => ({}) };\n',
    };
    const on = load(book({ ...files, 'book.config.yml': { extends: './house' } }));
    expect(enabledRules(on).map((r) => r.name)).toEqual(['house-rule']);
    const off = load(book({ ...files, 'book.config.yml': { extends: './house', lint: { rules: { 'house-rule': false } } } }));
    expect(enabledRules(off)).toEqual([]);
  });
});

describe('prepareTextlint / prepareMarkdownlint', () => {
  it('write the config and one wrapper per enabled rule under dist/.book-kit', () => {
    const root = book({ 'book.config.yml': { lint: { rules: { 'no-cliches': { allow: ['Leverage'] } } } } });
    const { config, rulesdir } = prepareTextlint(load(root));
    expect(config).toBe(join(root, 'dist/.book-kit/textlint/textlintrc.json'));
    expect(readdirSync(rulesdir)).toEqual(['no-cliches.js']);
    const wrapper = readFileSync(join(rulesdir, 'no-cliches.js'), 'utf8');
    expect(wrapper).toContain(JSON.stringify(kitPath('rules', 'no-cliches.js')));
    expect(wrapper).toContain('{"allow":["Leverage"]}');
    expect(prepareMarkdownlint(load(root))).toBe(join(root, 'dist/.book-kit/markdownlint-cli2.jsonc'));
  });

  it("drop wrappers for rules the book has since turned off", () => {
    const root = book({ 'book.config.yml': { lint: { rules: { 'no-cliches': true } } } });
    prepareTextlint(load(root));
    writeFileSync(join(root, 'book.config.yml'), yaml.dump({ lint: { rules: { 'no-cliches': false } } }));
    const { rulesdir } = prepareTextlint(load(root));
    expect(readdirSync(rulesdir)).toEqual([]);
  });

  it("use the book's own .textlintrc and .markdownlint-cli2.jsonc as is", () => {
    const root = book({ 'book.config.yml': {}, '.textlintrc': '{}', '.markdownlint-cli2.jsonc': '{}' });
    expect(prepareTextlint(load(root))).toEqual({ config: join(root, '.textlintrc'), rulesdir: kitPath('rules') });
    expect(prepareMarkdownlint(load(root))).toBe(join(root, '.markdownlint-cli2.jsonc'));
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
});

describe('namesFiles', () => {
  const root = kitPath('example');
  it('treats .md paths, globs, and directories as files to lint', () => {
    expect(namesFiles(['src/getting-started.md'], root)).toBe(true);
    expect(namesFiles(['src/*.md'], root)).toBe(true);
    expect(namesFiles(['src'], root)).toBe(true);
  });
  it('leaves options and their values alone', () => {
    expect(namesFiles([], root)).toBe(false);
    expect(namesFiles(['--fix'], root)).toBe(false);
    expect(namesFiles(['--format', 'json'], root)).toBe(false);
    expect(namesFiles(['--format', kitPath('lib', 'textlint-github-formatter.js')], root)).toBe(false);
  });
});

describe('book-kit prose', () => {
  // A book with the fixture chapter, and the kit's node_modules standing in
  // for its own (textlint resolves packaged rules from the book).
  function proseBook(config) {
    const root = book({ 'book.config.yml': config, 'src/house-style.md': readFileSync(new URL('./fixtures/prose/house-style.md', import.meta.url), 'utf8') });
    symlinkSync(kitPath('node_modules'), join(root, 'node_modules'));
    const result = spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'prose'], {
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: root, GITHUB_ACTIONS: '' },
      cwd: root,
    });
    return result;
  }
  const ruleIds = (out) => [...new Set([...out.matchAll(/\s(no-[a-z-]+|terminology|max-comma)$/gm)].map((m) => m[1]))].sort();

  it('runs the house-style rules for a business-nonfiction book', () => {
    const result = proseBook({ extends: 'business-nonfiction' });
    expect(result.status).toBe(1);
    expect(ruleIds(result.stdout)).toEqual([...KIT_RULES, 'max-comma', 'terminology'].sort());
  }, 60_000);

  it('passes lint.rules options to the kit rules', () => {
    const result = proseBook({ extends: 'business-nonfiction', lint: { rules: { 'no-cliches': { allow: ['Leverage', 'Synergy', 'Touch base'] } } } });
    expect(result.stdout).not.toMatch(/no-cliches$/m);
    expect(result.stdout).toMatch(/no-cultural-idioms$/m);
  }, 60_000);

  it('runs none of them for a neutral book', () => {
    const result = proseBook({ metadata: { title: 'Plain' } });
    expect(result.status).toBe(0);
    expect(ruleIds(result.stdout)).toEqual([]);
  }, 60_000);
});
