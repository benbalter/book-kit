import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitPath } from '../lib/config.js';

/**
 * `book-kit generate-reference-docx` writes the reference.docx the DOCX build
 * picks up from the book root (lib/pandoc.js). It once wrote into the kit
 * instead, where the build never looked.
 */

// python-docx comes from requirements.txt; CI's test job installs only part of it.
const hasDocx = spawnSync('python3', ['-c', 'import docx'], { encoding: 'utf8' }).status === 0;

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe.skipIf(!hasDocx)('generate-reference-docx', () => {
  it('writes reference.docx to the book root with the theme fonts', () => {
    const root = mkdtempSync(join(tmpdir(), 'book-kit-refdocx-'));
    dirs.push(root);
    writeFileSync(join(root, 'book.config.yml'), 'metadata:\n  title: Reference\n');
    const result = spawnSync(process.execPath, [kitPath('bin', 'book-kit.js'), 'generate-reference-docx'], {
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: root },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(root, 'reference.docx'))).toBe(true);
    expect(existsSync(kitPath('reference.docx'))).toBe(false);
    const styles = execFileSync('unzip', ['-p', join(root, 'reference.docx'), 'word/styles.xml'], { encoding: 'utf8' });
    expect(styles).toContain('Source Serif 4');
    expect(styles).toContain('Source Sans 3');
  });
});
