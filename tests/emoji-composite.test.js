import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The composite scripts must not rewrite an output whose pixels are already
// right. Books commit these PNGs and recompress them (`just optimize-images`);
// re-encoding identical pixels on every build left the working tree dirty.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = (name) => join(rootDir, 'commands', name);
const SAMPLE = '1f4a1.png';

const python = (...args) => execFileSync('python3', args, { encoding: 'utf8' });
// Re-encode a PNG losslessly at a different compression level, the way an
// optimizer would: same pixels, different bytes.
const recompress = (path) =>
  python('-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[1], "PNG", compress_level=1)', path);

// The scripts need Pillow. CI installs it (setup-book-kit); locally, skip with
// a pointer instead of failing on a missing module.
const hasPillow = (() => {
  try {
    python('-c', 'import PIL');
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasPillow)('emoji composite scripts (needs Pillow: pip install -r requirements.txt)', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emoji-composite-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const cases = [
    { name: 'composite-kindle-emoji.py', outs: (d) => [join(d, 'kindle')] },
    { name: 'composite-print-emoji.py', outs: (d) => [join(d, 'callout'), join(d, 'body')] },
  ];

  for (const { name, outs } of cases) {
    it(`${name} leaves recompressed outputs alone`, () => {
      const run = () => python(script(name), join(rootDir, 'emoji'), ...outs(dir));
      run();
      const files = outs(dir).map((o) => join(o, SAMPLE));
      files.forEach(recompress);
      const before = files.map((f) => readFileSync(f));

      expect(run()).toMatch(/\b0 rewritten/);
      files.forEach((f, i) => expect(readFileSync(f).equals(before[i])).toBe(true));
    });

    it(`${name} rewrites an output whose pixels changed`, () => {
      const run = () => python(script(name), join(rootDir, 'emoji'), ...outs(dir));
      run();
      // Replace the output with a different emoji: same size, different pixels.
      const [first] = outs(dir);
      copyFileSync(join(rootDir, 'emoji', '1f914.png'), join(first, SAMPLE));
      expect(run()).toMatch(/\b1 rewritten/);
    });
  }
});
