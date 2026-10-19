import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { kitPath } from '../lib/config.js';

// ---------------------------------------------------------------------------
// Helpers — create minimal test images entirely in memory via sharp
// ---------------------------------------------------------------------------

function createTestPng({ width = 10, height = 10, channels = 4 } = {}) {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  }).png().toBuffer();
}

function createTestJpeg({ width = 10, height = 10 } = {}) {
  return sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: { r: 0, g: 128, b: 255 },
    },
  }).jpeg({ quality: 100 }).toBuffer();
}

// ---------------------------------------------------------------------------
// 1. sharp PNG optimization — output is valid PNG
// ---------------------------------------------------------------------------

describe('sharp PNG optimization', () => {
  it('produces a valid PNG buffer from a test image', async () => {
    const src = await createTestPng();
    const optimized = await sharp(src)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer();

    // PNG magic bytes: 0x89 P N G \r \n 0x1a \n
    expect(optimized[0]).toBe(0x89);
    expect(optimized[1]).toBe(0x50); // P
    expect(optimized[2]).toBe(0x4e); // N
    expect(optimized[3]).toBe(0x47); // G
    expect(optimized.length).toBeGreaterThan(0);
  });

  it('output metadata reports PNG format', async () => {
    const src = await createTestPng();
    const optimized = await sharp(src)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer();

    const meta = await sharp(optimized).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 2. sharp JPEG optimization — output is valid JPEG
// ---------------------------------------------------------------------------

describe('sharp JPEG optimization', () => {
  it('produces a valid JPEG buffer from a test image', async () => {
    const src = await createTestJpeg();
    const optimized = await sharp(src)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    // JPEG magic bytes: 0xFF 0xD8 (SOI marker)
    expect(optimized[0]).toBe(0xff);
    expect(optimized[1]).toBe(0xd8);
    expect(optimized.length).toBeGreaterThan(0);
  });

  it('output metadata reports JPEG format', async () => {
    const src = await createTestJpeg();
    const optimized = await sharp(src)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const meta = await sharp(optimized).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 3. PNG compression settings: compressionLevel=9, adaptiveFiltering, effort
// ---------------------------------------------------------------------------

describe('PNG compression settings', () => {
  it('compressionLevel 9 produces smaller-or-equal output vs level 1', async () => {
    // Use a larger image so compression differences are measurable
    const src = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 100, g: 150, b: 200, alpha: 1 },
      },
    }).png({ compressionLevel: 1 }).toBuffer();

    const level1 = await sharp(src)
      .png({ compressionLevel: 1, adaptiveFiltering: false })
      .toBuffer();

    const level9 = await sharp(src)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer();

    expect(level9.length).toBeLessThanOrEqual(level1.length);
  });

  it('adaptiveFiltering and effort are accepted without error', async () => {
    const src = await createTestPng();
    // Should not throw
    const optimized = await sharp(src)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer();
    expect(optimized.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. JPEG compression settings: quality=85, mozjpeg=true
// ---------------------------------------------------------------------------

describe('JPEG compression settings', () => {
  it('quality 85 produces smaller output than quality 100', async () => {
    // Use a larger image with varied content
    const src = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 120, g: 80, b: 200 },
      },
    }).jpeg({ quality: 100 }).toBuffer();

    const q100 = await sharp(src).jpeg({ quality: 100 }).toBuffer();
    const q85 = await sharp(src).jpeg({ quality: 85, mozjpeg: true }).toBuffer();

    expect(q85.length).toBeLessThan(q100.length);
  });

  it('mozjpeg option is accepted without error', async () => {
    const src = await createTestJpeg();
    const optimized = await sharp(src)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    expect(optimized.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Skip-if-larger logic — keep original when optimized is not smaller
// ---------------------------------------------------------------------------

describe('skip-if-larger logic', () => {
  it('keeps original size when optimized is not smaller', async () => {
    const src = await createTestPng();
    const optimized = await sharp(src)
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toBuffer();

    const before = src.length;
    const after = optimized.length;

    // Simulate the script logic: only update when optimized < before
    let totalBefore = 0;
    let totalAfter = 0;

    if (after < before) {
      totalBefore += before;
      totalAfter += after;
    } else {
      // Script keeps the original — totalAfter gets the ORIGINAL size
      totalBefore += before;
      totalAfter += before;
    }

    // When not smaller, totalAfter must equal totalBefore (no savings)
    if (after >= before) {
      expect(totalAfter).toBe(totalBefore);
    }
  });

  it('records savings when optimized IS smaller', async () => {
    // Create a large, poorly-compressed JPEG that sharp can improve
    const src = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 120, g: 80, b: 200 },
      },
    }).jpeg({ quality: 100 }).toBuffer();

    const optimized = await sharp(src)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const before = src.length;
    const after = optimized.length;

    let totalBefore = 0;
    let totalAfter = 0;

    if (after < before) {
      totalBefore += before;
      totalAfter += after;
    } else {
      totalBefore += before;
      totalAfter += before;
    }

    // For large quality-100 → quality-85 mozjpeg, expect actual savings
    expect(after).toBeLessThan(before);
    expect(totalAfter).toBeLessThan(totalBefore);
    expect(totalBefore - totalAfter).toBeGreaterThan(0);
  });

  it('percentage calculation is correct', () => {
    // Mirror the script's summary math
    const totalBefore = 10000;
    const totalAfter = 8500;
    const saved = totalBefore - totalAfter;
    const pct = totalBefore > 0
      ? ((saved / totalBefore) * 100).toFixed(1)
      : '0.0';

    expect(saved).toBe(1500);
    expect(pct).toBe('15.0');
  });

  it('handles zero total gracefully', () => {
    const totalBefore = 0;
    const totalAfter = 0;
    const saved = totalBefore - totalAfter;
    const pct = totalBefore > 0
      ? ((saved / totalBefore) * 100).toFixed(1)
      : '0.0';

    expect(pct).toBe('0.0');
  });
});

// ---------------------------------------------------------------------------
// 6. Target directories — verify the target array structure
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. Missing directory handling — non-existent dirs silently skipped
// ---------------------------------------------------------------------------

describe('missing directory handling', () => {
  it('readdirSync on non-existent directory throws (proving try/catch is needed)', () => {
    expect(() => readdirSync('/nonexistent-dir-abc123')).toThrow();
  });

  it('script pattern: try/catch + continue silently skips missing dirs', () => {
    const fakeDirs = [
      { dir: '/no-such-directory-xyz', glob: '.png' },
      { dir: '/also-missing-qwerty', glob: '.jpg' },
    ];

    let processedTargets = 0;
    let skippedTargets = 0;

    for (const { dir, glob } of fakeDirs) {
      let files;
      try {
        files = readdirSync(dir).filter(f => extname(f).toLowerCase() === glob);
      } catch {
        skippedTargets++;
        continue;
      }
      processedTargets += files.length;
    }

    expect(skippedTargets).toBe(2);
    expect(processedTargets).toBe(0);
  });

});

// ---------------------------------------------------------------------------
// 8. File extension filtering — only matching extensions processed
// ---------------------------------------------------------------------------

describe('file extension filtering', () => {
  it('extname().toLowerCase() correctly identifies .png files', () => {
    const files = ['icon.png', 'photo.jpg', 'image.PNG', 'doc.txt', 'logo.png'];
    const pngFiles = files.filter(f => extname(f).toLowerCase() === '.png');
    expect(pngFiles).toEqual(['icon.png', 'image.PNG', 'logo.png']);
  });

  it('extname().toLowerCase() correctly identifies .jpg files', () => {
    const files = ['photo.jpg', 'icon.png', 'cover.JPG', 'banner.jpeg'];
    const jpgFiles = files.filter(f => extname(f).toLowerCase() === '.jpg');
    expect(jpgFiles).toEqual(['photo.jpg', 'cover.JPG']);
  });

  it('extname().toLowerCase() correctly identifies .jpeg files', () => {
    const files = ['cover.jpeg', 'photo.jpg', 'hero.JPEG', 'icon.png'];
    const jpegFiles = files.filter(f => extname(f).toLowerCase() === '.jpeg');
    expect(jpegFiles).toEqual(['cover.jpeg', 'hero.JPEG']);
  });

  it('filters out non-image files', () => {
    const files = ['readme.md', 'style.css', 'data.json', 'icon.png'];
    const pngFiles = files.filter(f => extname(f).toLowerCase() === '.png');
    expect(pngFiles).toEqual(['icon.png']);
    expect(pngFiles).not.toContain('readme.md');
    expect(pngFiles).not.toContain('style.css');
  });

  it('handles files with no extension', () => {
    const files = ['Makefile', 'LICENSE', 'icon.png'];
    const pngFiles = files.filter(f => extname(f).toLowerCase() === '.png');
    expect(pngFiles).toEqual(['icon.png']);
  });

  it('handles dotfiles', () => {
    const files = ['.gitignore', '.hidden.png', 'icon.png'];
    const pngFiles = files.filter(f => extname(f).toLowerCase() === '.png');
    expect(pngFiles).toEqual(['.hidden.png', 'icon.png']);
  });

});

// ---------------------------------------------------------------------------
// The command itself, run on a throwaway book
// ---------------------------------------------------------------------------

describe('book-kit optimize-images', () => {
  // A book whose img/ (and img/emoji/) hold the given files.
  function book(files) {
    const root = mkdtempSync(join(tmpdir(), 'optimize-images-'));
    writeFileSync(join(root, 'book.config.yml'), 'metadata:\n  title: T\n');
    for (const [name, data] of Object.entries(files)) {
      mkdirSync(join(root, 'img', ...name.split('/').slice(0, -1)), { recursive: true });
      writeFileSync(join(root, 'img', ...name.split('/')), data);
    }
    return root;
  }

  function run(root) {
    return spawnSync('node', [kitPath('commands', 'optimize-images.js')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, BOOK_ROOT: root },
    });
  }

  it('recompresses PNGs in img/ and img/emoji/, and exits 0', async () => {
    // Uncompressed, so there's something to save.
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const root = book({ 'cover.png': png, 'emoji/1f44d.png': png });
    try {
      const r = run(root);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/Optimized 2 images/);
      const after = readFileSync(join(root, 'img', 'cover.png'));
      expect(after.length).toBeLessThan(png.length);
      expect((await sharp(after).metadata()).format).toBe('png');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits non-zero when an image fails, after processing the rest', async () => {
    const good = await createTestPng();
    const root = book({ 'good.png': good, 'emoji/broken.png': Buffer.from('not a png') });
    try {
      const r = run(root);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/broken\.png: error/);
      expect(r.stdout).toMatch(/Optimized 1 images/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('leaves JPEGs alone (sharp would drop the JFIF marker pandoc needs)', async () => {
    const jpeg = await createTestJpeg();
    const root = book({ 'cover.jpeg': jpeg });
    try {
      const r = run(root);
      expect(r.status).toBe(0);
      expect(readFileSync(join(root, 'img', 'cover.jpeg')).equals(jpeg)).toBe(true);
      expect(r.stdout).toMatch(/Optimized 0 images/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is a no-op for a book with no img/ directory', () => {
    const root = book({});
    try {
      const r = run(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Optimized 0 images/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
