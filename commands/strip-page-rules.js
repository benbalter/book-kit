#!/usr/bin/env node

/**
 * Strip unsupported CSS features from CSS for EPUB compatibility
 * Uses PostCSS for proper CSS AST manipulation
 * 
 * EPUB does not support:
 * - CSS Paged Media Module features like @page rules with margin boxes
 * - @layer directives
 * - @supports feature queries
 * - @property declarations (CSS Properties and Values API)
 * - Modern pseudo-classes like :where() and :is()
 * - ::before pseudo-elements with content (inconsistent support)
 * - ::marker pseudo-elements (inconsistent support; bullets fall back to inherited text color)
 * - Attribute selectors with ~= operator (e.g., [class~="value"])
 * - Modern color functions like oklch() and color-mix()
 * - CSS Nesting (nested rules must be flattened)
 * - CSS Logical Properties (inconsistent support across e-readers)
 * - @media screen rules (web-browser-specific; EPUB readers use global styles)
 */

import fs from 'node:fs';
import postcss from 'postcss';
import { fileURLToPath } from 'node:url';
import { calloutSelectors, labelledSelectors } from '../lib/callouts.js';
import { isMain } from '../lib/is-main.js';

const __filename = fileURLToPath(import.meta.url);

// Callout selectors that have ::before rules to remove.
// PostCSS/Tailwind v4 normalizes ::before to :before (single colon) in minified
// output, so we match both forms to ensure removal regardless of the input format.
const CALLOUT_SELECTORS = [...labelledSelectors, '.footnotes'].flatMap((sel) => [
  `${sel}::before`,
  `${sel}:before`,
]);

// Callout *box* classes (the boxes themselves, not their descendants like
// `.tldr p`). On reflowable readers, page-break-inside:avoid / break-inside:avoid
// on these boxes forces the entire callout onto the next screen when it won't
// fit, leaving a blank gap at the bottom of the prior screen. We strip those
// declarations for EPUB so callouts flow and split naturally. Print/PDF keeps
// them — WeasyPrint reads dist/style.css directly, not this stripped output.
// (Kindle needs more than this — a filled, bordered box still won't split there.
// commands/kindle-fonts.js drops the fill/box-decoration on the Kindle-only path.)
const CALLOUT_BOX_CLASSES = calloutSelectors;

/**
 * True if a selector targets a callout box itself (any comma-separated part is
 * a bare callout class or that class with a pseudo, e.g. `.tldr:first-child`),
 * as opposed to a descendant such as `.tldr p`.
 * @param {string} selector - CSS selector string
 * @returns {boolean}
 */
function targetsCalloutBox(selector) {
  return selector.split(',').some((part) => {
    const s = part.trim();
    return CALLOUT_BOX_CLASSES.some((c) => s === c || s.startsWith(`${c}:`));
  });
}

/**
 * Remove page-break-inside:avoid / break-inside:avoid from callout-box rules.
 * Returns true if the declaration was removed.
 * @param {import('postcss').Declaration} decl
 * @returns {boolean}
 */
function stripCalloutBreakAvoid(decl) {
  if (
    (decl.prop === 'break-inside' || decl.prop === 'page-break-inside') &&
    /avoid/.test(decl.value) &&
    decl.parent &&
    decl.parent.type === 'rule' &&
    targetsCalloutBox(decl.parent.selector)
  ) {
    decl.remove();
    return true;
  }
  return false;
}

/**
 * Convert unsupported attribute selectors to simpler alternatives
 * Specifically handles [class~="value"] (contains word selector)
 * and removes case-sensitivity flags like [type="value" s]
 * @param {string} selector - CSS selector string
 * @returns {string} Converted selector
 */
function convertAttributeSelectors(selector) {
  // Convert [class~="value"], [class~='value'], [class~=value] to .value
  // Tailwind v4 CLI minifies away quotes when class names are simple identifiers.
  let result = selector.replace(/\[class~=(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_-]+))\]/g, (match, dq, sq, bare) => {
    const className = dq || sq || bare;
    // Check if class name is safe (no special characters that would need escaping)
    if (/^[a-zA-Z0-9_-]+$/.test(className)) {
      return `.${className}`;
    }
    return match;
  });
  
  // Remove case-sensitivity flags from attribute selectors
  // e.g., [type="i" s] → [type="i"]
  result = result.replace(/\[([^\]]+)\s+[is]\]/g, '[$1]');
  
  return result;
}

/**
 * Simplify :not() selectors with multiple arguments
 * EPUB doesn't support :not() with multiple comma-separated selectors
 * @param {string} selector - CSS selector string
 * @returns {string} Simplified selector
 */
function simplifyNotSelector(selector) {
  // Find :not(...) with multiple comma-separated selectors
  // and keep only the first one
  return selector.replace(/:not\(([^)]+)\)/g, (match, content) => {
    const selectors = splitTopLevelCommas(content);
    if (selectors.length > 1) {
      // Keep only the first selector
      return `:not(${selectors[0].trim()})`;
    }
    return match;
  });
}

/**
 * Convert oklch() color to hex fallback
 * oklch(L C H) where L=lightness%, C=chroma, H=hue degrees
 * This is a simplified conversion that maps to approximate hex values
 * @param {string} oklchStr - oklch() color string
 * @returns {string} Hex color fallback
 */
function oklchToHex(oklchStr) {
  // Extract values from oklch(L% C H) or oklch(L C H)
  const match = oklchStr.match(/oklch\(\s*([0-9.]+)(%)?\s+([0-9.]+)\s+([0-9.]+)\s*\)/);
  if (!match) return '#000000'; // Fallback to black
  
  const [, l, lUnit, c, h] = match;
  const rawLightness = parseFloat(l);
  // Normalize lightness:
  // - If a % unit is present, treat value as 0–100%.
  // - If unitless and <= 1, treat as 0–1 and scale to 0–100.
  // - Otherwise assume it's already in 0–100 range.
  const lightness =
    lUnit === '%'
      ? rawLightness
      : (rawLightness <= 1 ? rawLightness * 100 : rawLightness);
  const chroma = parseFloat(c);
  const hue = parseFloat(h);
  
  // Simplified conversion: map lightness to grayscale-ish values
  // For EPUB, we prioritize readability over perfect color matching
  if (chroma < 0.02) {
    // Low chroma means it's basically grayscale
    const gray = Math.round((lightness / 100) * 255);
    return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
  }
  
  // For colors with chroma, map to common web colors based on hue
  // Blue range (200-280 degrees)
  if (hue >= 200 && hue < 280) {
    if (lightness > 80) return '#e3f2fd';
    if (lightness > 60) return '#2196f3';
    if (lightness > 40) return '#1976d2';
    return '#0d47a1';
  }
  // Green range (100-180 degrees)
  if (hue >= 100 && hue < 180) {
    if (lightness > 80) return '#e8f5e9';
    if (lightness > 60) return '#4caf50';
    if (lightness > 40) return '#388e3c';
    return '#1b5e20';
  }
  // Red range (0-60 or 300-360 degrees)
  if (hue < 60 || hue >= 300) {
    if (lightness > 80) return '#ffebee';
    if (lightness > 60) return '#f44336';
    if (lightness > 40) return '#d32f2f';
    return '#b71c1c';
  }
  // Yellow/Orange range (60-100 degrees)
  if (hue >= 60 && hue < 100) {
    if (lightness > 80) return '#fff8e1';
    if (lightness > 60) return '#ffc107';
    if (lightness > 40) return '#f57c00';
    return '#e65100';
  }
  
  // Default: map lightness to grayscale
  const gray = Math.round((lightness / 100) * 255);
  return `#${gray.toString(16).padStart(2, '0').repeat(3)}`;
}

/**
 * Convert color-mix() to static fallback color
 * For simplicity, we'll use the first color in the mix
 * @param {string} colorMixStr - color-mix() function string
 * @returns {string} Fallback color
 */
function colorMixToFallback(colorMixStr) {
  // Extract the first color from color-mix(in colorspace, color1 percent%, color2)
  const match = colorMixStr.match(/color-mix\([^,]+,\s*([^,]+?)\s+\d+%/);
  if (match) {
    const firstColor = match[1].trim();
    // If it's an oklch color, convert it too
    if (firstColor.startsWith('oklch(')) {
      return oklchToHex(firstColor);
    }
    return firstColor;
  }
  return 'transparent'; // Fallback
}

/**
 * Collect CSS custom property definitions from various sources
 * Collects from :root, :host, @property declarations, and other common patterns
 * @param {import('postcss').Root} root - PostCSS root
 * @returns {Map<string, string>} Map of variable names to values
 */
function collectCSSVariables(root) {
  const variables = new Map();
  
  // Collect initial-value from @property declarations (lowest priority)
  // These provide fallback values for Tailwind's internal --tw-* variables
  root.walkAtRules('property', atRule => {
    const propName = atRule.params.trim();
    atRule.walkDecls('initial-value', decl => {
      variables.set(propName, decl.value);
    });
  });
  
  // Selectors (or selector parts) that commonly define CSS variables.
  // We split on commas so multi-selector rules like ":root,:host" or
  // ":root, :host" (Tailwind v4 CLI emits the former) are matched regardless
  // of whitespace.
  const variableSelectorParts = new Set([':root', ':host', '.prose']);
  
  root.walkRules(rule => {
    const parts = rule.selector.split(',').map(s => s.trim());
    if (parts.some(p => variableSelectorParts.has(p))) {
      rule.walkDecls(decl => {
        if (decl.prop.startsWith('--')) {
          variables.set(decl.prop, decl.value);
        }
      });
    }
  });
  
  return variables;
}

/**
 * Resolve a single var() reference to its value
 * Supports fallback values: var(--name, fallback)
 * @param {string} varRef - The var() reference string
 * @param {Map<string, string>} variables - Map of CSS variables
 * @returns {string} Resolved value or original if not found
 */
function resolveVarReference(varRef, variables) {
  // Match var(--name) or var(--name, fallback)
  const match = varRef.match(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\s*\)/);
  if (!match) return varRef;
  
  const [, varName, fallback] = match;
  
  // Look up the variable
  if (variables.has(varName)) {
    let value = variables.get(varName);
    // Recursively resolve if the value contains var() references
    if (value.includes('var(')) {
      value = resolveCSSVariables(value, variables);
    }
    return value;
  }
  
  // Use fallback if provided
  if (fallback !== undefined) {
    let resolvedFallback = fallback.trim();
    // Resolve any var() in the fallback too
    if (resolvedFallback.includes('var(')) {
      resolvedFallback = resolveCSSVariables(resolvedFallback, variables);
    }
    return resolvedFallback;
  }
  
  // Return original if no match and no fallback
  return varRef;
}

/**
 * Resolve all CSS variable references in a value string
 * Handles nested var() and fallback values
 * @param {string} value - CSS value string
 * @param {Map<string, string>} variables - Map of CSS variables
 * @returns {string} Value with variables resolved
 */

/**
 * Regex pattern for matching CSS var() function with optional fallback
 * 
 * Pattern breakdown:
 * - var\(              : Match 'var(' literally
 * - \s*                : Optional whitespace
 * - (--[a-zA-Z0-9_-]+) : Capture group 1 - CSS variable name (--name-123)
 * - \s*                : Optional whitespace
 * - (?:,\s*            : Non-capturing group for optional fallback, starts with comma
 *   ([^()]*            : Capture group 2 - fallback value (no parens, can be empty)
 *   (?:\([^)]*\)       : Or content with balanced parens (for nested functions like rgb())
 *   [^()]*)*           : More non-paren content
 * )?                   : Entire comma+fallback group is optional
 * \s*\)                : Optional whitespace and closing paren
 *
 * Note: Capture group 2 must NOT be independently optional (?), otherwise
 * JavaScript's regex engine skips it on empty fallbacks like var(--x,),
 * returning undefined instead of "".
 */
const CSS_VAR_PATTERN = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*(?:\([^)]*\)[^()]*)*))\s*\)|var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g;

function resolveCSSVariables(value, variables) {
  // Match var() including nested ones - process from innermost out
  let result = value;
  let prevResult = '';
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loops
  
  // Keep resolving until no more var() references or max iterations
  while (result.includes('var(') && result !== prevResult && iterations < maxIterations) {
    prevResult = result;
    // Replace var() references one at a time from the inside out
    // Pattern uses alternation: group 1+2 for var(--name, fallback), group 3 for var(--name)
    result = result.replace(CSS_VAR_PATTERN, 
      (match, varNameWithFallback, fallback, varNameWithout) => {
        const varName = varNameWithFallback || varNameWithout;
        if (variables.has(varName)) {
          return variables.get(varName);
        }
        if (fallback !== undefined) {
          return fallback.trim();
        }
        return match;
      }
    );
    iterations++;
  }
  
  return result;
}

/**
 * Mapping of CSS logical properties to their physical equivalents (LTR).
 * EPUB readers have inconsistent support for CSS Logical Properties,
 * so we convert them to physical properties for maximum compatibility.
 */
const LOGICAL_PROPERTY_MAP = {
  'padding-inline-start': 'padding-left',
  'padding-inline-end': 'padding-right',
  'margin-inline-start': 'margin-left',
  'margin-inline-end': 'margin-right',
  'border-inline-start': 'border-left',
  'border-inline-end': 'border-right',
  'border-inline-start-width': 'border-left-width',
  'border-inline-end-width': 'border-right-width',
  'border-inline-start-style': 'border-left-style',
  'border-inline-end-style': 'border-right-style',
  'border-inline-start-color': 'border-left-color',
  'border-inline-end-color': 'border-right-color',
  'inset-inline-start': 'left',
  'inset-inline-end': 'right',
};

/**
 * Strip Tailwind Typography's .prose-scoped rules from the CSS.
 * 
 * Typography generates ~100 selectors like `.prose h1:not(.not-prose)` with
 * specificity (0,2,1). After @layer stripping, these compete with our bare
 * element selectors (0,0,1), causing cascade bugs. Removing them lets our
 * @media not screen rules (now unwrapped to top level) win cleanly.
 * 
 * For compound selectors (`.lead, .prose .lead:not(.not-prose)`), only the
 * Typography-pattern parts are removed; bare selectors are preserved.
 * 
 * @param {import('postcss').Root} root - PostCSS root
 * @returns {number} Number of rules removed or simplified
 */
function stripTypographyRules(root) {
  let count = 0;
  root.walkRules(rule => {
    const parts = rule.selector.split(',').map(s => s.trim());
    const hasTypographyParts = parts.some(p => p.includes(':not(.not-prose)'));
    if (!hasTypographyParts) return;

    const kept = parts.filter(p => !p.includes(':not(.not-prose)'));
    if (kept.length === 0) {
      rule.remove();
    } else {
      rule.selector = kept.join(', ');
    }
    count++;
  });
  return count;
}

/**
 * PostCSS plugin to strip unsupported CSS features for EPUB
 * @returns {import('postcss').Plugin}
 */
function stripForEpubPlugin() {
  return {
    postcssPlugin: 'strip-for-epub',
    
    // Process everything in Once hook to match sync version's behavior
    Once(root) {
      // First pass: Remove/unwrap at-rules (do this before collecting rules)
      const nodesToRemove = [];
      const nodesToUnwrap = [];
      
      root.walkAtRules(atRule => {
        if (atRule.name === 'supports' || atRule.name === 'page') {
          nodesToRemove.push(atRule);
        } else if (atRule.name === 'layer') {
          if (atRule.nodes && atRule.nodes.length > 0) {
            nodesToUnwrap.push(atRule);
          } else {
            nodesToRemove.push(atRule);
          }
        } else if (atRule.name === 'media' && atRule.params.trim() === 'print') {
          // Remove @media print blocks — EPUB readers ignore print styles
          nodesToRemove.push(atRule);
        } else if (atRule.name === 'media' && atRule.parent && atRule.parent.type === 'rule') {
          nodesToRemove.push(atRule);
        } else if (atRule.name === 'media' && atRule.params && /^screen/.test(atRule.params.trim())) {
          // Strip @media screen (and @media screen and ...) — these are web-browser-specific.
          // EPUB readers use global styles; viewport units and flex within screen queries
          // are unreliable in ebook readers (Kindle, Apple Books, Kobo, etc.).
          nodesToRemove.push(atRule);
        } else if (atRule.name === 'media' && atRule.params && /^not\s+screen$/.test(atRule.params.trim())) {
          // Unwrap @media not screen — EPUB *is* "not screen", so these rules
          // should apply unconditionally. Unwrapping avoids e-reader bugs where
          // @media queries are unsupported or evaluated incorrectly.
          if (atRule.nodes && atRule.nodes.length > 0) {
            nodesToUnwrap.push(atRule);
          } else {
            nodesToRemove.push(atRule);
          }
        } else if (atRule.name === 'media' && atRule.params && /(min|max)-(width|height)/.test(atRule.params)) {
          // Strip responsive media queries (e.g., @media (min-width: 40rem)).
          // These come from Tailwind's responsive utility variants (.prose-lg, etc.)
          // and target browser viewports. EPUB readers reflow content based on
          // device/font settings, not viewport widths, so these are meaningless.
          nodesToRemove.push(atRule);
        }
      });
      
      nodesToRemove.forEach(node => node.remove());
      nodesToUnwrap.forEach(node => node.replaceWith(node.nodes));
      
      // Second pass: Flatten nested rules (CSS Nesting not supported in EPUB)
      flattenNestedRules(root);
      
      // Third pass: Collect CSS variables (from @property, :root, :host, .prose)
      // Must happen before @property removal so initial-values are captured
      const cssVariables = collectCSSVariables(root);
      
      // Fourth pass: Remove @property declarations (unsupported in EPUB)
      root.walkAtRules('property', atRule => atRule.remove());
      
      // Fifth pass: Process rules to simplify selectors
      root.walkRules(rule => {
        // Remove callout :before rules.
        // Normalise ::before → :before before comparing because PostCSS minification
        // converts the canonical double-colon form to the legacy single-colon form in
        // the compiled dist/style.css that this script receives as input.
        const normSelector = rule.selector.replace(/::/g, ':');
        if (CALLOUT_SELECTORS.some(sel => normSelector.includes(sel))) {
          rule.remove();
          return;
        }
        
        // Remove ::marker rules — EPUB readers have inconsistent ::marker support;
        // stripping these lets list markers inherit the text color and remain visible.
        if (rule.selector.includes('::marker') || rule.selector.includes(':marker')) {
          rule.remove();
          return;
        }
        
        // Remove #TOC a::after rules that use target-counter() for page numbers.
        // CSS Paged Media functions (target-counter, counter) are not supported in
        // EPUB/Kindle. Page numbers don't exist in reflowable ebooks.
        if (rule.selector.includes('#TOC') && (rule.selector.includes('::after') || rule.selector.includes(':after'))) {
          rule.remove();
          return;
        }
        
        // Remove ::backdrop and ::file-selector-button — not applicable to EPUB
        if (rule.selector.includes('::backdrop') || rule.selector.includes('::file-selector-button') || rule.selector.includes('::-webkit-datetime-edit')) {
          // If it's a compound selector, strip just the EPUB-irrelevant parts
          const parts = rule.selector.split(',').map(s => s.trim());
          const filtered = parts.filter(s => !s.includes('::backdrop') && !s.includes('::file-selector-button') && !s.includes('::-webkit-datetime-edit'));
          if (filtered.length === 0) {
            rule.remove();
            return;
          }
          rule.selector = filtered.join(', ');
        }
        
        // Remove rules targeting form elements not used in EPUB
        // (button, select, optgroup, textarea, progress are never in book content)
        const formOnlySelectors = /^(button|select|optgroup|textarea|progress)\b/;
        if (formOnlySelectors.test(rule.selector.trim())) {
          rule.remove();
          return;
        }
        
        // Remove form/input pseudo-elements — not applicable to ebook content
        const formPseudos = ['::-moz-placeholder', '::placeholder', '::-webkit-search-decoration',
          '::-webkit-inner-spin-button', '::-webkit-calendar-picker-indicator',
          ':-moz-ui-invalid', ':-moz-focusring', '::-moz-focusring',
          '::-webkit-date-and-time-value'];
        if (formPseudos.some(p => rule.selector.includes(p))) {
          rule.remove();
          return;
        }
        
        // Remove position: fixed/sticky and transition utilities — unsupported in EPUB
        if (/^\.(fixed|sticky|transition)\b/.test(rule.selector.trim())) {
          rule.remove();
          return;
        }
        
        // Step 1: Convert attribute selectors
        if (rule.selector.includes('[class~=') || rule.selector.match(/\[[^\]]+\s+[is]\]/)) {
          rule.selector = convertAttributeSelectors(rule.selector);
        }
        
        // Step 2: Simplify :where() and :is() pseudo-classes
        if (rule.selector.includes(':where(')) {
          rule.selector = simplifyPseudoClass(rule.selector, ':where(');
        }
        if (rule.selector.includes(':is(')) {
          rule.selector = simplifyPseudoClass(rule.selector, ':is(', true);
        }
        
        // Step 3: Simplify :not() with multiple selectors
        if (rule.selector.includes(':not(') && rule.selector.match(/:not\([^)]*,/)) {
          rule.selector = simplifyNotSelector(rule.selector);
        }
      });
      
      // Fifth-B pass: Strip Tailwind Typography's .prose-scoped rules.
      // Must run AFTER selector simplification (pass 5) because Tailwind v4
      // uses :where([class~="not-prose"]) which gets simplified to
      // :not(.not-prose) by the attribute/pseudo-class transforms above.
      stripTypographyRules(root);
      
      // Sixth pass: Process declarations - resolve CSS variables, convert colors,
      //   and convert logical properties to physical equivalents
      // Note: When postcss-preset-env runs first (async pipeline), most of these
      // are already handled. The custom code remains as a fallback for the sync
      // version and catches anything the ecosystem tools miss.
      root.walkDecls(decl => {
        // Guard: postcss-preset-env may leave declarations with undefined values
        if (!decl.value) {
          decl.remove();
          return;
        }
        // Drop callout-box break-inside:avoid so callouts don't leave blank
        // gaps before page breaks on reflowable readers (Kindle, etc.).
        if (stripCalloutBreakAvoid(decl)) return;
        // Resolve CSS variables to static values for EPUB compatibility
        if (decl.value.includes('var(')) {
          decl.value = resolveCSSVariables(decl.value, cssVariables);
        }
        // Convert oklch colors
        if (decl.value.includes('oklch(')) {
          decl.value = decl.value.replace(/oklch\([^)]+\)/g, (match) => oklchToHex(match));
        }
        // Convert color-mix
        if (decl.value.includes('color-mix(')) {
          decl.value = decl.value.replace(/color-mix\([^)]+\)/g, (match) => colorMixToFallback(match));
        }
        // Convert CSS logical properties to physical equivalents (LTR)
        // EPUB readers have inconsistent support for logical properties
        if (LOGICAL_PROPERTY_MAP[decl.prop]) {
          decl.prop = LOGICAL_PROPERTY_MAP[decl.prop];
        }
        // Convert flex/grid display values to block for EPUB compatibility
        // Kindle and older e-readers have inconsistent flexbox/grid support
        if (decl.prop === 'display') {
          if (decl.value === 'flex' || decl.value === 'grid') {
            decl.value = 'block';
          } else if (decl.value === 'inline-flex' || decl.value === 'inline-grid') {
            decl.value = 'inline-block';
          }
        }
        // Remove flex/grid-only properties that are meaningless without flex/grid layout
        const FLEX_GRID_ONLY_PROPS = [
          'flex-direction', 'flex-wrap', 'flex-flow', 'justify-content',
          'align-items', 'align-content', 'align-self', 'flex-grow',
          'flex-shrink', 'flex-basis', 'flex', 'order',
          'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
          'grid-column', 'grid-row', 'grid-area', 'grid-gap', 'grid-auto-flow',
          'grid-auto-columns', 'grid-auto-rows', 'gap', 'row-gap', 'column-gap',
          'place-items', 'place-content', 'place-self',
        ];
        if (FLEX_GRID_ONLY_PROPS.includes(decl.prop)) {
          decl.remove();
          return;
        }
        // Convert rem to em for Kindle/e-reader compatibility.
        // EPUB body font-size is always 1em (reader-controlled), making rem and em
        // numerically equivalent. em is reliably supported across all e-readers
        // while rem support varies on older Kindle firmware.
        if (/\.?\d+rem\b/.test(decl.value)) {
          decl.value = decl.value.replace(/(\d*\.?\d+)rem\b/g, '$1em');
        }
        // Strip float — Kindle has poor float support, especially on
        // pseudo-elements like ::first-letter. EPUB layout should use
        // block-level elements, not floats.
        if (decl.prop === 'float') {
          decl.remove();
          return;
        }
        // Convert CSS open-quote/close-quote to actual Unicode characters.
        // Kindle doesn't reliably support the CSS quotes property, so
        // open-quote/close-quote may silently fail. Use explicit curly
        // quote characters instead.
        if (decl.prop === 'content') {
          if (decl.value === 'open-quote') {
            decl.value = '"\u201C"';
          } else if (decl.value === 'close-quote') {
            decl.value = '"\u201D"';
          }
        }
        // Remove declarations with empty values (e.g., from Tailwind CSS v4 empty fallbacks
        // like var(--tw-blur,) which resolve to empty strings, producing invalid CSS like
        // "filter: ;")
        if (decl.value.trim() === '') {
          decl.remove();
        }
      });

      // Seventh pass: Remove declarations with empty values left by unresolved variables
      // (e.g., transform: ; or filter: ; from Tailwind utility classes)
      root.walkDecls(decl => {
        if (decl.value.trim() === '' || decl.value.trim() === ';') {
          decl.remove();
        }
      });

      // Remove rules that became empty after declaration cleanup
      root.walkRules(rule => {
        if (rule.nodes && rule.nodes.length === 0) {
          rule.remove();
        }
      });

      // Eighth pass: Clean up all CSS custom property declarations
      // After resolving all var() references, custom property declarations
      // are dead weight — no var() references remain to use them
      root.walkDecls(decl => {
        if (decl.prop.startsWith('--')) {
          decl.remove();
        }
      });

      // Remove rules that became empty after stripping variables
      root.walkRules(rule => {
        if (rule.nodes && rule.nodes.length === 0) {
          rule.remove();
        }
      });

      // Ninth pass: Pre-compute calc() expressions for EPUB compatibility
      root.walkDecls(decl => {
        if (decl.value.includes('calc(')) {
          decl.value = decl.value.replace(/calc\(([^)]+)\)/g, (match, expr) => {
            try {
              // Only evaluate simple arithmetic (no variables, no complex expressions)
              const sanitized = expr.trim();
              if (/^[\d.+\-*/\s()]+$/.test(sanitized)) {
                const result = Function('"use strict"; return (' + sanitized + ')')();
                if (typeof result === 'number' && isFinite(result)) {
                  return String(Math.round(result * 10000) / 10000);
                }
              }
            } catch { /* keep original if evaluation fails */ }
            return match;
          });
        }
      });
    }
  };
}
stripForEpubPlugin.postcss = true;

/**
 * Flatten nested rules by hoisting them to root level
 * @param {import('postcss').Root} root - PostCSS root
 */
function flattenNestedRules(root) {
  const rulesToHoist = [];
  
  root.walkRules((rule) => {
    // Find any rules nested inside this rule
    rule.each((node) => {
      if (node.type === 'rule') {
        // This is a nested rule - we need to hoist it
        // Combine parent and child selectors
        const parentSelectors = rule.selector.split(',').map(s => s.trim());
        const childSelectors = node.selector.split(',').map(s => s.trim());
        
        const combinedSelectors = [];
        for (const parent of parentSelectors) {
          for (const child of childSelectors) {
            // If child starts with &, replace it with parent
            if (child.startsWith('&')) {
              combinedSelectors.push(parent + child.substring(1));
            } else {
              // Otherwise, child is a descendant
              combinedSelectors.push(`${parent} ${child}`);
            }
          }
        }
        
        // Create a new rule at root level with combined selector
        const newRule = node.clone();
        newRule.selector = combinedSelectors.join(', ');
        
        rulesToHoist.push({ rule: newRule, after: rule });
        
        // Remove the nested rule
        node.remove();
      }
    });
  });
  
  // Insert hoisted rules after their parent rules, preserving original order
  const lastInsertedByParent = new Map();
  for (const { rule, after } of rulesToHoist) {
    const referenceNode = lastInsertedByParent.get(after) || after;
    referenceNode.after(rule);
    lastInsertedByParent.set(after, rule);
  }
  
  // Repeat until no more nested rules (for deeply nested structures)
  if (rulesToHoist.length > 0) {
    flattenNestedRules(root);
  }
}

/**
 * Simplify :where() or :is() pseudo-classes in a selector
 * @param {string} selector - CSS selector
 * @param {string} pseudoClass - Pseudo-class to simplify (e.g., ':where(' or ':is(')
 * @param {boolean} firstOnly - If true, keep only first item in comma-separated list
 * @returns {string} Simplified selector
 */
function simplifyPseudoClass(selector, pseudoClass, firstOnly = false) {
  let result = selector;
  
  // Keep processing until no more instances of the pseudo-class remain
  while (result.includes(pseudoClass)) {
    const startIndex = result.indexOf(pseudoClass);
    if (startIndex === -1) break;
    
    const parenStart = startIndex + pseudoClass.length - 1; // Position of '('
    const [innerContent, endPos] = extractBalancedParens(result, parenStart);
    
    if (innerContent !== null) {
      let replacement = innerContent;
      if (firstOnly) {
        // For :is(), keep only the first selector
        const selectors = splitTopLevelCommas(innerContent);
        replacement = selectors[0].trim();
      }
      result = result.slice(0, startIndex) + replacement + result.slice(endPos);
      // Loop again to handle any nested pseudo-classes that were inside
    } else {
      // Can't extract properly, break to avoid infinite loop
      break;
    }
  }
  
  return result;
}

/**
 * Extract content from balanced parentheses
 * @param {string} content - String content
 * @param {number} startPos - Position of opening parenthesis
 * @returns {[string|null, number]} [content inside parens, position after closing paren]
 */
function extractBalancedParens(content, startPos) {
  if (content[startPos] !== '(') {
    return [null, startPos];
  }
  
  let depth = 1;
  let i = startPos + 1;
  
  while (i < content.length && depth > 0) {
    if (content[i] === '(') {
      depth++;
    } else if (content[i] === ')') {
      depth--;
    }
    i++;
  }
  
  if (depth !== 0) {
    return [null, startPos];
  }
  
  // Return content inside parens and position after closing paren
  return [content.slice(startPos + 1, i - 1), i];
}

/**
 * Split a string by commas, but only at the top level (not inside parentheses)
 * @param {string} str - String to split
 * @returns {string[]} Array of parts
 */
function splitTopLevelCommas(str) {
  const parts = [];
  let current = '';
  let depth = 0;
  
  for (const char of str) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

/**
 * Strip all unsupported CSS features for EPUB using PostCSS
 * 
 * Uses a two-phase pipeline:
 * 1. postcss-preset-env: Standard CSS downgrading (oklch, color-mix, logical props)
 * 2. stripForEpubPlugin: EPUB-specific stripping (@layer, @page, @media print, 
 *    CSS variables, callouts, etc.)
 * 
 * Note: CSS variable resolution is handled by stripForEpubPlugin (not postcss-preset-env)
 * because postcss-preset-env's custom-properties feature creates duplicate rule blocks
 * when expanding variables in Tailwind v4 output.
 * 
 * @param {string} cssContent - Original CSS content
 * @returns {Promise<string>} Processed CSS content
 */
async function stripForEpub(cssContent) {
  const postcssPresetEnv = (await import('postcss-preset-env')).default;
  
  const result = await postcss([
    // Phase 1: Standard CSS downgrading via ecosystem tools
    // Handles oklch→hex, color-mix→static, logical→physical properties
    postcssPresetEnv({
      stage: 0,
      features: {
        // Variable resolution is handled by our custom plugin instead
        'custom-properties': false,
        'logical-properties-and-values': { dir: 'ltr' },
        'oklab-function': true,
        'color-mix': true,
      },
    }),
    // Phase 2: EPUB-specific transformations
    stripForEpubPlugin(),
  ]).process(cssContent, { from: undefined });
  return result.css;
}

/**
 * Synchronous version for testing (processes string directly)
 * @param {string} cssContent - Original CSS content
 * @returns {string} Processed CSS content
 */
function stripForEpubSync(cssContent) {
  const root = postcss.parse(cssContent);
  
  // First pass: Remove/unwrap at-rules (do this before collecting rules)
  const nodesToRemove = [];
  const nodesToUnwrap = [];
  
  root.walkAtRules(atRule => {
    if (atRule.name === 'supports' || atRule.name === 'page') {
      nodesToRemove.push(atRule);
    } else if (atRule.name === 'layer') {
      if (atRule.nodes && atRule.nodes.length > 0) {
        nodesToUnwrap.push(atRule);
      } else {
        nodesToRemove.push(atRule);
      }
    } else if (atRule.name === 'media' && atRule.params.trim() === 'print') {
      // Remove @media print blocks — EPUB readers ignore print styles
      nodesToRemove.push(atRule);
    } else if (atRule.name === 'media' && atRule.parent && atRule.parent.type === 'rule') {
      nodesToRemove.push(atRule);
    } else if (atRule.name === 'media' && atRule.params && /^screen/.test(atRule.params.trim())) {
      // Strip @media screen (and @media screen and ...) — these are web-browser-specific.
      // EPUB readers use global styles; viewport units and flex within screen queries
      // are unreliable in ebook readers (Kindle, Apple Books, Kobo, etc.).
      nodesToRemove.push(atRule);
    }
  });
  
  nodesToRemove.forEach(node => node.remove());
  nodesToUnwrap.forEach(node => node.replaceWith(node.nodes));
  
  // Second pass: Flatten nested rules
  flattenNestedRules(root);
  
  // Third pass: Collect CSS variables (from @property, :root, :host, .prose)
  // Must happen before @property removal so initial-values are captured
  const cssVariables = collectCSSVariables(root);
  
  // Fourth pass: Remove @property declarations (unsupported in EPUB)
  root.walkAtRules('property', atRule => atRule.remove());
  
  // Fifth pass: Process rules to simplify selectors
  root.walkRules(rule => {
    // Remove callout :before rules.
    // Normalise ::before → :before before comparing because PostCSS minification
    // converts the canonical double-colon form to the legacy single-colon form in
    // the compiled dist/style.css that this script receives as input.
    const normSelector = rule.selector.replace(/::/g, ':');
    if (CALLOUT_SELECTORS.some(sel => normSelector.includes(sel))) {
      rule.remove();
      return;
    }
    
    // Remove ::marker rules — EPUB readers have inconsistent ::marker support;
    // stripping these lets list markers inherit the text color and remain visible.
    if (rule.selector.includes('::marker') || rule.selector.includes(':marker')) {
      rule.remove();
      return;
    }
    
    // Remove ::backdrop and ::file-selector-button — not applicable to EPUB
    if (rule.selector.includes('::backdrop') || rule.selector.includes('::file-selector-button') || rule.selector.includes('::-webkit-datetime-edit')) {
      const parts = rule.selector.split(',').map(s => s.trim());
      const filtered = parts.filter(s => !s.includes('::backdrop') && !s.includes('::file-selector-button') && !s.includes('::-webkit-datetime-edit'));
      if (filtered.length === 0) {
        rule.remove();
        return;
      }
      rule.selector = filtered.join(', ');
    }
    
    // Remove rules targeting form elements not used in EPUB
    const formOnlySelectors = /^(button|select|optgroup|textarea|progress)\b/;
    if (formOnlySelectors.test(rule.selector.trim())) {
      rule.remove();
      return;
    }
    
    // Step 1: Convert attribute selectors
    if (rule.selector.includes('[class~=') || rule.selector.match(/\[[^\]]+\s+[is]\]/)) {
      rule.selector = convertAttributeSelectors(rule.selector);
    }
    
    // Step 2: Simplify :where() and :is() pseudo-classes
    if (rule.selector.includes(':where(')) {
      rule.selector = simplifyPseudoClass(rule.selector, ':where(');
    }
    if (rule.selector.includes(':is(')) {
      rule.selector = simplifyPseudoClass(rule.selector, ':is(', true);
    }
    
    // Step 3: Simplify :not() with multiple selectors
    if (rule.selector.includes(':not(') && rule.selector.match(/:not\([^)]*,/)) {
      rule.selector = simplifyNotSelector(rule.selector);
    }
  });
  
  // Fifth-B pass: Strip Tailwind Typography's .prose-scoped rules.
  // Must run AFTER selector simplification (pass 5) — see async version comment.
  stripTypographyRules(root);
  
  // Sixth pass: Process declarations - resolve CSS variables, convert colors,
  //   and convert logical properties to physical equivalents
  root.walkDecls(decl => {
    // Drop callout-box break-inside:avoid (see async version / helper comment).
    if (stripCalloutBreakAvoid(decl)) return;
    // Resolve CSS variables to static values for EPUB compatibility
    if (decl.value.includes('var(')) {
      decl.value = resolveCSSVariables(decl.value, cssVariables);
    }
    // Convert oklch colors
    if (decl.value.includes('oklch(')) {
      decl.value = decl.value.replace(/oklch\([^)]+\)/g, (match) => oklchToHex(match));
    }
    // Convert color-mix
    if (decl.value.includes('color-mix(')) {
      decl.value = decl.value.replace(/color-mix\([^)]+\)/g, (match) => colorMixToFallback(match));
    }
    // Convert CSS logical properties to physical equivalents (LTR)
    // EPUB readers have inconsistent support for logical properties
    if (LOGICAL_PROPERTY_MAP[decl.prop]) {
      decl.prop = LOGICAL_PROPERTY_MAP[decl.prop];
    }
    // Convert flex/grid display values to block for EPUB compatibility
    if (decl.prop === 'display') {
      if (decl.value === 'flex' || decl.value === 'grid') {
        decl.value = 'block';
      } else if (decl.value === 'inline-flex' || decl.value === 'inline-grid') {
        decl.value = 'inline-block';
      }
    }
    // Convert rem to em for Kindle/e-reader compatibility.
    // EPUB body font-size is always 1em (reader-controlled), making rem and em
    // numerically equivalent. em is reliably supported across all e-readers
    // while rem support varies on older Kindle firmware.
    if (/\.?\d+rem\b/.test(decl.value)) {
      decl.value = decl.value.replace(/(\d*\.?\d+)rem\b/g, '$1em');
    }
    // Strip float — Kindle has poor float support, especially on
    // pseudo-elements like ::first-letter.
    if (decl.prop === 'float') {
      decl.remove();
      return;
    }
    // Convert CSS open-quote/close-quote to actual Unicode characters.
    if (decl.prop === 'content') {
      if (decl.value === 'open-quote') {
        decl.value = '"\u201C"';
      } else if (decl.value === 'close-quote') {
        decl.value = '"\u201D"';
      }
    }
    // Remove flex/grid-only properties that are meaningless without flex/grid layout
    const FLEX_GRID_ONLY_PROPS = [
      'flex-direction', 'flex-wrap', 'flex-flow', 'justify-content',
      'align-items', 'align-content', 'align-self', 'flex-grow',
      'flex-shrink', 'flex-basis', 'flex', 'order',
      'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
      'grid-column', 'grid-row', 'grid-area', 'grid-gap', 'grid-auto-flow',
      'grid-auto-columns', 'grid-auto-rows', 'gap', 'row-gap', 'column-gap',
      'place-items', 'place-content', 'place-self',
    ];
    if (FLEX_GRID_ONLY_PROPS.includes(decl.prop)) {
      decl.remove();
      return;
    }
  });
  
  // Seventh pass: Clean up all CSS custom property declarations
  root.walkDecls(decl => {
    if (decl.prop.startsWith('--')) {
      decl.remove();
    }
  });

  // Remove rules that became empty after stripping variables
  root.walkRules(rule => {
    if (rule.nodes && rule.nodes.length === 0) {
      rule.remove();
    }
  });

  // Eighth pass: Pre-compute calc() expressions
  root.walkDecls(decl => {
    if (decl.value.includes('calc(')) {
      decl.value = decl.value.replace(/calc\(([^)]+)\)/g, (match, expr) => {
        try {
          const sanitized = expr.trim();
          if (/^[\d.+\-*/\s()]+$/.test(sanitized)) {
            const result = Function('"use strict"; return (' + sanitized + ')')();
            if (typeof result === 'number' && isFinite(result)) {
              return String(Math.round(result * 10000) / 10000);
            }
          }
        } catch { /* keep original if evaluation fails */ }
        return match;
      });
    }
  });
  
  return root.toString();
}

/**
 * Process CSS file and write output
 * @param {string} inputFile - Path to input CSS file
 * @param {string} outputFile - Path to output CSS file
 */
async function processFile(inputFile, outputFile) {
  const cssContent = fs.readFileSync(inputFile, 'utf8');
  // Use async version to ensure both code paths stay in sync
  const processedContent = await stripForEpub(cssContent);
  
  fs.writeFileSync(outputFile, processedContent);
  
  console.log(`Stripped unsupported CSS features from ${inputFile} -> ${outputFile}`);
  console.log('  - @layer directives (unwrapped, content preserved)');
  console.log('  - @supports feature queries (removed)');
  console.log('  - @page rules (removed)');
  console.log('  - @media print blocks (removed)');
  console.log('  - @property declarations (initial-values captured, then removed)');
  console.log('  - Nested @media rules (CSS Nesting - removed)');
  console.log('  - CSS Nesting (flattened to EPUB-compatible syntax)');
  console.log('  - :where() and :is() pseudo-classes (simplified)');
  console.log('  - :not() with multiple selectors (simplified to first selector)');
  console.log('  - Callout ::before pseudo-elements (removed)');
  console.log('  - ::marker pseudo-elements (removed)');
  console.log('  - ::backdrop and ::file-selector-button pseudo-elements (removed)');
  console.log('  - Form element selectors (button, select, textarea, etc. removed)');
  console.log('  - Attribute selectors with ~= (converted to classes)');
  console.log('  - Attribute selector case-sensitivity flags (removed)');
  console.log('  - CSS custom properties/variables (resolved to static values)');
  console.log('  - CSS custom property declarations (removed from :root)');
  console.log('  - oklch() color functions (converted to hex)');
  console.log('  - color-mix() functions (converted to fallback)');
  console.log('  - CSS logical properties (converted to physical equivalents)');
  console.log('  - calc() expressions (pre-computed where possible)');
  console.log('  - rem units (converted to em for Kindle compatibility)');
  console.log('  - Tailwind Typography .prose rules (stripped to eliminate cascade conflicts)');
  console.log('  - float properties (stripped for Kindle compatibility)');
  console.log('  - open-quote/close-quote (converted to Unicode curly quotes)');
}

// Export for testing
export {
  extractBalancedParens,
  simplifyPseudoClass,
  splitTopLevelCommas,
  stripForEpub,
  stripForEpubSync,
  stripForEpubPlugin,
  stripTypographyRules,
  processFile,
  CALLOUT_SELECTORS,
  LOGICAL_PROPERTY_MAP,
  convertAttributeSelectors,
  simplifyNotSelector,
  oklchToHex,
  colorMixToFallback,
  flattenNestedRules,
  collectCSSVariables,
  resolveCSSVariables,
  resolveVarReference
};

// Run if executed directly
if (isMain(import.meta.url)) {
  const inputFile = process.argv[2] || 'dist/style.css';
  const outputFile = process.argv[3] || 'dist/style-epub.css';
  
  processFile(inputFile, outputFile).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
