import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

const cli = kitPath('bin', 'book-kit.js');

function bookKit(args, { env = process.env, cwd } = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, cwd });
}

// Expected mistakes get one "book-kit: ..." line, not a Node stack trace.
describe('book-kit CLI errors', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('names an unknown config key', () => {
    const result = bookKit(['config', 'output.nope']);
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('book-kit: unknown config key "output.nope"');
  });

  it('still prints a known key', () => {
    const result = bookKit(['config', 'output.basename']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('book');
  });

  it('prints usage for prepare without a format', () => {
    const result = bookKit(['prepare']);
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('book-kit: usage: book-kit prepare <html|pdf|epub|kindle|docx>');
  });

  it('explains a missing book.config.yml in one line', () => {
    dir = mkdtempSync(join(tmpdir(), 'book-kit-cli-'));
    const { BOOK_ROOT: _, ...env } = process.env;
    const result = bookKit(['config'], { env, cwd: dir });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^book-kit: No book\.config\.yml found/);
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });

  it('names the runner a command needs when it is missing', () => {
    // An empty PATH hides python3 (and everything else) from the child.
    const result = bookKit(['composite-kindle-emoji'], { env: { ...process.env, PATH: '' } });
    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('book-kit: python3 not found (needed by composite-kindle-emoji)');
  });
});

describe('book-kit parity WORK_DIR', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it('refuses a non-empty WORK_DIR instead of deleting it', () => {
    dir = mkdtempSync(join(tmpdir(), 'book-kit-parity-'));
    const work = join(dir, 'dist');
    mkdirSync(work);
    writeFileSync(join(work, 'keep.txt'), 'precious');
    const result = bookKit(['parity', join(dir, 'a'), join(dir, 'b'), work]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("isn't empty");
    expect(existsSync(join(work, 'keep.txt'))).toBe(true);
  });
});
