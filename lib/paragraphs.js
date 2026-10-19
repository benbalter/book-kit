/**
 * Shared paragraph extraction for prose-length analysis.
 *
 * Splits a chapter's Markdown into prose paragraphs (body text and callout
 * text), skipping code blocks, headings, list items, blockquotes, tables,
 * and footnote definitions. Used by the paragraph-length validator
 * (validators/paragraph-length.js); keep any other paragraph analysis on this
 * one implementation so thresholds and reports always agree.
 */

/**
 * Maximum words per paragraph before it's flagged as a skim-ability problem.
 * Fixed rather than recomputed from the book (which would make it a moving
 * target), and high enough to flag only the longest few percent of paragraphs
 * in typical nonfiction prose. Tune it with validators.options.paragraph-length.
 */
import { isNonChapter } from './structure.js';

const MAX_PARAGRAPH_WORDS = 120;

/**
 * Strip inline Markdown/Pandoc markup from a paragraph, preserving visible
 * text. Heuristic, not a parser — sufficient for word/character counting.
 * @param {string} text - Single paragraph of Markdown
 * @returns {string} Plaintext-ish content
 */
function stripInlineMarkup(text) {
  let stripped = text;

  // Inline code: collapse to a single-word placeholder so `git commit -m "…"`
  // counts as one token, not five
  stripped = stripped.replace(/`[^`]*`/g, 'code');

  // Images: keep alt text, drop URLs
  stripped = stripped.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1 ');

  // Links: keep link text, drop URLs
  stripped = stripped.replace(/\[([^\]]*)\]\([^)]+\)/g, '$1 ');

  // Pandoc inline spans, e.g. [API]{.smallcaps}: keep the text
  stripped = stripped.replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1');

  // Footnote references: not visible prose
  stripped = stripped.replace(/\[\^[^\]]+\]/g, '');

  // Emphasis and strong emphasis markers (*, _, **, __)
  stripped = stripped.replace(/(\*\*|__)(.*?)\1/g, '$2');
  stripped = stripped.replace(/(\*|_)(.*?)\1/g, '$2');

  // Collapse whitespace
  stripped = stripped.replace(/\s+/g, ' ').trim();

  return stripped;
}

/**
 * Extract prose paragraphs from chapter Markdown.
 *
 * A paragraph is a run of consecutive non-blank prose lines. Boundaries:
 * blank lines, headings, list items, blockquotes, tables, footnote
 * definitions, HTML comments, and fenced div markers (:::). Fenced code
 * blocks are skipped entirely. Paragraphs inside fenced divs (callouts:
 * .tldr, .pro-tip, .for-managers, etc.) are included and tagged
 * `inCallout: true` — a wall of text in a box is still a wall of text.
 *
 * @param {string} content - Raw chapter Markdown
 * @returns {Array<{line: number, text: string, plain: string, words: number,
 *   chars: number, sentences: number, inCallout: boolean}>}
 *   One entry per paragraph; `line` is the 1-based line where it starts.
 */
function extractParagraphs(content) {
  const lines = content.split('\n');
  const paragraphs = [];

  let inCodeBlock = false;
  let inCallout = false;
  let paragraphLines = [];
  let paragraphStartLine = 0;
  let paragraphInCallout = false;

  const flush = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(' ');
    const plain = stripInlineMarkup(text);
    const words = plain.length === 0
      ? 0
      : plain.split(/\s+/).filter(word => word.length > 0).length;
    // Sentence count is a rough heuristic: terminal punctuation followed by
    // whitespace or end-of-paragraph
    const sentences = (plain.match(/[.!?](\s|$)/g) || []).length;
    paragraphs.push({
      line: paragraphStartLine,
      text,
      plain,
      words,
      chars: plain.length,
      sentences,
      inCallout: paragraphInCallout
    });
    paragraphLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code blocks: skip contents entirely
    if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
      flush();
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Fenced div open (e.g. ::: {.pro-tip custom-style="pro-tip"})
    if (/^:::\s*\{/.test(trimmed)) {
      flush();
      inCallout = true;
      continue;
    }
    // Fenced div close
    if (/^:::\s*$/.test(trimmed)) {
      flush();
      inCallout = false;
      continue;
    }

    // Non-prose block-level lines end the current paragraph
    if (
      /^#{1,6}\s/.test(line) ||          // headings
      /^\s*[-*+]\s/.test(line) ||        // bullet list items
      /^\s*\d+\.\s/.test(line) ||        // numbered list items
      /^\s{0,3}>/.test(line) ||          // blockquotes
      /^\s*\|/.test(line) ||             // tables
      /^\[\^[^\]]+\]:/.test(trimmed) ||  // footnote definitions
      /^<!--/.test(trimmed)              // HTML comments (e.g. textlint directives)
    ) {
      flush();
      continue;
    }

    if (trimmed === '') {
      flush();
      continue;
    }

    if (paragraphLines.length === 0) {
      paragraphStartLine = i + 1;
      paragraphInCallout = inCallout;
    }
    paragraphLines.push(trimmed);
  }
  flush();

  return paragraphs;
}

/**
 * Files exempt from paragraph-length checks: structural pages, key-takeaways
 * collections, and scratch drafts (see lib/structure.js).
 * @param {string} filePath - Path to chapter file (e.g. src/foo.md)
 * @returns {boolean} True if the file should be skipped
 */
function isParagraphLengthExempt(filePath) {
  return isNonChapter(filePath);
}

export {
  extractParagraphs,
  stripInlineMarkup,
  isParagraphLengthExempt,
  MAX_PARAGRAPH_WORDS
};
