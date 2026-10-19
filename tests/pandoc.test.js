import { describe, it, expect } from 'vitest';
import { basename } from 'node:path';
import { epubMetadataXml, pandocDefaults } from '../lib/pandoc.js';
import { loadConfig } from '../lib/config.js';

const filterNames = (format) => pandocDefaults(format).filters.map((f) => basename(f));

describe('pandocDefaults', () => {
  it('orders the EPUB filters: labels, extras, cleanup', () => {
    expect(filterNames('epub')).toEqual(['callout-classes.lua', 'revision.lua', 'add-div-titles.lua', 'arc-notice.lua', 'strip-comments.lua']);
  });

  it('swaps emoji for images on Kindle', () => {
    expect(filterNames('kindle')).toEqual([
      'callout-classes.lua',
      'revision.lua',
      'add-div-titles.lua',
      'strip-emoji-kindle.lua',
      'arc-notice.lua',
      'strip-comments.lua',
    ]);
  });

  it('leaves callout labels to CSS in HTML', () => {
    expect(filterNames('html')).not.toContain('add-div-titles.lua');
  });

  it('uses the body emoji images for PDF', () => {
    expect(filterNames('pdf')).toEqual(['callout-classes.lua', 'revision.lua', 'add-div-titles.lua', 'body-emoji-images.lua']);
  });

  it('points at the compiled stylesheet in dist, never the Tailwind source', () => {
    expect(pandocDefaults('html').metadata.css).toBe('dist/style.css');
    expect(pandocDefaults('epub').metadata.css).toBe('dist/style-epub.css');
    expect(pandocDefaults('kindle').metadata.css).toBe('dist/style-kindle.css');
  });

  it('puts the print ISBN on print formats only', () => {
    const config = loadConfig();
    const withIsbn = { ...config, metadata: { ...config.metadata, isbn_paperback: '978-0-00-000000-0' } };
    Object.defineProperty(withIsbn, 'root', { value: config.root });
    expect(pandocDefaults('pdf', withIsbn).metadata.isbn).toBe('978-0-00-000000-0');
    expect(pandocDefaults('epub', withIsbn).metadata.isbn).toBeUndefined();
  });

  it('adds accessibility metadata to ebooks only', () => {
    expect(pandocDefaults('epub').metadata.conformsTo).toMatch(/WCAG/);
    expect(pandocDefaults('html').metadata.conformsTo).toBeUndefined();
  });

  it('omits empty metadata', () => {
    expect(pandocDefaults('html').metadata).not.toHaveProperty('subtitle');
  });

  it('honors BOOK_KIT_REVISION for reproducible builds', () => {
    process.env.BOOK_KIT_REVISION = '9.9.9 (parity)';
    try {
      expect(pandocDefaults('epub').metadata.date).toBe('9.9.9 (parity)');
    } finally {
      delete process.env.BOOK_KIT_REVISION;
    }
  });
});

describe('epubMetadataXml', () => {
  it('generates escaped Dublin Core from config', () => {
    const xml = epubMetadataXml(loadConfig());
    expect(xml).toContain('<dc:identifier id="epub-id">urn:uuid:00000000-0000-4000-8000-000000000000</dc:identifier>');
    expect(xml).toContain('<dc:publisher>Example Press</dc:publisher>');
  });

  it('falls back to the build date when there is no pub_date', () => {
    process.env.SOURCE_DATE_EPOCH = '1767225600'; // 2026-01-01
    try {
      expect(epubMetadataXml(loadConfig())).toContain('<dc:date>2026-01-01</dc:date>');
    } finally {
      delete process.env.SOURCE_DATE_EPOCH;
    }
  });

  it('requires a stable uuid', () => {
    const config = loadConfig();
    expect(() => epubMetadataXml({ ...config, metadata: { ...config.metadata, uuid: '' } })).toThrow(/metadata\.uuid/);
  });
});
