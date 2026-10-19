import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

/**
 * `book-kit parity` is what proves a kit or toolchain upgrade didn't change a
 * book, so it has to pass real no-op changes and fail real ones.
 */

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

// A book root (output.basename "t") with a dist/ holding an HTML file and an
// EPUB whose OPF carries the given build time.
function build(root, name, { html = '<p>Hello</p>\n', modified = '2026-01-01T00:00:00Z', chapter = '<p>One</p>' } = {}) {
  const dist = join(root, name);
  const epub = join(root, `${name}-epub`);
  mkdirSync(join(epub, 'META-INF'), { recursive: true });
  mkdirSync(join(epub, 'EPUB'), { recursive: true });
  writeFileSync(join(epub, 'mimetype'), 'application/epub+zip');
  writeFileSync(join(epub, 'META-INF', 'container.xml'), '<container/>\n');
  writeFileSync(join(epub, 'EPUB', 'content.opf'), `<package><metadata><meta property="dcterms:modified">${modified}</meta></metadata></package>\n`);
  writeFileSync(join(epub, 'EPUB', 'ch001.xhtml'), `${chapter}\n`);
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 't.html'), html);
  execFileSync('zip', ['-q', '-X', '-r', join(dist, 't.epub'), 'mimetype', 'META-INF', 'EPUB'], { cwd: epub });
  return dist;
}

function book() {
  const root = mkdtempSync(join(tmpdir(), 'book-kit-parity-'));
  dirs.push(root);
  writeFileSync(join(root, 'book.config.yml'), 'output:\n  basename: t\n');
  return root;
}

const parity = (root, a, b) =>
  spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'parity', a, b], {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, BOOK_ROOT: root },
  });

describe('book-kit parity', () => {
  it('passes identical builds', () => {
    const root = book();
    const a = build(root, 'a');
    const b = join(root, 'b');
    cpSync(a, b, { recursive: true });
    const result = parity(root, a, b);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Parity: all 2 outputs match/);
  });

  it('ignores an EPUB build timestamp', () => {
    const root = book();
    const result = parity(root, build(root, 'a'), build(root, 'b', { modified: '2026-06-01T12:00:00Z' }));
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('fails on a changed EPUB chapter', () => {
    const root = book();
    const result = parity(root, build(root, 'a'), build(root, 'b', { chapter: '<p>Two</p>' }));
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/ch001\.xhtml differs/);
  });

  it('fails on changed HTML', () => {
    const root = book();
    const result = parity(root, build(root, 'a'), build(root, 'b', { html: '<p>Goodbye</p>\n' }));
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/t\.html[\s\S]*differs/);
  });

  it('fails when one build is missing an output', () => {
    const root = book();
    const a = build(root, 'a');
    const b = build(root, 'b');
    rmSync(join(b, 't.html'));
    const result = parity(root, a, b);
    expect(result.status).not.toBe(0);
  });
});
