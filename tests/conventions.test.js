import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
import { kitPath, loadConfig } from '../lib/config.js';
import { markdownlintConfig } from '../lib/lint.js';
import { isScratch } from '../lib/structure.js';

/**
 * `book-kit conventions`, which the Claude agents read instead of a hardcoded
 * house style, and structure.draft_suffix.
 */

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function book(files) {
  const root = mkdtempSync(join(tmpdir(), 'book-kit-conventions-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = join(root, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : yaml.dump(content));
  }
  return root;
}

const conventions = (root) =>
  spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'conventions'], {
    encoding: 'utf8',
    env: { ...process.env, BOOK_ROOT: root },
  });

describe('book-kit conventions', () => {
  it("prints a business-nonfiction book's callouts, checks, and the preset's CONVENTIONS.md", () => {
    const result = conventions(book({ 'book.config.yml': { extends: 'business-nonfiction', metadata: { title: 'Mine' } } }));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^# Writing conventions: Mine$/m);
    expect(result.stdout).toContain('Every chapter opens with a `.tldr` callout');
    expect(result.stdout).toContain('a chapter with one should also have `.for-ics`');
    expect(result.stdout).toContain('`just key-takeaways`');
    expect(result.stdout).toContain('`hypothetical-hooks`');
    expect(result.stdout).toContain('`no-cliches`');
    expect(result.stdout).toContain(readFileSync(kitPath('presets', 'business-nonfiction', 'CONVENTIONS.md'), 'utf8').trim());
  });

  it("prints a neutral book's callouts with no house style", () => {
    const result = conventions(book({ 'book.config.yml': { metadata: { title: 'Plain' } } }));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('- `.tip` (label "Tip:"): Tip');
    expect(result.stdout).not.toContain('tldr');
    expect(result.stdout).not.toContain('key-takeaways');
    expect(result.stdout).toContain("The kit's prose rules that run: none.");
    expect(result.stdout).not.toContain('`hypothetical-hooks`');
  });
});

describe('structure.draft_suffix', () => {
  it('names drafts for the audits, markdownlint, and conventions', () => {
    const root = book({ 'book.config.yml': { structure: { draft_suffix: '-wip' } } });
    const config = loadConfig({ root, fresh: true });
    expect(isScratch('src/chapter-wip.md', config)).toBe(true);
    expect(isScratch('src/chapter-scratch.md', config)).toBe(false);
    expect(markdownlintConfig(config).ignores[0]).toBe('**/*-wip.md');
    expect(conventions(root).stdout).toContain('drafts ending in `-wip.md`');
  });
});

describe('Claude agents', () => {
  it('read the book\'s conventions instead of hardcoding a house style', () => {
    const dir = kitPath('claude-plugin/agents');
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).toContain('book-kit conventions');
      expect(text, file).not.toMatch(/tldr|TL;DR|smallcaps|for-managers/);
    }
  });
});
