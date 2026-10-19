#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../lib/is-main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to generate backup directory name with timestamp
function generateBackupDirName(srcDirectory) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/T/, '_').slice(0, -5);
  return `${srcDirectory}_backup_${timestamp}`;
}

class LinksToFootnotes {
  // Regex pattern for markdown links: [text](url)
  // Capture groups: 1=link text, 2=url (with optional angle brackets), 3=trailing punctuation
  static LINK_PATTERN = /\[((?:[^[\]]|\[[^\]]*\])+)\]\((<[^>]+>|[^)]+)\)([).,;:!?]*)/g;
  
  // Regex pattern for footnote references that appear BEFORE sentence-ending punctuation
  // Used to reorder "text[^1]." to "text.[^1]"
  // Capture groups: 1=footnote reference, 2=punctuation
  static FOOTNOTE_BEFORE_PUNCT_PATTERN = /(\[\^[^\]]+\])([.!?])/g;

  // Regex pattern for heading attribute blocks containing an explicit ID, e.g., "{#id .class}"
  // Uses \s\{ to require whitespace before {, so inline spans like [URL]{.smallcaps} aren't matched
  static HEADING_ID_ATTR_PATTERN = /\s\{[^}]*#([A-Za-z0-9_:-]+)[^}]*\}\s*$/;
  
  // Regex pattern for any trailing heading attribute block, e.g., "{.class}" or "{epub:type=appendix}"
  static HEADING_ATTR_PATTERN = /\s\{[^}]+\}\s*$/;

  constructor(srcDirectory, createBackup = true, preserveInternalLinks = false) {
    this.srcDirectory = srcDirectory;
    this.createBackup = createBackup;
    this.preserveInternalLinks = preserveInternalLinks;
    this.globalFootnoteCounter = 1;
    this.anchorMap = {};
  }

  async processAllFiles() {
    const files = fs.readdirSync(this.srcDirectory)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => path.join(this.srcDirectory, f));
    
    console.log(`Found ${files.length} markdown files to process`);
    
    // First pass: build anchor mapping
    this.buildAnchorMap(files);
    
    // Second pass: process files
    for (const filePath of files) {
      this.processFile(filePath);
    }
    
    console.log('Finished processing all files');
  }

  // Helper method to pluralize a word based on count
  pluralize(count, singular, plural = null) {
    plural = plural || `${singular}s`;
    return count === 1 ? singular : plural;
  }

  // Parse a raw heading string to extract the custom ID and cleaned title.
  // Uses \s\{ (not \s*\{) to require whitespace before {, distinguishing
  // heading attributes like {#id} from inline span attributes like [URL]{.smallcaps}.
  parseHeading(rawHeading) {
    const idMatch = rawHeading.match(LinksToFootnotes.HEADING_ID_ATTR_PATTERN);
    if (idMatch) {
      const customId = idMatch[1];
      const title = rawHeading.replace(LinksToFootnotes.HEADING_ID_ATTR_PATTERN, '').trim();
      return { customId, title };
    }
    const title = rawHeading.replace(LinksToFootnotes.HEADING_ATTR_PATTERN, '').trim();
    return { customId: null, title };
  }

  buildAnchorMap(files) {
    console.log('Building anchor map from headings...');
    
    // Track anchor usage to handle duplicates with Pandoc's numbering scheme
    const anchorCounts = {};
    
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      let currentChapter = null;
      
      for (const line of content.split('\n')) {
        // Match headings at levels 1-4
        const match = line.match(/^(#{1,4})\s+(.+)$/);
        if (!match) continue;

        const level = match[1].length;
        const { customId, title } = this.parseHeading(match[2].trim());

        let anchor = customId || this.generateAnchor(title);
        anchor = this.handleDuplicateAnchor(anchor, anchorCounts);

        if (level <= 2) currentChapter = title;

        this.anchorMap[anchor] = {
          title,
          chapter: level <= 2 ? title : currentChapter,
          level,
        };
      }
    }
    
    console.log(`  Built map with ${Object.keys(this.anchorMap).length} anchors`);
  }
  
  handleDuplicateAnchor(anchor, anchorCounts) {
    // Track how many times we've seen this anchor
    if (anchorCounts[anchor] > 0) {
      // This is a duplicate - append the count like Pandoc does
      const numberedAnchor = `${anchor}-${anchorCounts[anchor]}`;
      anchorCounts[anchor]++;
      return numberedAnchor;
    } else {
      // First occurrence
      anchorCounts[anchor] = 1;
      return anchor;
    }
  }

  generateAnchor(title) {
    // Approximate Pandoc's auto_identifiers algorithm:
    // 1. Strip Markdown formatting (attribute blocks, spans, links, images, code, emphasis).
    // 2. Normalize punctuation (some chars to hyphens).
    // 3. Lowercase, collapse whitespace to hyphens, and trim extra hyphens.

    let stripped = title;

    // Remove trailing attribute block, e.g., "{#id .class}"
    stripped = stripped.replace(LinksToFootnotes.HEADING_ATTR_PATTERN, '');

    // Inline spans: "[text]{.class}" -> "text"
    stripped = stripped.replace(/\[([^\]]+)\]\{[^}]*\}/g, '$1');

    // Images: "![alt](url)" -> "alt"
    stripped = stripped.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

    // Links: "[text](url)" -> "text"
    stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Inline code: "`code`" -> "code"
    stripped = stripped.replace(/`([^`]*)`/g, '$1');

    // Emphasis markers: "*text*", "_text_", "~text~", etc. -> "text"
    stripped = stripped.replace(/[*_~^]+/g, '');

    return stripped
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')  // Strip punctuation (matches Pandoc auto_identifiers: apostrophes, colons, quotes etc. are removed, not hyphenated)
      .replace(/\s+/g, '-')      // Replace spaces with hyphens
      .replace(/-+/g, '-')       // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '');    // Remove leading/trailing hyphens
  }

  internalLink(url) {
    return url.startsWith('#');
  }

  formatInternalLink(linkText, anchor) {
    // Remove leading # from anchor
    anchor = anchor.replace(/^#/, '');

    // Look up the anchor in our map
    const info = this.anchorMap[anchor];

    if (!info) {
      // If we can't find the anchor, fall back to the old behavior (footnote)
      return null;
    }

    // When preserving internal links (e.g., Kindle EPUB), keep the markdown
    // link so Pandoc converts it to a clickable internal navigation link.
    // Kindle KF8 supports intra-book links, unlike printed PDF.
    if (this.preserveInternalLinks) {
      return `[${linkText}](#${anchor})`;
    }

    // For PDF: strip the link syntax and return just the link text
    // (printed books can't have clickable links)
    return linkText;
  }

  processFile(filePath) {
    console.log(`Processing ${path.basename(filePath)}...`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Process content line by line to handle footnotes differently
    const lines = content.split('\n');
    const footnotes = [];
    let parentheticalCount = 0;
    
    let inFencedCodeBlock = false;

    const processedLines = lines.map(line => {
      // Track fenced code blocks (``` or ~~~)
      if (/^(`{3,}|~{3,})/.test(line)) {
        inFencedCodeBlock = !inFencedCodeBlock;
        return line;
      }

      // Skip lines inside fenced code blocks
      if (inFencedCodeBlock) {
        return line;
      }

      // Check if this line is a footnote definition
      if (line.match(/^\[?\^[^\]]+\]:/)) {
        // Within footnote definitions, convert links to parentheticals
        return line.replace(LinksToFootnotes.LINK_PATTERN, (match, linkText, url, trailingPunct) => {
          // Remove angle brackets if present
          url = url.replace(/^<|>$/g, '');
          
          // Convert all links to parentheticals in footnotes
          parentheticalCount++;
          return `${linkText} (${url})${trailingPunct}`;
        });
      } else {
        // Mask inline code spans so links inside them aren't converted.
        // Replace each `...` span with a placeholder, apply link conversion,
        // then restore the original code spans.
        const codeSpans = [];
        const masked = line.replace(/`[^`]+`/g, (m) => {
          codeSpans.push(m);
          return `\x00CODE${codeSpans.length - 1}\x00`;
        });

        // Outside footnote definitions, handle links
        const processed = masked.replace(LinksToFootnotes.LINK_PATTERN, (match, linkText, url, trailingPunct) => {
          // Remove angle brackets if present
          url = url.replace(/^<|>$/g, '');
          
          // Check if this is an internal link
          if (this.internalLink(url)) {
            // Try to format as an internal reference
            const formatted = this.formatInternalLink(linkText, url);
            
            if (formatted) {
              return `${formatted}${trailingPunct}`;
            } else {
              // If we can't resolve it, create a footnote (fallback)
              const footnoteId = this.globalFootnoteCounter++;
              footnotes.push({ id: footnoteId, url });
              // Footnote references should appear AFTER punctuation
              return `${linkText}${trailingPunct}[^${footnoteId}]`;
            }
          } else {
            // External link - create footnote
            // Footnote references should appear AFTER punctuation
            const footnoteId = this.globalFootnoteCounter++;
            footnotes.push({ id: footnoteId, url });
            return `${linkText}${trailingPunct}[^${footnoteId}]`;
          }
        });

        // Restore inline code spans (NUL-delimited placeholders)
        // eslint-disable-next-line no-control-regex
        return processed.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeSpans[i]);
      }
    });
    
    let newContent = processedLines.join('\n');
    
    // Fix existing footnote references where they appear before punctuation
    // e.g., "text[^1]." should become "text.[^1]"
    // This ensures consistent formatting for all footnotes (both existing and newly created)
    let footnoteReorderCount = 0;
    newContent = newContent.replace(LinksToFootnotes.FOOTNOTE_BEFORE_PUNCT_PATTERN, (match, footnoteRef, punct) => {
      footnoteReorderCount++;
      return `${punct}${footnoteRef}`;
    });
    
    if (footnoteReorderCount > 0) {
      console.log(`  Reordered ${footnoteReorderCount} footnote ${this.pluralize(footnoteReorderCount, 'reference')} to appear after punctuation`);
    }
    
    // Add footnote definitions at the end of the file if we found any links
    if (footnotes.length > 0) {
      console.log(`  Found ${footnotes.length} ${this.pluralize(footnotes.length, 'link')} to convert to footnotes`);
      
      // Add footnotes at the end
      newContent += '\n\n';
      for (const footnote of footnotes) {
        newContent += `[^${footnote.id}]: ${footnote.url}\n`;
      }
    }
    
    // Report parenthetical conversions
    if (parentheticalCount > 0) {
      console.log(`  Converted ${parentheticalCount} ${this.pluralize(parentheticalCount, 'link')} within footnotes to parentheticals`);
    }
    
    // Only write if content changed
    if (newContent !== originalContent) {
      fs.writeFileSync(filePath, newContent);
      console.log('  Updated successfully');
    } else {
      console.log('  No changes needed');
    }
  }
}

// Script execution
if (isMain(import.meta.url)) {
  (async () => {
    const args = process.argv.slice(2);
    
    if (args.length < 1 || args.length > 3) {
      console.error(`Usage: ${path.basename(process.argv[1])} <source_directory> [--no-backup] [--preserve-internal-links]`);
      console.error(`Example: ${path.basename(process.argv[1])} src`);
      console.error(`Example: ${path.basename(process.argv[1])} src --no-backup`);
      console.error(`Example: ${path.basename(process.argv[1])} src --no-backup --preserve-internal-links`);
      process.exit(1);
    }

    const srcDirectory = args[0];
    const flags = args.slice(1);
    const createBackup = !flags.includes('--no-backup');
    const preserveInternalLinks = flags.includes('--preserve-internal-links');

    if (!fs.existsSync(srcDirectory)) {
      console.error(`Error: Directory '${srcDirectory}' does not exist`);
      process.exit(1);
    }

    // Create a backup directory only if requested
    if (createBackup) {
      const backupDir = generateBackupDirName(srcDirectory);
      console.log(`Creating backup in ${backupDir}...`);
      fs.cpSync(srcDirectory, backupDir, { recursive: true });
      console.log('Backup created successfully');
      
      // Process files
      const converter = new LinksToFootnotes(srcDirectory, createBackup, preserveInternalLinks);
      await converter.processAllFiles();
      
      console.log(`\nDone! Original files backed up to ${backupDir}`);
    } else {
      // Process files
      const converter = new LinksToFootnotes(srcDirectory, createBackup, preserveInternalLinks);
      await converter.processAllFiles();
      
      console.log('\nDone! No backup created (--no-backup specified)');
    }
  })();
}
