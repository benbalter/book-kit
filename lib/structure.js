// What counts as a chapter. Structural pages (copyright, dedication, about the
// author, ...), section key-takeaways collections, and scratch drafts aren't
// narrative chapters, so the prose validators and audits skip them.
//
// structure.structural_slugs entries match a file's slug exactly, or by
// prefix when they end in "*" ("appendix*").

import path from 'node:path';
import { loadConfigOrDefaults } from './config.js';

export function slugOf(file) {
  return path.basename(file, '.md');
}

function matches(slug, pattern) {
  return pattern.endsWith('*') ? slug.startsWith(pattern.slice(0, -1)) : slug === pattern;
}

export function isStructuralSlug(slug, config = loadConfigOrDefaults()) {
  return config.structure.structural_slugs.some((p) => matches(slug, p));
}

export function isStructural(file, config = loadConfigOrDefaults()) {
  return isStructuralSlug(slugOf(file), config);
}

export function isTakeaways(file, config = loadConfigOrDefaults()) {
  return slugOf(file).endsWith(config.structure.takeaways_suffix);
}

// A draft that isn't part of the book yet (structure.draft_suffix).
export function isScratch(file, config = loadConfigOrDefaults()) {
  return slugOf(file).endsWith(config.structure.draft_suffix ?? '-scratch');
}

// Not a narrative chapter: skip it in prose audits.
export function isNonChapter(file, config = loadConfigOrDefaults()) {
  return isStructural(file, config) || isTakeaways(file, config) || isScratch(file, config);
}
