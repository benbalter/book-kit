#!/usr/bin/env node

/**
 * Optimize images for EPUB/Kindle builds using sharp.
 * - Losslessly recompresses PNGs (emoji and img/)
 * - Reports size savings, and exits non-zero if any image failed
 *
 * Usage: book-kit optimize-images
 */

import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathFor } from '../lib/config.js';

const imgDir = pathFor('img');

// PNG only. The cover JPEG is deliberately excluded: sharp/libvips writes JPEGs
// without the JFIF APP0 marker (they start FF D8 FF DB, not FF D8 FF E0), and
// pandoc's image reader needs that marker — without it the EPUB build warns
// "could not determine image size" and embeds the cover with no dimensions.
// Optimize the cover out-of-band with a JFIF-preserving encoder instead, e.g.:
//   magick cover.jpeg -strip -interlace none -quality 85 cover.jpeg
const targets = [
  { dir: join(imgDir, 'emoji'), glob: '.png' },
  { dir: imgDir, glob: '.png' },
];

let totalBefore = 0;
let totalAfter = 0;
let filesProcessed = 0;

for (const { dir, glob } of targets) {
  let files;
  try {
    files = readdirSync(dir).filter(f => extname(f).toLowerCase() === glob);
  } catch {
    continue;
  }

  for (const file of files) {
    const filePath = join(dir, file);
    const before = statSync(filePath).size;

    try {
      const buffer = readFileSync(filePath);
      const optimized = await sharp(buffer)
        .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
        .toBuffer();

      if (optimized.length < before) {
        writeFileSync(filePath, optimized);
        const after = optimized.length;
        const pct = ((1 - after / before) * 100).toFixed(1);
        console.log(`  ${file}: ${before} → ${after} bytes (−${pct}%)`);
        totalBefore += before;
        totalAfter += after;
      } else {
        console.log(`  ${file}: already optimal (${before} bytes)`);
        totalBefore += before;
        totalAfter += before;
      }
      filesProcessed++;
    } catch (e) {
      console.error(`  ${file}: error — ${e.message}`);
      process.exitCode = 1;
    }
  }
}

const saved = totalBefore - totalAfter;
const pct = totalBefore > 0 ? ((saved / totalBefore) * 100).toFixed(1) : '0.0';
console.log(`\nOptimized ${filesProcessed} images, saved ${saved} bytes (${pct}%)`);
