import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';
import { versionedName } from '../commands/release-files.js';

const cli = kitPath('bin', 'book-kit.js');

describe('versionedName', () => {
  it('puts the version before the extension', () => {
    expect(versionedName('/x/dist/book-kindle.epub', 'v1.2.0')).toBe('book-kindle-v1.2.0.epub');
    expect(versionedName('book.pdf', 'v1.2.0')).toBe('book-v1.2.0.pdf');
  });
});

describe('book-kit release-files', () => {
  let dir;

  function book({ version = '1.2.0', config = 'output:\n  basename: book\n', built = ['book.epub', 'book-kindle.epub', 'book.pdf', 'book-pdfx.pdf'] } = {}) {
    writeFileSync(join(dir, 'book.config.yml'), config);
    if (version !== null) writeFileSync(join(dir, 'VERSION'), `${version}\n`);
    mkdirSync(join(dir, 'dist'));
    for (const f of built) writeFileSync(join(dir, 'dist', f), `contents of ${f}`);
  }

  function run(args = []) {
    const { BOOK_ROOT: _, ...env } = process.env;
    return spawnSync(process.execPath, [cli, 'release-files', ...args], { encoding: 'utf8', env, cwd: dir });
  }

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'book-kit-release-')));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('copies each built format to a versioned name with checksums', () => {
    book();
    const r = run();
    expect(r.status).toBe(0);
    const out = join(dir, 'dist', 'release');
    expect(r.stdout.trim()).toBe(out);
    expect(readdirSync(out).sort()).toEqual([
      'book-kindle-v1.2.0.epub', 'book-pdfx-v1.2.0.pdf', 'book-v1.2.0.epub', 'book-v1.2.0.pdf', 'checksums.txt',
    ]);
    const sum = createHash('sha256').update('contents of book-kindle.epub').digest('hex');
    expect(readFileSync(join(out, 'checksums.txt'), 'utf8')).toContain(`${sum}  book-kindle-v1.2.0.epub\n`);
    // dist/ keeps its plain names.
    expect(existsSync(join(dir, 'dist', 'book-kindle.epub'))).toBe(true);
  });

  it("follows the book's basename and PDF/X suffix", () => {
    book({
      config: 'output:\n  basename: novel\n  pdfx_suffix: -printer\n',
      built: ['novel.epub', 'novel-printer.pdf'],
    });
    expect(run().status).toBe(0);
    expect(readdirSync(join(dir, 'dist', 'release')).sort()).toEqual([
      'checksums.txt', 'novel-printer-v1.2.0.pdf', 'novel-v1.2.0.epub',
    ]);
  });

  it('accepts the matching tag', () => {
    book();
    expect(run(['--tag', 'v1.2.0']).status).toBe(0);
  });

  it('fails on a tag that disagrees with VERSION', () => {
    book();
    const r = run(['--tag', 'v1.3.0']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/tag v1\.3\.0 doesn't match VERSION \(v1\.2\.0\)/);
    expect(existsSync(join(dir, 'dist', 'release'))).toBe(false);
  });

  it('fails without a VERSION file rather than releasing the default', () => {
    book({ version: null });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/a release needs the version/);
  });

  it('fails when nothing has been built', () => {
    book({ built: [] });
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/build the formats first/);
  });

  it('replaces a previous staging run', () => {
    book();
    mkdirSync(join(dir, 'dist', 'release'));
    writeFileSync(join(dir, 'dist', 'release', 'book-v1.1.0.epub'), 'stale');
    expect(run().status).toBe(0);
    expect(existsSync(join(dir, 'dist', 'release', 'book-v1.1.0.epub'))).toBe(false);
  });
});
