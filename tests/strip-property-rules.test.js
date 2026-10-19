import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

const script = kitPath('commands', 'strip-property-rules.js');

function run(...args) {
  return spawnSync('node', [script, ...args], { encoding: 'utf8' });
}

describe('strip-property-rules', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  function fixture(html) {
    dir = mkdtempSync(join(tmpdir(), 'strip-property-'));
    const file = join(dir, 'book.html');
    writeFileSync(file, html);
    return file;
  }

  it('removes every @property block from inlined styles and keeps other rules', () => {
    const file = fixture(
      '<style>@property --tw-a { syntax: "*"; inherits: false; }\n' +
        'body { color: red; }\n' +
        '@property --tw-b{syntax:"<length>";initial-value:0}</style>',
    );
    const result = run(file);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Stripped 2 @property rule(s)');
    expect(readFileSync(file, 'utf8')).toBe('<style>\nbody { color: red; }\n</style>');
  });

  it('ends each block at its own closing brace, even with nested braces', () => {
    const file = fixture('<style>@property --x { a: 1; { b: 2; } } p { margin: 0; }</style>');
    run(file);
    expect(readFileSync(file, 'utf8')).toBe('<style> p { margin: 0; }</style>');
  });

  it('leaves @property outside <style> blocks alone', () => {
    const html = '<p>Write @property --x { } in your CSS.</p><style>p { margin: 0; }</style>';
    const file = fixture(html);
    expect(run(file).stdout).toContain('Stripped 0 @property rule(s)');
    expect(readFileSync(file, 'utf8')).toBe(html);
  });

  it('keeps a truncated rule verbatim rather than dropping the rest', () => {
    const html = '<style>p { margin: 0; } @property --x</style>';
    const file = fixture(html);
    run(file);
    expect(readFileSync(file, 'utf8')).toBe(html);
  });

  it('prints usage and fails without a file', () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: book-kit strip-property-rules');
  });
});
