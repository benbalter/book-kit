// Helpers shared by the built-in validators (validators/) and the runner
// (commands/validate.js).
//
// Validators read the book's conventions from book.config.yml. Paths (here,
// in lint.exclude, and in validators.allow) are relative to the book root,
// which is the working directory when run through `book-kit validate`.

import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { deepMerge, loadConfig } from './config.js';
import { smallcapsAcronyms, universalAcronyms } from './acronyms.js';

export const config = loadConfig();
const SRC_DIR = config.paths.src;
const INDEX_PATH = config.paths.index;
// How a chapter entry under paths.src starts in index.yml ("- src/").
const SRC_ENTRY_PREFIX = `- ${path.normalize(SRC_DIR).replace(/\/+$/, '')}/`;
export const TAKEAWAYS_SUFFIX = config.structure.takeaways_suffix;
export const REQUIRED_CALLOUT = config.structure.required_callout;

// Files to exclude from validation (index.yml presence, TODO checks, and the
// required callout): lint.exclude in book.config.yml.
export const EXCLUDE_PATTERNS = config.lint.exclude;

// Machine-generated pages (lint.generated) whose text is derived from
// already-validated sources. Skip prose-level lexical validators that would
// misfire on them, e.g. acronyms locked inside link text that can't be
// smallcapped. List them in lint.exclude too for the per-chapter checks.
export const GENERATED_FILES = new Set(config.lint.generated);

// Acronyms that should always use [ACRONYM]{.smallcaps} formatting: the kit's
// list (lib/acronyms.js, shared with the no-bare-acronyms textlint rule) plus
// lint.acronyms. The smallcaps validator only flags acronyms it knows about.
export const KNOWN_ACRONYMS = smallcapsAcronyms(config);

// Acronyms readers know without expansion on first use: the kit's list plus
// lint.universal_acronyms.
export const UNIVERSALLY_KNOWN_ACRONYMS = universalAcronyms(config);

/**
 * A validator's intentional exceptions (validators.allow.<name>).
 * @param {string} name - Validator name
 * @returns {Set<string>}
 */
export function allowFor(name) {
  return new Set(config.validators.allow?.[name] ?? []);
}

/**
 * A validator's options: its defaults deep-merged with
 * validators.options.<name> (maps merge; lists and scalars replace).
 * @param {string} name - Validator name
 * @param {object} [defaults] - The validator's own defaults
 * @param {object} [cfg] - Resolved config (the book's, by default)
 * @returns {object}
 */
export function optionsFor(name, defaults = {}, cfg = config) {
  return deepMerge(structuredClone(defaults), cfg.validators?.options?.[name] ?? {});
}

/**
 * Get all markdown chapters from src directory
 * @returns {string[]} Array of chapter paths
 */
export function getChapters() {
  const srcDir = SRC_DIR;
  if (!fs.existsSync(srcDir)) {
    return [];
  }
  return fs.readdirSync(srcDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map(file => path.join(srcDir, file));
}

/**
 * Load the index.yml file and get input-files
 * @returns {string[]} Array of chapter paths from index
 */
export function getIndexFiles() {
  const indexPath = INDEX_PATH;
  if (!fs.existsSync(indexPath)) {
    console.error('Error: index.yml not found');
    process.exit(1);
  }

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const index = yaml.load(indexContent);
  return index['input-files'] || [];
}

/**
 * Check if a chapter should be excluded from validation
 * @param {string} chapter - Path to chapter file
 * @returns {boolean} True if chapter should be excluded
 */
export function isExcluded(chapter) {
  return EXCLUDE_PATTERNS.includes(chapter);
}

/**
 * Parse index.yml to find section intro files (first heading file in each section).
 * Sections are identified by YAML comment lines (# Section name).
 * For each section, finds the first file whose content starts with a markdown heading.
 * @returns {{section: string, file: string}[]} Array of section intro entries
 */
export function getSectionIntros() {
  const indexPath = INDEX_PATH;
  if (!fs.existsSync(indexPath)) {
    return [];
  }

  const lines = fs.readFileSync(indexPath, 'utf8').split('\n');
  const intros = [];
  let currentSection = null;
  let foundIntro = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect YAML comment section headers (e.g., "# Part one")
    if (trimmed.startsWith('#') && !trimmed.startsWith('#-')) {
      currentSection = trimmed.replace(/^#+\s*/, '');
      foundIntro = false;
      continue;
    }

    // Find the first file in the section whose content starts with a heading
    if (currentSection && !foundIntro && trimmed.startsWith(SRC_ENTRY_PREFIX)) {
      const file = trimmed.replace(/^-\s*/, '');
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const linesInFile = content.split('\n');
        const firstHeadingLine = linesInFile.find((l) => /^#+\s/.test(l.trim()));
        if (firstHeadingLine) {
          intros.push({ section: currentSection, file });
          foundIntro = true;
        }
      }
    }
  }

  return intros;
}

/**
 * Generate a pandoc-style anchor ID from heading text.
 * Strips smallcaps spans, explicit IDs, inline code, and converts to kebab-case.
 * @param {string} headingText - Raw heading line (including ## prefix)
 * @returns {string} The anchor ID
 */
export function headingToAnchor(headingText) {
  let text = headingText.replace(/^#+\s*/, '');

  // Use explicit anchor ID if present: {#my-id}
  const explicitId = text.match(/\{#([a-z0-9-]+)\}/);
  if (explicitId) return explicitId[1];

  // Strip smallcaps spans: [ACRONYM]{.smallcaps} -> ACRONYM
  text = text.replace(/\\?\[([^\]]*?)\\?\]\{\.smallcaps[^}]*\}/g, '$1');

  // Strip other pandoc attributes: {epub:type=...} etc.
  text = text.replace(/\{[^}]*\}/g, '');

  // Strip inline code backticks
  text = text.replace(/`([^`]*)`/g, '$1');

  // Strip links: [text](url) -> text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Strip bold/italic markers
  text = text.replace(/[*_]+/g, '');

  // Convert to pandoc-style ID
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')  // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, '-')       // Spaces to hyphens
    .replace(/-+/g, '-')        // Collapse multiple hyphens
    .replace(/^-|-$/g, '');     // Trim leading/trailing hyphens
}

/**
 * Collect all heading anchors from production chapters.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {Set<string>} Set of all anchor IDs
 */
export function collectAllAnchors(indexFiles) {
  const anchors = new Set();
  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split('\n')) {
      if (/^#{1,6}\s/.test(line)) {
        anchors.add(headingToAnchor(line));
      }
    }
  }
  return anchors;
}
