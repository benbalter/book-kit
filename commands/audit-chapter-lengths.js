#!/usr/bin/env node

/**
 * Audit chapter lengths for balance and readability.
 * Flags chapters that are significantly longer or shorter than recommended ranges.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { isNonChapter } from '../lib/structure.js';
import { pathFor } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';

// Recommended word count range for content chapters. The chapter-lengths
// validator (validators/chapter-lengths.js) uses these as its defaults.
const MIN_WORDS = 500;
const MAX_WORDS = 2500;

// Section-opener heading marker. Section openers carry `{.section-opener}` on
// their H1 (the same marker the print/EPUB CSS and the section-intro
// validators key off).
// Matching the marker — rather than a hardcoded filename list — keeps this in
// sync automatically when chapters are renamed or sections are added.
const SECTION_OPENER_RE = /^#\s+.*\{[^}]*\.section-opener[^}]*\}/m;

/**
 * Strip common Markdown/Pandoc markup from content, preserving visible text where possible.
 * This is a heuristic, not a full Markdown parser, but is sufficient for word-count auditing.
 * @param {string} content - Raw Markdown/Pandoc content
 * @returns {string} Plaintext-ish content with markup removed
 */
function stripMarkup(content) {
  let stripped = content;

  // Remove fenced code blocks (``` or ~~~, any language)
  stripped = stripped.replace(/```[\s\S]*?```/g, ' ');
  stripped = stripped.replace(/~~~[\s\S]*?~~~/g, ' ');

  // Remove inline code marked with backticks
  stripped = stripped.replace(/`[^`]*`/g, ' ');

  // Images: keep alt text, drop URLs
  stripped = stripped.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1 ');

  // Links: keep link text, drop URLs
  stripped = stripped.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1 ');

  // Emphasis and strong emphasis markers (*, _, **, __)
  stripped = stripped.replace(/(\*\*|__)(.*?)\1/g, '$2');
  stripped = stripped.replace(/(\*|_)(.*?)\1/g, '$2');

  // Headings: remove leading #'s
  stripped = stripped.replace(/^#{1,6}\s+/gm, '');

  // Blockquotes: remove leading ">"
  stripped = stripped.replace(/^\s{0,3}>\s?/gm, '');

  // List markers: -, *, +, or numbered lists at line start
  stripped = stripped.replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '');

  // ::: blocks (e.g., Pandoc-style fenced divs)
  // [^\S\n]* (not \s*) so the match can't cross the newline and swallow the
  // paragraph that follows the fence line
  stripped = stripped.replace(/^:::[^\S\n]*[^\n]*$/gm, ' ');

  // Inline attributes in braces, e.g., {.class}, {#id}
  stripped = stripped.replace(/\{[.#][^}]*\}/g, '');

  // Collapse all remaining whitespace
  stripped = stripped.replace(/\s+/g, ' ').trim();

  return stripped;
}

/**
 * Count words in a string, excluding Markdown/Pandoc markup
 * @param {string} content - Text content
 * @returns {number} Word count
 */
function countWords(content) {
  const plain = stripMarkup(content);
  return plain.length === 0
    ? 0
    : plain.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check if a file should be excluded from length auditing
 * @param {string} filePath - Path to chapter file
 * @returns {boolean} True if file should be excluded
 */
// Structural pages, takeaways collections, and scratch drafts aren't chapters
// (see lib/structure.js).
function isExcluded(filePath) {
  return isNonChapter(filePath);
}

/**
 * Check if content belongs to a section introduction.
 *
 * Section openers are intentionally short (≈300–500 words; they frame a section
 * rather than stand alone), so they're exempt from the min-word floor. They're
 * identified by the `{.section-opener}` class on their H1 heading.
 * @param {string} content - Raw chapter content
 * @returns {boolean} True if content is a section intro
 */
function isSectionIntro(content) {
  return SECTION_OPENER_RE.test(content);
}

/**
 * Parse index.yml to get chapter list and section mapping
 * @param {string} indexPath - Path to index.yml
 * @returns {{files: string[], sections: Object<string, string>}} Chapter files and section mapping
 */
function parseIndex(indexPath = pathFor('index')) {
  if (!fs.existsSync(indexPath)) {
    return { files: [], sections: {} };
  }

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const index = yaml.load(indexContent);
  const files = index['input-files'] || [];

  const lines = indexContent.split('\n');
  let currentSection = '';
  const sections = {};
  for (const line of lines) {
    const sectionMatch = line.match(/^\s*#\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const fileMatch = line.match(/^\s*-\s+(.+)/);
    if (fileMatch) {
      sections[fileMatch[1].trim()] = currentSection;
    }
  }

  return { files, sections };
}

/**
 * Audit chapter lengths and return warnings
 * @param {string} indexPath - Path to index.yml
 * @param {{min_words?: number, max_words?: number}} [options] - Word count range
 * @returns {{warnings: string[], stats: Object}} Audit results
 */
function auditChapterLengths(indexPath = pathFor('index'), { min_words = MIN_WORDS, max_words = MAX_WORDS } = {}) {
  const { files, sections } = parseIndex(indexPath);
  const baseDir = path.dirname(path.resolve(indexPath));
  const warnings = [];
  const chapters = [];

  for (const file of files) {
    if (isExcluded(file)) {
      continue;
    }

    const resolvedPath = path.resolve(baseDir, file);
    if (!fs.existsSync(resolvedPath)) {
      continue;
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');
    if (isSectionIntro(content)) {
      continue;
    }

    const wordCount = countWords(content);
    const section = sections[file] || 'Unknown';

    chapters.push({ file, wordCount, section });

    if (wordCount > max_words) {
      warnings.push(
        `Chapter too long (${wordCount} words, max ${max_words}): ${file} [${section}]`
      );
    } else if (wordCount < min_words) {
      warnings.push(
        `Chapter too short (${wordCount} words, min ${min_words}): ${file} [${section}]`
      );
    }
  }

  const counts = chapters.map(c => c.wordCount);
  const total = counts.reduce((a, b) => a + b, 0);
  const stats = {
    chapterCount: chapters.length,
    totalWords: total,
    averageWords: chapters.length > 0 ? Math.round(total / chapters.length) : 0,
    minWords: chapters.length > 0 ? Math.min(...counts) : 0,
    maxWords: chapters.length > 0 ? Math.max(...counts) : 0,
  };

  return { warnings, stats, chapters };
}

/**
 * Print audit results to console
 * @param {string} indexPath - Path to index.yml
 * @returns {number} Number of warnings
 */
function printAudit(indexPath = pathFor('index')) {
  const { warnings, stats } = auditChapterLengths(indexPath);

  console.log(`Chapter length audit (${stats.chapterCount} content chapters)`);
  console.log(`  Range: ${MIN_WORDS}–${MAX_WORDS} words`);
  console.log(`  Average: ${stats.averageWords} words`);
  console.log(`  Min: ${stats.minWords} words`);
  console.log(`  Max: ${stats.maxWords} words`);
  console.log('');

  if (warnings.length === 0) {
    console.log('✓ All chapters within recommended length range');
  } else {
    for (const warning of warnings) {
      console.log(`⚠ ${warning}`);
    }
    console.log(`\n⚠ ${warnings.length} chapter(s) outside recommended range`);
  }

  return warnings.length;
}

// Export for testing
export {
  MIN_WORDS,
  MAX_WORDS,
  countWords,
  isExcluded,
  isSectionIntro,
  parseIndex,
  auditChapterLengths,
  printAudit
};

// Run if executed directly
if (isMain(import.meta.url)) {
  const indexPath = process.argv[2] || pathFor('index');
  const warningCount = printAudit(indexPath);
  process.exit(warningCount > 0 ? 1 : 0);
}
