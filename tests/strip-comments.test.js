// filters/strip-comments.lua: HTML comments in the Markdown (textlint and
// markdownlint pragmas, notes to self) must not ship inside EPUB and HTML output.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

const FILTER = kitPath('filters', 'strip-comments.lua');

function pandoc(input, { from = 'markdown', to = 'html', filter = true } = {}) {
  const args = ['-f', from, '-t', to];
  if (filter) args.push(`--lua-filter=${FILTER}`);
  return execFileSync('pandoc', args, { input, encoding: 'utf8' });
}

describe('strip-comments.lua', () => {
  const source = [
    'Before.',
    '',
    '<!-- textlint-disable terminology -->',
    '',
    'A sentence with a note <!-- moved from chapter 3 --> inline.',
    '',
    '<!-- markdownlint-disable MD013 -->',
    '',
    'After.',
  ].join('\n');

  it('passes comments through without the filter (so the tests below mean something)', () => {
    expect(pandoc(source, { filter: false })).toContain('<!--');
  });

  it('drops block and inline comments from HTML', () => {
    const html = pandoc(source);
    expect(html).not.toContain('<!--');
    expect(html).toContain('Before.');
    expect(html).toContain('A sentence with a note');
    expect(html).toContain('After.');
  });

  it('drops them from EPUB XHTML too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'strip-comments-'));
    try {
      const epub = join(dir, 'book.epub');
      execFileSync('pandoc', ['-f', 'markdown', '-t', 'epub3', `--lua-filter=${FILTER}`, '--metadata', 'title=T', '-o', epub], {
        input: source,
      });
      const xhtml = execFileSync('unzip', ['-p', epub, 'EPUB/text/*.xhtml'], { encoding: 'utf8' });
      expect(xhtml).toContain('After.');
      expect(xhtml).not.toContain('<!--');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Edge cases, built as a pandoc AST so the raw nodes are exactly these.
  const native = (blocks) => pandoc(`[${blocks.join(', ')}]`, { from: 'native', to: 'native' });

  it('keeps a raw block that mixes a comment with real markup', () => {
    const out = native(['RawBlock (Format "html") "<!-- x --> <span>kept</span>"']);
    expect(out).toContain('<span>kept</span>');
  });

  it('keeps a raw block holding two comments with markup between them', () => {
    const out = native(['RawBlock (Format "html") "<!-- a --><b>kept</b><!-- c -->"']);
    expect(out).toContain('<b>kept</b>');
  });

  it('leaves raw blocks in other formats alone', () => {
    const out = native(['RawBlock (Format "latex") "<!-- not html -->"']);
    expect(out).toContain('not html');
  });

  it('drops a comment with surrounding whitespace', () => {
    const out = native(['RawBlock (Format "html") "  <!-- padded -->\\n"', 'Para [Str "kept"]']);
    expect(out).not.toContain('padded');
    expect(out).toContain('kept');
  });
});
