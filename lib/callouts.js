// The callout registry (book.config.yml `callouts`), with helpers for the CSS
// post-processors. Outside a book (e.g. unit tests) it falls back to the kit
// defaults, so importing a command never requires a book.config.yml.

import { loadConfigOrDefaults } from './config.js';

export const callouts = loadConfigOrDefaults().callouts;

// All callout classes, as selectors: ['.tldr', '.pro-tip', ...]
export const calloutSelectors = callouts.map((c) => `.${c.class}`);

// Callouts whose label CSS draws with ::before (the build injects the label
// as text for EPUB, so those pseudo-elements are stripped there).
export const labelledSelectors = callouts.filter((c) => c.label).map((c) => `.${c.class}`);

// Callouts whose label carries an emoji.
export const emojiSelectors = callouts.filter((c) => c.emoji).map((c) => `.${c.class}`);
