import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as config from '../lib/config.js';

/**
 * What books build on. Books import just/book-kit.just and override recipes,
 * reach into some of its variables and private recipes from their own
 * recipes (a recipe for a second edition of the same text, say, can reuse
 * `_prepare`, `_strip-css`, `bk`, `kit_defs`, and `work`), call kit commands
 * from scripts and CI, and import lib/config.js. Renaming any of these breaks a book that still builds today,
 * so a rename has to be deliberate: change this list in the same pull request,
 * and say so in the release notes.
 */

const kit = config.kitPath();

describe('just/book-kit.just', () => {
  const dump = JSON.parse(execFileSync('just', [
    '--justfile', `${kit}/just/book-kit.just`, '--working-directory', `${kit}/example`, '--dump', '--dump-format', 'json',
  ], { encoding: 'utf8' }));

  it('keeps every recipe books run or override', () => {
    const recipes = [
      'all', 'css', 'epub', 'kindle', 'html', 'docx', 'reference-docx', 'pdf', 'pdfx', 'arc', 'arc-epub', 'arc-kindle',
      'check-all', 'validate', 'lint', 'prose', 'check', 'epubcheck', 'key-takeaways', 'revision', 'optimize-images', 'clean',
    ];
    for (const name of recipes) expect(Object.keys(dump.recipes), name).toContain(name);
  });

  it('keeps the private recipes and variables books reuse in their own recipes', () => {
    for (const name of ['_setup', '_prepare', '_strip-css', '_emoji']) expect(Object.keys(dump.recipes), name).toContain(name);
    for (const name of ['kit', 'bk', 'kit_defs', 'dist', 'name', 'work', 'pdfx_file', 'pandoc_args', 'SOURCE_DATE_EPOCH']) {
      expect(Object.keys(dump.assignments), name).toContain(name);
    }
    // _prepare takes the format; books call it as (_prepare "epub").
    expect(dump.recipes._prepare.parameters.map((p) => p.name)).toEqual(['format']);
  });

  it('keeps the pandoc defaults files books pass with --defaults', () => {
    for (const file of ['pandoc-base.yml', 'pandoc-epub.yml', 'pandoc-epub-fonts.yml', 'pandoc-kindle.yml', 'pandoc-docx.yml']) {
      expect(existsSync(`${kit}/defaults/${file}`), file).toBe(true);
    }
  });
});

describe('book-kit commands', () => {
  const help = spawnSync(process.execPath, [`${kit}/bin/book-kit.js`, 'help'], { encoding: 'utf8' }).stdout;
  const commands = help.match(/^Commands:\s+(.*)$/m)[1].split(', ');

  it('keeps the built-ins', () => {
    expect(help).toMatch(/^Built-ins: config, prepare, revision, kit-path$/m);
  });

  it('keeps every command books call from scripts and CI', () => {
    const used = [
      'validate', 'prose', 'markdownlint', 'conventions', 'parity', 'audit-chapter-lengths',
      'check-epub-size', 'check-pdf-page-count', 'convert-pdfx', 'minify-css', 'optimize-images',
      'update-key-takeaways', 'generate-reference-docx', 'fonts', 'postprocess-epub', 'prep-print-src',
      'strip-page-rules', 'kindle-fonts', 'links-to-footnotes',
    ];
    for (const name of used) expect(commands, name).toContain(name);
  });
});

describe('lib/config.js', () => {
  it('keeps the exports books import', () => {
    for (const name of ['loadConfig', 'findBookRoot', 'kitPath', 'pathFor', 'outputFile', 'get', 'deepMerge', 'CONFIG_FILENAME']) {
      expect(config[name], name).toBeDefined();
    }
  });

  it('loadConfig({ root, fresh }) loads a given book', () => {
    const loaded = config.loadConfig({ root: `${kit}/example`, fresh: true });
    expect(loaded.metadata.title).toBe('The Example Book');
    expect(loaded.root).toBe(`${kit}/example`);
  });
});
