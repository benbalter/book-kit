#!/usr/bin/env node

/**
 * Update key takeaways by combining TL;DRs from chapters into section key
 * takeaway files: for each `# Section` comment in index.yml, collect its
 * chapters' TL;DRs into src/<section><structure.takeaways_suffix>.md.
 * Hand-written text around the generated block is preserved.
 *
 * Usage: book-kit update-key-takeaways
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigOrDefaults } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = loadConfigOrDefaults();

// Sections that don't get a takeaways chapter (structure.takeaways_skip_sections)
const SKIP_SECTIONS = config.structure.takeaways_skip_sections;
const TAKEAWAYS_SUFFIX = config.structure.takeaways_suffix;

/**
 * Parse sections from index.yml content
 * @param {string} indexContent - Raw index.yml file content
 * @returns {{sections: string[], sectionFiles: Object.<string, string[]>}}
 */
function parseSections(indexContent) {
  const sections = [];
  const sectionFiles = {};
  let currentSection = null;
  
  for (const line of indexContent.split('\n')) {
    // Match section comment lines
    const commentMatch = line.match(/^\s*#\s+(.+)$/);
    if (commentMatch) {
      const sectionName = commentMatch[1].trim();
      // Skip sections we don't want to process
      if (!SKIP_SECTIONS.includes(sectionName)) {
        currentSection = sectionName;
        if (!sections.includes(currentSection)) {
          sections.push(currentSection);
          sectionFiles[currentSection] = [];
        }
      } else {
        currentSection = null;
      }
      continue;
    }
    
    // Match file entries under current section
    const fileMatch = line.match(/^\s*-\s+(.+\.md)\s*$/);
    if (fileMatch && currentSection) {
      const filePath = fileMatch[1].trim();
      sectionFiles[currentSection].push(filePath);
    }
  }
  
  return { sections, sectionFiles };
}

/**
 * Extract TL;DR content from chapter file
 * @param {string} filePath - Path to chapter file
 * @returns {{text: string, disabledRules: string[]}|null} TL;DR content and disabled textlint rules, or null
 */
function extractTldr(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('.tldr')) {
    return null;
  }
  
  // Extract content from tldr div block
  const tldrMatch = content.match(/::: \{\.tldr[^}]*\}\n(.*?)\n:::/s);
  if (tldrMatch) {
    const text = tldrMatch[1].trim();

    // Collect file-level textlint-disable rules so intentional
    // rule violations (e.g. clichés used as examples) stay suppressed
    // when the TL;DR is embedded in a key-takeaways file.
    const disabledRules = [];
    const disableMatch = content.match(/^<!--\s*textlint-disable\s+([^>]+?)(?:\s*)-->/m);
    if (disableMatch) {
      disabledRules.push(...disableMatch[1].trim().split(/,\s*/));
    }

    return { text, disabledRules };
  }
  
  return null;
}

/**
 * Convert section name to filename-safe format
 * @param {string} sectionName - Section name
 * @returns {string} Filename-safe section name
 */
function sectionToFilename(sectionName) {
  return sectionName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/-+/g, '-')            // Replace multiple hyphens with single
    .trim();
}

// Phrases that work inside a chapter's TL;DR ("this chapter shows you…",
// "read on to learn…") but dangle when the TL;DR is lifted into a section's
// key takeaways list, where there is no "this chapter" to point at.
const DEICTIC_PATTERNS = [
  /\bthis chapter\b/i,
  /\bread on\b/i,
  /\bkeep reading\b/i,
  /\bthe pages? that follows?\b/i,
  /\bwhat follows\b/i
];

/**
 * Strip sentences that reference the chapter itself ("This chapter shows
 * you…", "Read on to learn…") so the remaining text stands alone as a key
 * takeaway. TL;DRs keep their hook sentence in place; only the generated
 * takeaways drop it.
 * @param {string} text - TL;DR text
 * @returns {string} Text with chapter-deictic sentences removed
 */
function stripChapterReferences(text) {
  if (!DEICTIC_PATTERNS.some((pattern) => pattern.test(text))) {
    return text;
  }

  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(
    (sentence) => !DEICTIC_PATTERNS.some((pattern) => pattern.test(sentence))
  );

  // If every sentence references the chapter, keep the original rather than
  // emit an empty takeaway — but flag it so the TL;DR gets fixed upstream.
  if (kept.length === 0) {
    console.warn(`Warning: TL;DR is entirely chapter-deictic; keeping as-is: "${text.slice(0, 80)}…"`);
    return text;
  }

  const result = kept.join(' ');
  if (DEICTIC_PATTERNS.some((pattern) => pattern.test(result))) {
    console.warn(`Warning: chapter reference survived stripping: "${result.slice(0, 80)}…"`);
  }
  return result;
}

/**
 * Generate key takeaways content
 * @param {Array<{text: string, disabledRules: string[]}>} tldrs - Array of TL;DR objects
 * @returns {string} Formatted key takeaways markdown
 */
function generateKeyTakeaways(tldrs) {
  // Collect all disabled textlint rules across TL;DRs in this section
  const allDisabledRules = [...new Set(tldrs.flatMap(t => t.disabledRules))];
  
  let contents = '';
  if (allDisabledRules.length > 0) {
    contents += `<!-- textlint-disable ${allDisabledRules.join(', ')} -->\n\n`;
  }
  contents += '::: {.takeaways custom-style="takeaways"}\n\n### Key takeaways\n\n';
  contents += tldrs.map(t => `- ${stripChapterReferences(t.text)}`).join('\n');
  contents += '\n\n:::\n';
  return contents;
}

/**
 * Collect TL;DRs for each section
 * @param {string[]} sections - Array of section names
 * @param {Object.<string, string[]>} sectionFiles - Map of section name to file paths
 * @returns {Object.<string, Array<{text: string, disabledRules: string[]}>>} Map of section name to TL;DRs
 */
function collectTldrs(sections, sectionFiles) {
  const sectionTldrs = {};
  
  for (const section of sections) {
    sectionTldrs[section] = [];
    
    const files = sectionFiles[section] || [];
    for (const chapter of files) {
      const tldr = extractTldr(chapter);
      if (tldr) {
        sectionTldrs[section].push(tldr);
      } else if (fs.existsSync(chapter)) {
        console.log(`No TL;DR in ${chapter}`);
      }
    }
  }
  
  return sectionTldrs;
}

/**
 * Extract hand-written content before and after the takeaways block.
 * Returns { before, after } strings, either of which may be empty.
 * @param {string} filePath - Path to existing key takeaways file
 * @returns {{before: string, after: string}} Content surrounding the takeaways block
 */
function extractBridgingContent(filePath) {
  if (!fs.existsSync(filePath)) {
    return { before: '', after: '' };
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Find the takeaways block boundaries, accounting for optional
  // textlint-disable comments that precede it.
  const takeawaysStart = content.search(/(?:<!--\s*textlint-disable[^>]*-->\s*\n*)?::: \{\.takeaways/);
  const takeawaysEnd = content.indexOf('\n:::\n', takeawaysStart);

  if (takeawaysStart === -1 || takeawaysEnd === -1) {
    return { before: '', after: '' };
  }

  // "before" is everything up to the takeaways block (trimmed)
  let before = content.slice(0, takeawaysStart).trim();

  // "after" is everything following the closing ::: and optional
  // textlint-enable comments (trimmed)
  let after = content.slice(takeawaysEnd + '\n:::\n'.length).trim();
  // Strip leading textlint-enable comment from "after" since the
  // generated block already handles it via allDisabledRules
  after = after.replace(/^<!--\s*textlint-enable[^>]*-->\s*\n*/, '').trim();

  return { before, after };
}

/**
 * Generate key takeaways files for each section
 * @param {Object.<string, string[]>} sectionTldrs - Map of section name to TL;DRs
 * @param {string} outputDir - Output directory for generated files
 * @returns {string[]} Array of generated file paths
 */
function generateFiles(sectionTldrs, outputDir = config.paths.src) {
  const generatedFiles = [];
  
  for (const [section, tldrs] of Object.entries(sectionTldrs)) {
    if (tldrs.length === 0) {
      continue;
    }
    
    const filename = sectionToFilename(section);
    const filePath = path.join(outputDir, `${filename}${TAKEAWAYS_SUFFIX}.md`);

    // Preserve any hand-written bridging content around the block
    const { before, after } = extractBridgingContent(filePath);
    const takeawaysBlock = generateKeyTakeaways(tldrs);

    let contents = '';
    if (before) {
      contents += before + '\n\n';
    }
    contents += takeawaysBlock;
    if (after) {
      contents += '\n' + after + '\n';
    }
    
    fs.writeFileSync(filePath, contents);
    console.log(`Generated ${filePath} with ${tldrs.length} takeaways`);
    generatedFiles.push(filePath);
  }
  
  return generatedFiles;
}

/**
 * Main function to update key takeaways by combining TL;DRs
 * @param {string} indexPath - Path to index.yml file
 * @param {string} outputDir - Output directory for generated files
 * @returns {string[]} Array of generated file paths
 */
function updateKeyTakeaways(indexPath = config.paths.index, outputDir = config.paths.src) {
  // Read the index.yml file
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  // Parse sections from comments in index.yml
  const { sections, sectionFiles } = parseSections(indexContent);
  
  // Collect TL;DRs for each section
  const sectionTldrs = collectTldrs(sections, sectionFiles);
  
  // Generate key takeaways files
  return generateFiles(sectionTldrs, outputDir);
}

// Export for testing
export {
  parseSections,
  extractTldr,
  extractBridgingContent,
  stripChapterReferences,
  sectionToFilename,
  generateKeyTakeaways,
  collectTldrs,
  generateFiles,
  updateKeyTakeaways,
  SKIP_SECTIONS
};

// Run if executed directly
if (isMain(import.meta.url)) {
  updateKeyTakeaways();
}
