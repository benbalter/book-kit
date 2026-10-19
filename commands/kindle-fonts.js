#!/usr/bin/env node
// Generate Kindle-specific CSS with static font-face declarations.
// Kindle e-ink ignores variable fonts (font-weight: 200 900) and falls
// back to system fonts. This script replaces variable @font-face blocks
// with individual static declarations referencing fonts/kindle/*.woff2.

import { readFileSync, writeFileSync } from 'node:fs';
import { calloutSelectors, emojiSelectors } from '../lib/callouts.js';
import { join } from 'node:path';
import { pathFor } from '../lib/config.js';
import { isMain } from '../lib/is-main.js';

// Regex to strip all @font-face blocks (variable or static)
export const FONT_FACE_RE = /@font-face\s*\{[^}]*\}\s*/g;

// Static @font-face declarations for Kindle
export const staticFonts = `/* Static fonts for Kindle e-ink (variable fonts unsupported) */
@font-face {
  font-family: "Source Serif 4";
  font-style: normal;
  font-weight: 400;
  src: url("../fonts/SourceSerif4-Regular.woff2") format("woff2");
}
@font-face {
  font-family: "Source Serif 4";
  font-style: normal;
  font-weight: 700;
  src: url("../fonts/SourceSerif4-Bold.woff2") format("woff2");
}
@font-face {
  font-family: "Source Serif 4";
  font-style: italic;
  font-weight: 400;
  src: url("../fonts/SourceSerif4-Italic.woff2") format("woff2");
}
@font-face {
  font-family: "Source Serif 4";
  font-style: italic;
  font-weight: 700;
  src: url("../fonts/SourceSerif4-BoldItalic.woff2") format("woff2");
}
@font-face {
  font-family: "Source Sans 3";
  font-style: normal;
  font-weight: 400;
  src: url("../fonts/SourceSans3-Regular.woff2") format("woff2");
}
@font-face {
  font-family: "Source Sans 3";
  font-style: normal;
  font-weight: 600;
  src: url("../fonts/SourceSans3-SemiBold.woff2") format("woff2");
}
@font-face {
  font-family: "Source Sans 3";
  font-style: normal;
  font-weight: 700;
  src: url("../fonts/SourceSans3-Bold.woff2") format("woff2");
}
@font-face {
  font-family: "Source Sans 3";
  font-style: italic;
  font-weight: 400;
  src: url("../fonts/SourceSans3-Italic.woff2") format("woff2");
}
@font-face {
  font-family: "Source Code Pro";
  font-style: normal;
  font-weight: 400;
  src: url("../fonts/SourceCodePro-Regular.woff2") format("woff2");
}
@font-face {
  font-family: "Source Code Pro";
  font-style: normal;
  font-weight: 700;
  src: url("../fonts/SourceCodePro-Bold.woff2") format("woff2");
}
@font-face {
  font-family: "Source Code Pro";
  font-style: italic;
  font-weight: 400;
  src: url("../fonts/SourceCodePro-Italic.woff2") format("woff2");
}

`;

// Inline emoji image styling for Kindle (Twemoji PNGs)
export const emojiCss = `
/* Inline emoji images (Twemoji PNGs for Kindle e-ink) */
img.emoji {
  height: 1em !important;
  width: 1em !important;
  vertical-align: middle !important;
  margin: 0 !important;
  padding: 0 !important;
  display: inline !important;
  line-height: inherit;
  background-color: transparent !important;
}
/* Inline callout emoji with label text */
img.callout-emoji {
  height: 1.2em !important;
  width: 1.2em !important;
  display: inline !important;
  margin: 0 0.15em 0 0 !important;
  vertical-align: middle !important;
}
/* Callouts have no fill on Kindle (see calloutFlowCss), so callout emoji
   backgrounds stay transparent — the white-under-alpha PNG composite blends
   into the (unfilled) callout. No per-callout color matching needed. */
${emojiSelectors.flatMap((sel) => [`${sel} img.callout-emoji`, `${sel} img.emoji`]).join(',\n')} {
  background-color: transparent !important;
  background: transparent !important;
}
/* Dark mode: keep emoji backgrounds transparent (callouts are unfilled). */
@media (prefers-color-scheme: dark) {
  img.emoji {
    opacity: 1 !important;
    background-color: transparent !important;
  }
}
`;

// Kindle won't cleanly split a filled, fully-bordered box: it either jumps the
// whole callout to the next screen (leaving a blank gap) or — once allowed to
// split — emits an empty cloned-decoration frame. Drop the fill and the
// box-decoration cloning so callouts reflow across screens like a blockquote.
// The left border (set per-callout in the base CSS) stays as the visual cue,
// and the Lua-injected label still identifies each callout. Kindle-only: the
// shared EPUB (Apple Books / Kobo) keeps the filled boxes via style-epub.css.
//
// Two extra Kindle-only nudges so a callout backfills the bottom of a page
// instead of jumping whole and leaving a blank gap before it:
//   - border-radius: 0 — a rounded box reads as atomic to Kindle's renderer,
//     which then refuses to split it across a screen boundary (rounding is
//     imperceptible on e-ink anyway, so nothing is lost visually).
//   - orphans/widows: 2 — the base CSS sets 3, so any callout under ~6 lines
//     can never satisfy "3 stay, 3 move" and is forced whole onto the next
//     page. Dropping to 2 lets medium/long callouts split and backfill.
// This does NOT eliminate the gap for genuinely short (≤4-line) callouts —
// those can't split without leaving a single-line orphan, which looks worse
// than the gap. The remaining gap there is inherent to reflowable pagination.
export const calloutFlowCss = `
/* Kindle: callouts flow like blockquotes (no fill, no cloned frame). */
${calloutSelectors.join(',\n')} {
  background-color: transparent !important;
  background: transparent !important;
  border-radius: 0 !important;
  orphans: 2 !important;
  widows: 2 !important;
  -webkit-box-decoration-break: slice !important;
  box-decoration-break: slice !important;
  page-break-before: auto !important;
  break-before: auto !important;
  page-break-inside: auto !important;
  break-inside: auto !important;
}
`;

// Replace variable @font-face blocks with static Kindle declarations and append
// Kindle-specific rules (inline emoji images, flowing callouts).
export function generateKindleCss(epubCss) {
  const stripped = epubCss.replace(FONT_FACE_RE, '');
  return staticFonts + stripped + emojiCss + calloutFlowCss;
}

if (isMain(import.meta.url)) {
  const distDir = pathFor('dist');
  const input = join(distDir, 'style-epub.css');
  const output = join(distDir, 'style-kindle.css');
  writeFileSync(output, generateKindleCss(readFileSync(input, 'utf8')));
  console.log(`Generated ${output} with static font-face declarations`);
}
