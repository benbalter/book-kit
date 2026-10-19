#!/usr/bin/env node

/**
 * Post-process a pandoc-generated EPUB to satisfy ACE (Ace by DAISY) checks
 * that pandoc 3.1.x cannot emit on its own:
 *
 *  1. content.opf
 *     - add `xml:lang` to the <package> element        (Ace: epub-lang)
 *     - inject schema.org accessibility metadata        (Ace: metadata-access*)
 *       The intent is already declared in book.config.yml, but pandoc ignores
 *       those keys and --epub-metadata only passes Dublin Core through, so the
 *       <meta property="schema:..."> elements never reach the OPF. We add them
 *       here.
 *
 *  2. content documents + nav
 *     - add the matching DPUB-ARIA `role` to elements pandoc stamps with an
 *       `epub:type` but no role (sections, the toc nav, noterefs, footnotes)
 *                                                        (axe: epub-type-has-matching-role)
 *     - strip `epub:type` from headings. EPUBCheck only allows
 *       doc-subtitle/heading/none/presentation/tab roles on headings, so the
 *       correct fix is to drop the redundant epub:type from the <h*> and keep
 *       it (now with a role) on the containing <section>.
 *
 *  3. "Start Reading" location (Kindle Previewer "Book Information")
 *     - pandoc's EPUB3 output marks the cover, title page, and TOC but never
 *       the start of the body, so Kindle has no "Start Reading" target and
 *       Previewer shows it as "not specified." We add the marker in BOTH places
 *       Kindle is known to read it: a `<reference type="text">` in the legacy
 *       OPF <guide> and an `epub:type="bodymatter"` entry in the landmarks nav.
 *       Both point at the first real chapter (the file holding START_READING_ANCHOR),
 *       so the reader opens on real content rather than the cover/copyright.
 *
 * The EPUB is repackaged with `mimetype` stored first (uncompressed), per the
 * OCF spec. Run after pandoc in the epub/kindle build recipes:
 *
 *   book-kit postprocess-epub dist/book.epub
 *
 * Idempotent: re-running on an already-processed EPUB makes no further changes.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { loadConfigOrDefaults } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';
import { isStructuralSlug } from '../lib/structure.js';

// epub:type -> DPUB-ARIA role. Only types that (a) ACE flags and (b) have a
// valid DPUB role belong here. Structural types without an ARIA equivalent
// (bodymatter/frontmatter/backmatter/titlepage/landmarks) are intentionally
// omitted — ACE does not require a role for them.
//
// ARIA roles are context-restricted, so the map is split by element. Structural
// roles (doc-toc, doc-prologue, …) are only valid on sectioning elements; on an
// <a> the only valid doc-* roles are link types (doc-noteref/doc-backlink/…).
// The landmarks nav, for example, contains <a epub:type="toc"> — which must NOT
// receive doc-toc (EPUBCheck RSC-005), while the real <nav epub:type="toc">
// must.
const LINK_ROLE_MAP = {
  noteref: 'doc-noteref',
};
const STRUCT_ROLE_MAP = {
  toc: 'doc-toc',
  introduction: 'doc-introduction',
  prologue: 'doc-prologue',
  conclusion: 'doc-conclusion',
  appendix: 'doc-appendix',
  afterword: 'doc-afterword',
  acknowledgements: 'doc-acknowledgments', // ARIA uses US spelling (no "e")
  footnote: 'doc-footnote',
  footnotes: 'doc-endnotes',
};

// Accessibility metadata for the OPF.
//
// The `schema:*` rows mirror the keys in pandoc-epub.yml. Pandoc DOES emit
// those keys (despite the older comment here), so this array also acts as the
// dedup baseline: transformOpf skips any [prop, value] pair pandoc already
// wrote, which is why these strings must stay byte-for-byte in sync with
// pandoc-epub.yml — a drift (e.g. WCAG 2.0 vs 2.1 summary) produces duplicate
// <meta> elements rather than a replacement.
//
// The `dcterms:conformsTo` and `a11y:*` rows are EPUB Accessibility 1.1
// conformance reporting (https://www.w3.org/TR/epub-a11y-11/#sec-conf-reporting).
// Pandoc emits NEITHER, so they are added here unconditionally. The conformsTo
// string format is spec-mandated: "EPUB Accessibility <ver> - WCAG <ver> Level
// <A|AA|AAA>". certifiedBy is required (cardinality 1+) and refines the
// conformsTo declaration; for self-certification it names the publisher.
// Amazon's Kindle panel shows features + hazards only and never renders the
// conformance/certifier rows, but Apple Books, Kobo, Google Play, and the
// IngramSpark ONIX feed do surface them — so a complete claim matters there.
//
// Optional third element is an extra attribute string for the <meta> element.
// NOTE: schema:accessibilitySummary is handled separately (localizeSummary
// below) because its text is per-language; the rows here are language-neutral.
const config = loadConfigOrDefaults();
const a11y = config.accessibility;
const A11Y_META = [
  ...a11y.access_modes.map((v) => ['schema:accessMode', v]),
  ...a11y.access_mode_sufficient.map((v) => ['schema:accessModeSufficient', v]),
  ...a11y.features.map((v) => ['schema:accessibilityFeature', v]),
  ...a11y.hazards.map((v) => ['schema:accessibilityHazard', v]),
  // The conformance claim and who certifies it are opt-in (book.config.yml).
  ...(a11y.conforms_to ? [['dcterms:conformsTo', a11y.conforms_to, 'id="a11y-conformance"']] : []),
  ...(a11y.conforms_to && a11y.certified_by ? [['a11y:certifiedBy', a11y.certified_by, 'refines="#a11y-conformance"']] : []),
];

// a11y:certifierReport points to the public accessibility statement backing the
// conformance claim (the "compliance web page"). Per EPUB Accessibility 1.1
// (https://www.w3.org/TR/epub-a11y-11/#sec-conf-reporting) it is the ONE
// certifier property expressed through a <link rel=…> element, not a <meta> —
// its value is always a URL. Emitting it as a <meta property> triggers
// EPUBCheck OPF-027 ("Undefined property"). It refines the same conformsTo id.
const A11Y_CERTIFIER_REPORT_URL = a11y.conforms_to ? a11y.conformance_url : '';

// schema:accessibilitySummary, localized by publication language. Translated
// editions must carry a summary in their own language (EU Accessibility Act /
// EPUB Accessibility best practice). Keyed by primary language subtag, matched
// against the OPF's dc:language (e.g. "pt-BR" → "pt"); unknown languages fall
// back to English. The conformsTo string stays the spec-defined English
// identifier — it is not localized.
//
// The translations come from accessibility.summary_translations in
// book.config.yml (the kit ships drafts for pt, es, and de).
const ACCESSIBILITY_SUMMARY = { ...(a11y.summary_translations ?? {}), en: a11y.summary };

/** Pick the accessibility summary for a dc:language value (e.g. "pt-BR"). */
// The built-in translations describe a WCAG 2.1 AA conformance claim, so they
// apply only when the book makes one (accessibility.conforms_to). Returns ''
// when there's no summary to emit.
function summaryForLang(lang) {
  if (!a11y.summary) return '';
  const base = String(lang || 'en').split('-')[0].toLowerCase();
  if (base === 'en' || !a11y.conforms_to) return a11y.summary;
  return ACCESSIBILITY_SUMMARY[base] || a11y.summary;
}

const HEADING_RE = /^h[1-6]$/i;

// Stable anchor for the Kindle "Start Reading" target (structure.start_reading,
// or the first non-structural file in index.yml). Anchoring on an id rather
// than a filename survives chapter renumbering: pandoc's chNNN.xhtml names
// shift when index.yml order changes; the heading id doesn't.
function startReadingAnchor() {
  if (config.structure.start_reading) return config.structure.start_reading;
  if (!config.root) return null;
  try {
    const index = yaml.load(readFileSync(path.join(config.root, config.paths.index), 'utf8'));
    const first = (index['input-files'] || [])
      .map((f) => path.basename(f, '.md'))
      .find((slug) => !isStructuralSlug(slug, config));
    return first ?? null;
  } catch {
    return null;
  }
}
const START_READING_ANCHOR = startReadingAnchor();

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Transform a single opening tag string like `<section ... epub:type="x">`. */
function transformTag(tag) {
  const nameMatch = tag.match(/^<\s*([a-zA-Z][\w:-]*)/);
  if (!nameMatch) return tag;
  const name = nameMatch[1];

  // Decorative callout-label emoji (Kindle): the 💡/👔/💻/🤔 glyph that the
  // build composites in front of a callout's injected text label ("Pro tip:",
  // "For managers:", …). The label already names the callout, so the image is
  // redundant decoration — give it an empty alt + presentation role so screen
  // readers skip it instead of announcing "light bulb Pro tip". Only targets
  // `callout-emoji`; inline body emoji keep their descriptive alt (they convey
  // authored content). Idempotent.
  if (name.toLowerCase() === 'img' && /\sclass="[^"]*\bcallout-emoji\b[^"]*"/.test(tag)) {
    let out = /\salt="/.test(tag)
      ? tag.replace(/\salt="[^"]*"/, ' alt=""')
      : tag.replace(/\s*\/?>$/, (end) => ` alt=""${end}`);
    if (!/\srole="/.test(out)) {
      out = out.replace(/\s*\/?>$/, (end) => ` role="presentation"${end}`);
    }
    return out;
  }

  // Decorative QR-code SVG (qrcode-generator output, identified by shape-rendering="crispEdges",
  // which QR renders use for sharp module edges and the cover SVG does not).
  // The same destination is a text link immediately after the code, so the QR
  // conveys nothing a screen-reader user can't already reach. Left un-named it
  // is a WCAG 2.1 SC 1.1.1 (Non-text Content) failure, which would undercut a
  // book's "WCAG 2.1 Level AA" conformance claim; aria-hidden drops the
  // graphic from the accessibility tree. NOTE: on an
  // <svg> element EPUBCheck (RSC-005) only permits role=application|document|
  // img, so we must NOT add role="presentation" here — aria-hidden alone is
  // valid and sufficient for a decorative graphic. The cover SVG is untouched:
  // it carries its accessible name via the parent <div role="img" aria-label>.
  // Idempotent.
  if (
    name.toLowerCase() === 'svg' &&
    /\sshape-rendering="crispEdges"/.test(tag) &&
    !/\saria-hidden=/.test(tag)
  ) {
    return tag.replace(/\s*\/?>$/, (end) => ` aria-hidden="true"${end}`);
  }

  const epubType = tag.match(/\sepub:type="([^"]*)"/);

  // Headings: drop epub:type (and any doc-* role) — invalid per EPUBCheck.
  if (HEADING_RE.test(name)) {
    if (!epubType) return tag;
    return tag
      .replace(/\sepub:type="[^"]*"/, '')
      .replace(/\srole="doc-[^"]*"/, '');
  }

  if (!epubType) return tag;
  if (/\srole="/.test(tag)) return tag; // already has a role — leave it
  // Pick the role from the map valid for this element: links (<a>) only take
  // link-type doc roles; everything else takes structural roles.
  const map = name.toLowerCase() === 'a' ? LINK_ROLE_MAP : STRUCT_ROLE_MAP;
  const role = map[epubType[1]];
  if (!role) return tag; // no matching DPUB role for this epub:type on this element

  // Insert role immediately before the closing `>` (handles self-closing too).
  return tag.replace(/\s*\/?>$/, (end) => ` role="${role}"${end}`);
}

function transformXhtml(content) {
  // Match opening/self-closing tags only (not closing tags), leaving text
  // nodes untouched.
  return content.replace(/<\s*[a-zA-Z][^>]*>/g, (tag) =>
    tag.startsWith('</') ? tag : transformTag(tag)
  );
}

// Screen-reader-only inline style (mirrors the theme's clip technique):
// keeps the element in the accessibility tree and reading order while removing
// it visually. Used for headings that must exist for heading-order validity but
// shouldn't render.
const SR_ONLY =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

// Pandoc's EPUB writer puts the front matter that precedes the first
// chapter-level heading (the copyright page and dedication, ahead of the
// first chapter) into a synthetic chapter and borrows the book title for its
// <h1>. The HTML/PDF writers don't split into chapters, so they never generate
// it — which is why the print front matter flows cleanly but the EPUB shows a
// redundant book-title heading and crams copyright + dedication onto one
// reflow screen. Both fixes are EPUB-only; the print path is untouched.
function fixFrontMatter(content) {
  // Scope strictly to the document containing the copyright page.
  if (!content.includes('id="copyright-page"')) return content;
  let out = content;

  // 1. Collapse the synthetic title heading to screen-reader-only. Keeping it
  //    (rather than deleting) preserves a valid h1 → h2 (Copyright) → h3 order
  //    and the section's heading for a11y; it just stops rendering
  //    as a duplicate of the title page.
  out = out.replace(
    /(<section\b[^>]*\bclass="[^"]*\blevel1\b[^"]*"[^>]*>\s*)<h1\b([^>]*)>([\s\S]*?)<\/h1>/,
    (m, open, attrs, text) =>
      /\bstyle=/.test(attrs) ? m : `${open}<h1${attrs} style="${SR_ONLY}">${text}</h1>`
  );

  // 2. Start the dedication on its own screen, mirroring the PDF's discrete
  //    copyright and dedication pages.
  out = out.replace(
    /<div class="dedication"(?![^>]*\bstyle=)/,
    '<div class="dedication" style="page-break-before: always"'
  );

  return out;
}

// Pandoc emits end-of-section footnotes as <aside epub:type="footnote"
// id="fnN"> containing bare <p> text — with no visible number and no
// backlink. EPUB3 reading systems that render footnotes as popups (Apple
// Books, Kobo) paper over this, but Kindle lists the asides inline with
// nothing to tie each note to its reference. Inject the note number (which
// matches the inline marker pandoc already prints) as a backlink to its
// #fnrefN anchor at the start of the aside's first paragraph. Footnote ids
// reset per chapter and are always numeric (fn1, fn2, …), so the id suffix
// is exactly the displayed number. Idempotent via the negative lookahead.
function fixFootnoteNumbers(content) {
  if (!content.includes('epub:type="footnote"')) return content;
  return content.replace(
    /(<aside\b[^>]*\bepub:type="footnote"[^>]*\bid="fn([\w-]+)"[^>]*>\s*<p\b[^>]*>)(?!\s*<a\b[^>]*class="footnote-back")/g,
    (m, open, id) =>
      `${open}<a href="#fnref${id}" class="footnote-back" role="doc-backlink">${escapeXml(id)}.</a> `
  );
}

// Relabel the synthetic front-matter entry in the nav TOC (book title →
// strings.copyright_nav, "Copyright" by default) so the table of contents doesn't list a redundant title link
// pointing at the copyright page. The TOC's own <h1 id="toc-title"> is not an
// <a>, so it is untouched.
function fixNav(content, title) {
  if (!title || !/epub:type="toc"/.test(content)) return content;
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const label = escapeXml(config.strings?.copyright_nav ?? 'Copyright');
  return content.replace(new RegExp(`(<a href="[^"]+#[^"]+">)${esc}(</a>)`), (m, open, close) => `${open}${label}${close}`);
}

// Find the content file (relative to EPUB/) that holds START_READING_ANCHOR.
// Returns e.g. "text/ch002.xhtml", or null if no file matches.
function findStartHref(workDir) {
  const textDir = path.join(workDir, 'EPUB', 'text');
  if (!START_READING_ANCHOR || !existsSync(textDir)) return null;
  const re = new RegExp(`id="${START_READING_ANCHOR}"`);
  for (const entry of readdirSync(textDir)) {
    if (!/\.(xhtml|html)$/.test(entry)) continue;
    if (re.test(readFileSync(path.join(textDir, entry), 'utf8'))) {
      return `text/${entry}`;
    }
  }
  return null;
}

// Add an `epub:type="bodymatter"` entry to the landmarks nav so Kindle has a
// "Start Reading" target. Scoped to the landmarks <nav> (its first </ol>), so
// the visible toc nav is untouched. Idempotent via the bodymatter check.
function addStartReadingLandmark(content, startHref) {
  if (!startHref) return content;
  if (!/epub:type="landmarks"/.test(content)) return content;
  if (/epub:type="bodymatter"/.test(content)) return content;
  return content.replace(
    /(<nav\b[^>]*\bepub:type="landmarks"[\s\S]*?)(\n?\s*<\/ol>)/,
    `$1\n      <li><a href="${startHref}" epub:type="bodymatter">Beginning</a></li>$2`
  );
}

function transformOpf(content, startHref) {
  let opf = content;

  // 1. Package language.
  const langMatch = opf.match(/<dc:language>([^<]+)<\/dc:language>/);
  const lang = langMatch ? langMatch[1].trim() : 'en-US';
  if (!/<package[^>]*\sxml:lang=/.test(opf)) {
    opf = opf.replace(/<package(\s)/, `<package xml:lang="${lang}"$1`);
  }

  // 1b. Declare the `a11y` package prefix used by the EPUB Accessibility 1.1
  //     certifier metadata below. It is a reserved prefix in EPUB 3.3 (no
  //     declaration strictly required), but older EPUBCheck builds — e.g. the
  //     apt package on the CI runner — flag it as undeclared, so we declare it
  //     explicitly with its canonical URI. `dcterms` and `schema` are
  //     universally reserved and need no declaration. Idempotent.
  if (!/\sprefix="[^"]*\ba11y:/.test(opf)) {
    const A11Y_PREFIX = 'a11y: http://www.idpf.org/epub/vocab/package/a11y/#';
    if (/<package[^>]*\sprefix="/.test(opf)) {
      opf = opf.replace(/(<package[^>]*\sprefix=")/, `$1${A11Y_PREFIX} `);
    } else {
      opf = opf.replace(/<package(\s)/, `<package prefix="${A11Y_PREFIX}"$1`);
    }
  }

  // 2. schema.org accessibility metadata (skip whatever already exists).
  const additions = A11Y_META.filter(
    ([prop, val]) =>
      !new RegExp(`property="${prop}"[^>]*>${escapeXml(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`).test(opf)
  )
    .map(
      ([prop, val, attrs]) =>
        `    <meta property="${prop}"${attrs ? ` ${attrs}` : ''}>${escapeXml(val)}</meta>`
    )
    .join('\n');
  if (additions) {
    opf = opf.replace(/([ \t]*)<\/metadata>/, `${additions}\n$1</metadata>`);
  }

  // 2a. a11y:certifierReport — a <link>, not a <meta> (see note above). Injected
  //     separately with a rel-based idempotency guard.
  if (A11Y_CERTIFIER_REPORT_URL && !/\srel="a11y:certifierReport"/.test(opf)) {
    opf = opf.replace(
      /([ \t]*)<\/metadata>/,
      `    <link rel="a11y:certifierReport" refines="#a11y-conformance" href="${A11Y_CERTIFIER_REPORT_URL}"/>\n$1</metadata>`
    );
  }

  // 2b. Localized accessibility summary. Pandoc emits an English summary from
  //     pandoc-epub.yml for every build (including translated ones), so remove
  //     any existing summary and inject the one matching dc:language. Authoritative
  //     remove-then-add keeps exactly one summary, in the right language.
  const summary = summaryForLang(lang);
  opf = opf.replace(/[ \t]*<meta\b[^>]*\bproperty="schema:accessibilitySummary"[^>]*>[\s\S]*?<\/meta>\s*\n?/g, '');
  if (summary) {
    opf = opf.replace(
      /([ \t]*)<\/metadata>/,
      `    <meta property="schema:accessibilitySummary">${escapeXml(summary)}</meta>\n$1</metadata>`
    );
  }

  // 3. "Start Reading" guide reference (legacy EPUB2 guide, still read by
  //    Kindle). pandoc emits type="toc"/"cover" but never type="text".
  if (startHref && /<guide\b/.test(opf) && !/<reference\b[^>]*\btype="text"/.test(opf)) {
    opf = opf.replace(
      /([ \t]*)<\/guide>/,
      `  <reference type="text" title="Beginning" href="${startHref}" />\n$1</guide>`
    );
  }

  // 4. Cover as cover art, not the first reading page. pandoc emits the cover's
  //    spine itemref with the default linear="yes", so Kindle treats the cover
  //    as page one and never honors the Start Reading Location. Marking it
  //    linear="no" tells readers the cover is out of the linear reading order;
  //    the cover-image metadata still shows it as the book's cover.
  opf = opf.replace(
    /(<itemref\b[^>]*\bidref="cover[^"]*")([^>]*?)(\s*\/?>)/,
    (full, head, mid, tail) =>
      /\blinear=/.test(head + mid)
        ? `${head}${mid}${tail}`.replace(/\blinear="[^"]*"/, 'linear="no"')
        : `${head}${mid} linear="no"${tail}`
  );

  return opf;
}

// --- unpack + transform + repackage -----------------------------------------
// Every file under dir, as sorted '/'-separated relative paths.
function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

// The time stored on every entry: SOURCE_DATE_EPOCH when the build sets one,
// else 1980-01-01, the earliest time a zip entry can hold.
function zipTimestamp() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  return new Date(Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : Date.UTC(1980, 0, 1));
}

function main(epubPath) {
  const workDir = mkdtempSync(path.join(tmpdir(), 'epub-pp-'));
  try {
    execFileSync('unzip', ['-q', '-o', path.resolve(epubPath), '-d', workDir]);

  // Book title (for the nav relabel below), read before transforming the OPF.
  const opfEarly = existsSync(path.join(workDir, 'EPUB', 'content.opf'))
    ? readFileSync(path.join(workDir, 'EPUB', 'content.opf'), 'utf8')
    : '';
  const titleMatch = opfEarly.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const bookTitle = titleMatch ? titleMatch[1].trim() : null;

  // Locate the "Start Reading" target: the file holding START_READING_ANCHOR
  // (structure.start_reading, or the first narrative chapter). Searched once, by
  // content, so it survives chapter renumbering.
  const startHref = findStartHref(workDir);
  if (!startHref) {
    console.warn(
      `⚠ start-reading anchor "${START_READING_ANCHOR}" not found — "Start Reading" marker not added`
    );
  }

  // --- transform content docs + nav ----------------------------------------
  let xhtmlCount = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(xhtml|html)$/.test(entry.name)) {
        const before = readFileSync(full, 'utf8');
        let after = transformXhtml(before);
        after = fixFootnoteNumbers(after);
        after = fixFrontMatter(after);
        after = fixNav(after, bookTitle);
        after = addStartReadingLandmark(after, startHref);
        if (after !== before) {
          writeFileSync(full, after);
          xhtmlCount += 1;
        }
      }
    }
  };
  walk(workDir);

  // --- transform content.opf -----------------------------------------------
  const opfPath = path.join(workDir, 'EPUB', 'content.opf');
  if (existsSync(opfPath)) {
    writeFileSync(opfPath, transformOpf(readFileSync(opfPath, 'utf8'), startHref));
  } else {
    console.error('✗ EPUB/content.opf not found — unexpected EPUB layout');
    process.exit(1);
  }

  // --- repackage (mimetype first, stored; everything else deflated) --------
  // The same content must give the same bytes: entries in sorted order, no
  // directory entries, and every file's time and mode fixed. Otherwise zip
  // records readdir order, the umask, and when each file was unpacked or
  // rewritten (in local time), so two builds of an unchanged book differ.
  const files = listFiles(workDir).filter((f) => f !== 'mimetype');
  const stamp = zipTimestamp();
  for (const f of ['mimetype', ...files]) {
    const full = path.join(workDir, f);
    chmodSync(full, 0o644);
    utimesSync(full, stamp, stamp);
  }
  const outAbs = path.resolve(epubPath);
  rmSync(outAbs, { force: true });
  const zipOpts = { cwd: workDir, env: { ...process.env, TZ: 'UTC' } };
  execFileSync('zip', ['-X', '-0', outAbs, 'mimetype'], zipOpts);
  execFileSync('zip', ['-X', '-D', '-9', outAbs, '-@'], { ...zipOpts, input: files.join('\n') + '\n' });

    console.log(
      `✓ post-processed ${epubPath}: a11y metadata + xml:lang in OPF, roles added to ${xhtmlCount} document(s)`
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

// Exported for unit testing (pure string transforms).
export {
  fixFootnoteNumbers,
  transformXhtml,
  escapeXml,
  addStartReadingLandmark,
  transformOpf,
  listFiles,
  main,
};

// Run only when invoked directly as a CLI (not when imported by tests).
if (isMain(import.meta.url)) {
  const epubPath = process.argv[2];
  if (!epubPath) {
    console.error('Usage: book-kit postprocess-epub <path-to.epub>');
    process.exit(2);
  }
  if (!existsSync(epubPath)) {
    console.error(`✗ ${epubPath}: not found`);
    process.exit(2);
  }
  main(epubPath);
}
