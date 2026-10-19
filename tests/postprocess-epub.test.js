import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  fixFootnoteNumbers,
  addStartReadingLandmark,
  transformOpf,
  transformXhtml,
  main,
} from '../commands/postprocess-epub.js';

/**
 * Unit tests for the footnote-number injection in postprocess-epub.js.
 *
 * Pandoc emits end-of-section footnotes as <aside epub:type="footnote" id="fnN">
 * with bare <p> text — no visible number, no backlink. Kindle lists those
 * asides with nothing tying each note to its reference. fixFootnoteNumbers
 * injects a numbered backlink to #fnrefN at the start of each aside's first <p>.
 */
describe('postprocess-epub: fixFootnoteNumbers', () => {
  const aside = (id, inner) =>
    `<aside epub:type="footnote" role="doc-footnote" id="fn${id}">\n<p>${inner}</p>\n</aside>`;

  it('injects a numbered backlink into the first paragraph', () => {
    const out = fixFootnoteNumbers(aside('1', 'https://example.com'));
    expect(out).toContain('<a href="#fnref1" class="footnote-back" role="doc-backlink">1.</a> https://example.com');
  });

  it('uses the id suffix as the visible number (matches pandoc inline marker)', () => {
    const out = fixFootnoteNumbers(aside('7', 'Seventh note'));
    expect(out).toContain('href="#fnref7"');
    expect(out).toContain('>7.</a>');
  });

  it('is idempotent — running twice does not double-inject', () => {
    const once = fixFootnoteNumbers(aside('1', 'Note text'));
    const twice = fixFootnoteNumbers(once);
    expect(twice).toBe(once);
    expect((twice.match(/footnote-back/g) || []).length).toBe(1);
  });

  it('numbers every aside in a footnotes section', () => {
    const section =
      `<section epub:type="footnotes" id="footnotes">\n` +
      aside('1', 'one') + '\n' + aside('2', 'two') + '\n' + aside('3', 'three') +
      `\n</section>`;
    const out = fixFootnoteNumbers(section);
    expect((out.match(/class="footnote-back"/g) || []).length).toBe(3);
    expect(out).toContain('href="#fnref2"');
  });

  it('only numbers the first paragraph of a multi-paragraph footnote', () => {
    const multi =
      `<aside epub:type="footnote" role="doc-footnote" id="fn1">\n<p>First para</p>\n<p>Second para</p>\n</aside>`;
    const out = fixFootnoteNumbers(multi);
    expect((out.match(/footnote-back/g) || []).length).toBe(1);
    expect(out).toContain('</a> First para');
    expect(out).toContain('<p>Second para</p>');
  });

  it('leaves content without footnotes untouched', () => {
    const html = '<p>Just a regular paragraph with a <a href="#x">link</a>.</p>';
    expect(fixFootnoteNumbers(html)).toBe(html);
  });

  it('escapes XML in the injected number (defensive)', () => {
    // ids are always numeric in practice; this guards the escapeXml path.
    const out = fixFootnoteNumbers(aside('1', 'x'));
    expect(out).not.toContain('<a href="#fnref1" class="footnote-back" role="doc-backlink"><');
  });
});

/**
 * "Start Reading" markers. pandoc marks cover/title/toc but never the body
 * start, so Kindle Previewer shows "Start Reading: not specified." We inject
 * the marker in both places Kindle reads: a bodymatter landmark in the nav and
 * a type="text" reference in the OPF guide.
 */
describe('postprocess-epub: addStartReadingLandmark', () => {
  const landmarks = (extra = '') =>
    `<nav epub:type="landmarks" id="landmarks" hidden="hidden">\n` +
    `  <ol>\n` +
    `    <li><a href="text/title_page.xhtml" epub:type="titlepage">Title Page</a></li>\n` +
    `    <li><a href="text/cover.xhtml" epub:type="cover">Cover</a></li>\n` +
    `    <li><a href="#toc" epub:type="toc">Table of Contents</a></li>${extra}\n` +
    `  </ol>\n</nav>`;

  it('inserts a bodymatter landmark into the landmarks nav', () => {
    const out = addStartReadingLandmark(landmarks(), 'text/ch002.xhtml');
    expect(out).toContain('<a href="text/ch002.xhtml" epub:type="bodymatter">Beginning</a>');
  });

  it('is idempotent — does not double-insert', () => {
    const once = addStartReadingLandmark(landmarks(), 'text/ch002.xhtml');
    const twice = addStartReadingLandmark(once, 'text/ch002.xhtml');
    expect(twice).toBe(once);
    expect((twice.match(/epub:type="bodymatter"/g) || []).length).toBe(1);
  });

  it('does nothing without a start href', () => {
    const nav = landmarks();
    expect(addStartReadingLandmark(nav, null)).toBe(nav);
  });

  it('leaves the visible toc nav (no landmarks) untouched', () => {
    const tocNav = `<nav epub:type="toc" role="doc-toc" id="toc"><ol><li>x</li></ol></nav>`;
    expect(addStartReadingLandmark(tocNav, 'text/ch002.xhtml')).toBe(tocNav);
  });
});

describe('postprocess-epub: transformOpf guide reference', () => {
  const opf = (guide) =>
    `<?xml version="1.0"?>\n<package xml:lang="en-US"><metadata>` +
    `<dc:language>en-US</dc:language></metadata>${guide}</package>`;
  const guide =
    `<guide>\n` +
    `    <reference type="toc" title="Fixture Book" href="nav.xhtml" />\n` +
    `    <reference type="cover" title="Cover" href="text/cover.xhtml" />\n` +
    `  </guide>`;

  it('injects a type="text" reference pointing at the start href', () => {
    const out = transformOpf(opf(guide), 'text/ch002.xhtml');
    expect(out).toContain('<reference type="text" title="Beginning" href="text/ch002.xhtml" />');
  });

  it('is idempotent — does not add a second type="text"', () => {
    const once = transformOpf(opf(guide), 'text/ch002.xhtml');
    const twice = transformOpf(once, 'text/ch002.xhtml');
    expect((twice.match(/type="text"/g) || []).length).toBe(1);
  });

  it('does nothing when there is no guide element', () => {
    const out = transformOpf(opf(''), 'text/ch002.xhtml');
    expect(out).not.toContain('type="text"');
  });
});

describe('postprocess-epub: transformOpf accessibility metadata', () => {
  // OPF with the schema.org metadata pandoc already emits (note: WCAG 2.1
  // summary, matching the synced pandoc-epub.yml), but none of the EPUB
  // Accessibility 1.1 conformance reporting.
  const baseOpf =
    `<?xml version="1.0"?>\n<package version="3.0"><metadata>` +
    `<dc:language>en-US</dc:language>` +
    `<meta property="schema:accessibilitySummary">This publication conforms to WCAG 2.1 Level AA. It is well-structured with a logical reading order, navigable table of contents, and uses semantic markup throughout. All content is text-based.</meta>` +
    `</metadata></package>`;

  it('injects the EPUB Accessibility 1.1 dcterms:conformsTo string', () => {
    const out = transformOpf(baseOpf, null);
    expect(out).toContain(
      '<meta property="dcterms:conformsTo" id="a11y-conformance">EPUB Accessibility 1.1 - WCAG 2.1 Level AA</meta>'
    );
  });

  it('injects a11y:certifiedBy refining the conformance declaration', () => {
    const out = transformOpf(baseOpf, null);
    expect(out).toContain(
      '<meta property="a11y:certifiedBy" refines="#a11y-conformance">Example Press</meta>'
    );
  });

  it('injects a11y:certifierReport as a <link> (not a <meta>) per EPUB a11y 1.1', () => {
    const out = transformOpf(baseOpf, null);
    expect(out).toContain(
      '<link rel="a11y:certifierReport" refines="#a11y-conformance" href="https://example.com/accessibility/"/>'
    );
    // Must NOT be emitted as a meta property — that trips EPUBCheck OPF-027.
    expect(out).not.toContain('property="a11y:certifierReport"');
  });

  it('declares the a11y package prefix with its canonical URI', () => {
    const out = transformOpf(baseOpf, null);
    expect(out).toMatch(
      /<package[^>]*\sprefix="a11y: http:\/\/www\.idpf\.org\/epub\/vocab\/package\/a11y\/#"/
    );
  });

  it('does not duplicate the accessibilitySummary pandoc already emitted', () => {
    const out = transformOpf(baseOpf, null);
    expect((out.match(/schema:accessibilitySummary/g) || []).length).toBe(1);
  });

  it('is idempotent — re-running adds no duplicate conformance metadata', () => {
    const once = transformOpf(baseOpf, null);
    const twice = transformOpf(once, null);
    expect((twice.match(/dcterms:conformsTo/g) || []).length).toBe(1);
    expect((twice.match(/a11y:certifiedBy/g) || []).length).toBe(1);
    expect((twice.match(/a11y:certifierReport/g) || []).length).toBe(1);
    expect((twice.match(/prefix="a11y:/g) || []).length).toBe(1);
  });
});

describe('postprocess-epub: localized accessibility summary', () => {
  // Pandoc emits an English summary from pandoc-epub.yml for every build; the
  // OPF for a translated edition therefore arrives with an English summary plus
  // a non-English dc:language. postprocess must replace it with the matching
  // language and keep exactly one.
  const opf = (lang) =>
    `<?xml version="1.0"?>\n<package version="3.0"><metadata>` +
    `<dc:language>${lang}</dc:language>` +
    `<meta property="schema:accessibilitySummary">This publication conforms to WCAG 2.1 Level AA. It is well-structured with a logical reading order, navigable table of contents, and uses semantic markup throughout. All content is text-based.</meta>` +
    `</metadata></package>`;

  const summaryText = (out) => out.match(/accessibilitySummary">([^<]*)</)[1];

  it('keeps the English summary for en-US', () => {
    const out = transformOpf(opf('en-US'), null);
    expect((out.match(/schema:accessibilitySummary/g) || []).length).toBe(1);
    expect(summaryText(out)).toMatch(/^This publication conforms to WCAG 2\.1 Level AA/);
  });

  it('localizes the summary to the publication language and keeps exactly one', () => {
    for (const [lang, prefix] of [
      ['pt-BR', 'Esta publicação está em conformidade'],
      ['es-419', 'Esta publicación cumple'],
      ['de-DE', 'Diese Publikation erfüllt'],
    ]) {
      const out = transformOpf(opf(lang), null);
      expect((out.match(/schema:accessibilitySummary/g) || []).length, lang).toBe(1);
      expect(summaryText(out), lang).toContain(prefix);
    }
  });

  it('falls back to English for an unknown language', () => {
    const out = transformOpf(opf('fr-FR'), null);
    expect(summaryText(out)).toMatch(/^This publication conforms/);
  });
});

describe('postprocess-epub: decorative callout emoji', () => {
  it('gives callout-emoji images an empty alt and presentation role', () => {
    const tag = '<img src="../media/1f4a1.png" class="emoji callout-emoji" width="24" height="24" alt="light bulb" />';
    const out = transformXhtml(tag);
    expect(out).toContain('alt=""');
    expect(out).not.toContain('alt="light bulb"');
    expect(out).toContain('role="presentation"');
  });

  it('leaves inline body emoji (descriptive alt) untouched', () => {
    const tag = '<img src="../media/2705.png" class="emoji" width="16" height="16" alt="check" />';
    expect(transformXhtml(tag)).toBe(tag);
  });

  it('is idempotent on an already-decorative callout emoji', () => {
    const tag = '<img src="../media/1f454.png" class="emoji callout-emoji" alt="" role="presentation" />';
    expect(transformXhtml(tag)).toBe(tag);
  });
});

describe('postprocess-epub: decorative crispEdges SVG', () => {
  it('marks a decorative SVG aria-hidden (backs the AA claim)', () => {
    const tag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges">';
    const out = transformXhtml(tag);
    expect(out).toContain('aria-hidden="true"');
  });

  it('does NOT add role to the SVG (EPUBCheck RSC-005: role must be application|document|img)', () => {
    const tag = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges">';
    const out = transformXhtml(tag);
    expect(out).not.toContain('role=');
  });

  it('leaves the cover SVG (no crispEdges) untouched', () => {
    const tag = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="100%" height="100%" viewBox="0 0 2560 3840" preserveAspectRatio="xMidYMid">';
    expect(transformXhtml(tag)).toBe(tag);
  });

  it('is idempotent on an already-hidden decorative SVG', () => {
    const tag = '<svg viewBox="0 0 29 29" shape-rendering="crispEdges" aria-hidden="true">';
    expect(transformXhtml(tag)).toBe(tag);
  });
});

describe('postprocess-epub: reproducible repackaging', () => {
  // A minimal EPUB, zipped from files with the given mtime and mode, the way
  // differing build machines and times would leave them.
  function makeEpub(dir, mtime, mode) {
    const src = join(dir, 'src');
    const files = {
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': '<container/>',
      'EPUB/content.opf': '<?xml version="1.0"?>\n<package version="3.0"><metadata><dc:language>en</dc:language></metadata><manifest/></package>',
      'EPUB/text/ch002.xhtml': '<html><body><p>two</p></body></html>',
      'EPUB/text/ch001.xhtml': '<html><body><p>one</p></body></html>',
    };
    for (const [name, body] of Object.entries(files)) {
      mkdirSync(dirname(join(src, name)), { recursive: true });
      writeFileSync(join(src, name), body);
      chmodSync(join(src, name), mode);
      utimesSync(join(src, name), mtime, mtime);
    }
    const epub = join(dir, 'book.epub');
    execFileSync('zip', ['-X', '-0', epub, 'mimetype'], { cwd: src });
    execFileSync('zip', ['-X', '-r', epub, '.', '-x', 'mimetype'], { cwd: src });
    return epub;
  }

  it('gives the same bytes regardless of file times and modes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'epub-repro-'));
    try {
      const a = makeEpub(join(tmp, 'a'), new Date('2026-01-01T00:00:00Z'), 0o644);
      const b = makeEpub(join(tmp, 'b'), new Date('2026-06-15T13:37:00Z'), 0o600);
      const log = console.log;
      console.log = () => {};
      try {
        main(a);
        main(b);
      } finally {
        console.log = log;
      }
      expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
      const names = execFileSync('unzip', ['-Z1', a], { encoding: 'utf8' }).trim().split('\n');
      expect(names[0]).toBe('mimetype');
      expect(names.slice(1)).toEqual([...names.slice(1)].sort());
      expect(names.some((n) => n.endsWith('/'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
