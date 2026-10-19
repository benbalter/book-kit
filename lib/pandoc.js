// Generates dist/.book-kit/pandoc-<format>.yml: the per-book half of the pandoc
// defaults (identity metadata, resource paths, cover), derived from
// book.config.yml. Recipes pass it after the kit's identity-free defaults in
// defaults/, so pandoc's metadata merge lets it win.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as yaml from 'js-yaml';
import { kitPath, loadConfig, pathFor } from './config.js';
import { revision } from './revision.js';

export const FORMATS = ['html', 'pdf', 'epub', 'kindle', 'docx'];

/**
 * A filter or template a book names in build.filters / build.templates. A
 * path (containing "/" or starting with ".") is book-relative; a bare name is
 * looked up in the presets' <kind>/ directories, last preset first, then the
 * kit's.
 * @param {string} spec - e.g. "revision", "template.html", "./filters/mine.lua"
 * @param {'filters'|'templates'} kind
 * @param {string} ext - appended to a bare name that lacks it ('.lua' for filters)
 */
export function resolveAsset(spec, kind, ext, config) {
  if (spec.includes('/') || spec.startsWith('.')) return join(config.root, spec);
  const file = spec.endsWith(ext) ? spec : `${spec}${ext}`;
  for (const { dir } of [...(config.presets ?? [])].reverse()) {
    const candidate = join(dir, kind, file);
    if (existsSync(candidate)) return candidate;
  }
  const kit = kitPath(kind, file);
  if (!existsSync(kit)) {
    throw new Error(`build.${kind}: no ${kind.slice(0, -1)} named "${spec}" in the kit or a preset (use ./path for one in the book)`);
  }
  return kit;
}

// The Lua filter chain for a format: build.filters.<format>, in order, with
// the literal entry "extra_filters" standing for build.extra_filters.<format>
// (book-relative paths).
function filtersFor(format, config) {
  const extra = (config.build.extra_filters?.[format] ?? []).map((f) => join(config.root, f));
  return (config.build.filters?.[format] ?? []).flatMap((spec) =>
    spec === 'extra_filters' ? extra : [resolveAsset(spec, 'filters', '.lua', config)],
  );
}

function buildDate() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  return (Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000) : new Date()).toISOString().slice(0, 10);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Dublin Core supplement for the OPF, for books without a hand-written
// epub.xml. metadata.uuid must stay constant across every revision of the book.
export function epubMetadataXml(config = loadConfig()) {
  const m = config.metadata;
  if (!m.uuid) {
    throw new Error('metadata.uuid is required to generate EPUB metadata (any UUID; never change it). Try: node -e "console.log(crypto.randomUUID())"');
  }
  const lines = [`<dc:identifier id="epub-id">urn:uuid:${xml(m.uuid)}</dc:identifier>`];
  if (m.isbn_ebook) lines.push(`<dc:identifier id="isbn-ebook">urn:isbn:${xml(m.isbn_ebook)}</dc:identifier>`);
  // Always emit a date: without one, pandoc derives dc:date from the `date`
  // metadata (the build stamp, not a date) and writes an empty element, which
  // fails EPUBCheck. Unpublished books get the build date (SOURCE_DATE_EPOCH
  // when set, for reproducible builds).
  lines.push(`<dc:date>${xml(m.pub_date || buildDate())}</dc:date>`);
  if (m.publisher) lines.push(`<dc:publisher>${xml(m.publisher)}</dc:publisher>`);
  for (const subject of m.subjects ?? []) lines.push(`<dc:subject>${xml(subject)}</dc:subject>`);
  return `${lines.join('\n')}\n`;
}

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => !isEmpty(v)));
}

export function pandocDefaults(format, config = loadConfig()) {
  if (!FORMATS.includes(format)) throw new Error(`Unknown format "${format}" (expected ${FORMATS.join(', ')})`);
  const m = config.metadata;
  const ebook = format === 'epub' || format === 'kindle';

  const metadata = compact({
    title: m.title,
    subtitle: m.subtitle,
    description: format === 'docx' ? undefined : m.description,
    author: [].concat(m.author ?? []),
    lang: m.lang,
    date: revision(config),
    rights: format === 'docx' ? undefined : m.rights,
    // The print ISBN identifies the PDF/HTML; the ebook ISBN goes in the OPF
    // via paths.epub_metadata (dc:identifier), not here.
    isbn: format === 'html' || format === 'pdf' ? m.isbn_paperback : undefined,
  });

  // Point at the compiled stylesheet in dist/ explicitly, so pandoc never picks
  // up the uncompiled Tailwind source through the resource path.
  const STYLESHEETS = { html: 'style.css', pdf: 'style.css', epub: 'style-epub.css', kindle: 'style-kindle.css' };
  if (STYLESHEETS[format]) metadata.css = join(config.paths.dist, STYLESHEETS[format]);

  if (ebook) {
    const a = config.accessibility;
    Object.assign(metadata, compact({
      'cover-label': config.strings?.cover_label,
      accessModes: a.access_modes,
      accessModeSufficient: a.access_mode_sufficient,
      accessibilityFeatures: a.features,
      accessibilityHazards: a.hazards,
      accessibilitySummary: a.summary,
      conformsTo: a.conforms_to,
    }));
  }
  Object.assign(metadata, config.pandoc_metadata);

  const out = {
    metadata,
    'resource-path': ['.', config.paths.fonts, config.paths.src],
    filters: filtersFor(format, config),
  };
  const template = config.build.templates?.[format];
  if (template) out.template = resolveAsset(template, 'templates', '', config);
  if (ebook) out['epub-metadata'] = epubMetadataPath(config);
  if (format !== 'docx' && existsSync(pathFor('cover', config))) {
    out['epub-cover-image'] = config.paths.cover;
  }
  if (format === 'docx' && existsSync(join(config.root, 'reference.docx'))) {
    out['reference-doc'] = 'reference.docx';
  }
  return out;
}

// The book's epub.xml if it has one, else one generated from config.
function epubMetadataPath(config) {
  const own = pathFor('epub_metadata', config);
  if (existsSync(own)) return own;
  const out = join(pathFor('dist', config), '.book-kit', 'epub.xml');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, epubMetadataXml(config));
  return out;
}

export function writePandocDefaults(format, config = loadConfig()) {
  const out = join(pathFor('dist', config), '.book-kit', `pandoc-${format}.yml`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, yaml.dump(pandocDefaults(format, config), { lineWidth: -1 }));
  return out;
}
