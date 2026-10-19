import { describe, it, expect } from 'vitest';

/**
 * Page-count lock for the print PDF.
 *
 * A book's page count drives the cover spine width, the gutter-margin tier,
 * and the figure given to printers. This suite covers the counting and
 * page-size logic; the gate itself is `book-kit check-pdf-page-count`
 * (`just check`), which compares the built PDF against print.page_count.
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { countPdfPages, pdfPageSizes, trimMismatches } from '../commands/check-pdf-page-count.js';

// ═══════════════════════════════════════════════════════════════════
// countPdfPages logic
// ═══════════════════════════════════════════════════════════════════

describe('check-pdf-page-count: countPdfPages', () => {
  let dir;

  function tmpPdf(name, body) {
    if (!dir) dir = mkdtempSync(join(tmpdir(), 'pdf-page-count-'));
    const p = join(dir, name);
    writeFileSync(p, body, 'latin1');
    return p;
  }

  it('counts /Type /Page objects', () => {
    const body = [
      '%PDF-1.7',
      '1 0 obj << /Type /Pages /Count 3 /Kids [2 0 R 3 0 R 4 0 R] >> endobj',
      '2 0 obj << /Type /Page /Parent 1 0 R >> endobj',
      '3 0 obj << /Type /Page /Parent 1 0 R >> endobj',
      '4 0 obj << /Type /Page /Parent 1 0 R >> endobj',
      '%%EOF',
    ].join('\n');
    expect(countPdfPages(tmpPdf('three.pdf', body))).toBe(3);
  });

  it('does not count the /Pages tree node', () => {
    // One real page plus a /Pages root — should report 1, not 2.
    const body = [
      '1 0 obj << /Type /Pages /Count 1 /Kids [2 0 R] >> endobj',
      '2 0 obj << /Type /Page /Parent 1 0 R >> endobj',
    ].join('\n');
    expect(countPdfPages(tmpPdf('one.pdf', body))).toBe(1);
  });

  it('tolerates no space between /Type and /Page', () => {
    const body = '1 0 obj <</Type/Page>> endobj\n2 0 obj <</Type/Page>> endobj';
    expect(countPdfPages(tmpPdf('nospace.pdf', body))).toBe(2);
  });

  it('throws a descriptive error when no page objects are found', () => {
    const body = '%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF';
    expect(() => countPdfPages(tmpPdf('none.pdf', body))).toThrow(
      /object streams|compressed/i
    );
  });

  it('throws when the file does not exist', () => {
    expect(() => countPdfPages(join(dir || tmpdir(), 'missing-xyz.pdf'))).toThrow();
  });

  // Cleanup
  it('cleanup tmp dir', () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Page size vs print.trim
// ═══════════════════════════════════════════════════════════════════

describe('check-pdf-page-count: page size', () => {
  it('reads each distinct /MediaBox size in points', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-page-size-'));
    const p = join(dir, 'sizes.pdf');
    writeFileSync(p, [
      '2 0 obj << /Type /Page /MediaBox [0 0 432 648] >> endobj',
      '3 0 obj << /Type /Page /MediaBox [0 0 432 648] >> endobj',
      '4 0 obj << /Type /Page /MediaBox [ 0 0 396 612 ] >> endobj',
    ].join('\n'), 'latin1');
    expect(pdfPageSizes(p)).toEqual([[432, 648], [396, 612]]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('accepts pages that match print.trim (72 points per inch)', () => {
    expect(trimMismatches([[432, 648]], [6, 9])).toEqual([]);
    expect(trimMismatches([[396.0001, 612]], [5.5, 8.5])).toEqual([]);
  });

  it('reports pages that do not match print.trim', () => {
    expect(trimMismatches([[432, 648], [612, 792]], [6, 9])).toEqual(['8.5×11 in']);
  });

  it('skips the check when print.trim is unset', () => {
    expect(trimMismatches([[612, 792]], null)).toEqual([]);
  });
});
