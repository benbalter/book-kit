#!/usr/bin/env node

// book-kit validate: run the book's validators and print what they find.
//
// Validators come from three places, run in this order:
//   1. the kit's built-ins (validators/, in BUILTIN_VALIDATORS order)
//   2. preset validators: every *.js file in <preset>/validators/, for each
//      preset the book extends, in merge order, files sorted by name
//   3. the book's plugins (validators.plugins in book.config.yml)
//
// All three share one shape: an ES module whose default export is
// { name, tags?, defaults?, run(ctx) }, where run (sync or async) returns
// { errors, warnings }. ctx has the resolved config, the index.yml file list
// (indexFiles), the chapter files under paths.src (chapters), the validator's
// options (its defaults deep-merged with validators.options.<name>), and its
// intentional exceptions (allow, a Set from validators.allow.<name>).
//
//   book-kit validate                 run every validator
//   book-kit validate --list          print the built-in validator names
//   book-kit validate --list --verbose  name, severity, tags, and source of every validator

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { isMain } from '../lib/is-main.js';
import { config, getChapters, getIndexFiles, optionsFor } from '../lib/validate.js';
import { BUILTIN_VALIDATORS } from '../validators/index.js';

/**
 * The ctx a validator's run() gets.
 * @param {{name: string, defaults?: object}} validator
 * @param {{config: object, indexFiles: string[], chapters: string[]}} base
 * @returns {{config: object, indexFiles: string[], chapters: string[], options: object, allow: Set<string>}}
 */
function contextFor(validator, base) {
  return {
    ...base,
    options: optionsFor(validator.name, validator.defaults ?? {}, base.config),
    allow: new Set(base.config.validators.allow?.[validator.name] ?? []),
  };
}

// The built-ins other than `chapter`, as [name, fn] pairs where fn takes the
// index.yml file list. Kept for callers of the pre-module API.
const VALIDATORS = BUILTIN_VALIDATORS
  .filter((validator) => validator.name !== 'chapter')
  .map((validator) => [
    validator.name,
    (indexFiles) => validator.run(contextFor(validator, { config, indexFiles, chapters: getChapters() })),
  ]);

/**
 * Apply a validator's configured severity to its results. Severity per name
 * comes from validators.severity in book.config.yml: "error" promotes
 * warnings to errors, "warn" demotes errors to warnings, and "on" (or no
 * entry) passes results through as written. ("off" skips the validator
 * before it runs.)
 * @param {string} name - Validator name (a validators.severity key)
 * @param {{errors?: string[], warnings?: string[]}} result
 * @param {object} [cfg] - Resolved config
 * @returns {{errors: string[], warnings: string[]}}
 */
function applySeverity(name, { errors = [], warnings = [] }, cfg = config) {
  const severity = cfg.validators.severity?.[name];
  if (severity === 'error') return { errors: [...errors, ...warnings], warnings: [] };
  if (severity === 'warn') return { errors: [], warnings: [...errors, ...warnings] };
  return { errors, warnings };
}

/**
 * Import a validator module and check its shape.
 * @param {string} file - Absolute path to the module
 * @param {string} what - How to name it in an error
 */
async function importValidator(file, what) {
  const mod = await import(pathToFileURL(file).href);
  const validator = mod.default;
  if (!validator?.name || typeof validator.run !== 'function') {
    throw new Error(`${what} must export default { name, run(ctx) }`);
  }
  return validator;
}

/**
 * Where a validators.plugins entry lives. A path (starting with "." or "/",
 * or ending in .js or .mjs) is relative to the book root; anything else is an
 * npm package, resolved from the book root as Node would.
 * @param {string} spec - The validators.plugins entry
 * @param {string} root - Book root
 * @returns {string} Absolute path to the module
 */
function resolvePlugin(spec, root) {
  if (spec.startsWith('.') || spec.startsWith('/') || /\.m?js$/.test(spec)) {
    return path.resolve(root, spec);
  }
  try {
    return createRequire(path.join(root, 'package.json')).resolve(spec);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error(
      `Validator plugin "${spec}" isn't installed in the book (npm install ${spec}), ` +
        `or use a path like ./validators/${spec}.js`,
      { cause: error },
    );
  }
}

/**
 * Load the validators shipped by the presets the book extends: every *.js
 * file in <preset>/validators/, presets in merge order, files sorted.
 * @param {object} [cfg] - Resolved config (its non-enumerable `presets`)
 * @returns {Promise<Array<{validator: object, source: string}>>}
 */
async function loadPresetValidators(cfg = config) {
  const entries = [];
  for (const { name, dir } of cfg.presets ?? []) {
    const validatorsDir = path.join(dir, 'validators');
    if (!fs.existsSync(validatorsDir)) continue;
    for (const file of fs.readdirSync(validatorsDir).filter((f) => f.endsWith('.js')).sort()) {
      const validator = await importValidator(path.join(validatorsDir, file), `Validator ${file} in preset ${name}`);
      entries.push({ validator, source: `preset ${name}` });
    }
  }
  return entries;
}

/**
 * Load the book's own validators (validators.plugins).
 * @param {object} [cfg] - Resolved config
 * @returns {Promise<Array<{validator: object, source: string}>>}
 */
async function loadPlugins(cfg = config) {
  const entries = [];
  for (const spec of cfg.validators.plugins ?? []) {
    const validator = await importValidator(resolvePlugin(spec, cfg.root), `Validator plugin ${spec}`);
    entries.push({ validator, source: `plugin ${spec}` });
  }
  return entries;
}

/**
 * Every validator in run order: built-ins, preset validators, plugins.
 * @param {{plugins?: object[], cfg?: object}} [options] - Injected plugin
 *   objects replace validators.plugins (for tests)
 * @returns {Promise<Array<{validator: object, source: string}>>}
 */
async function allValidators({ plugins, cfg = config } = {}) {
  return [
    ...BUILTIN_VALIDATORS.map((validator) => ({ validator, source: 'kit' })),
    ...(await loadPresetValidators(cfg)),
    ...(plugins ? plugins.map((validator) => ({ validator, source: 'plugin' })) : await loadPlugins(cfg)),
  ];
}

/**
 * Run every validator and print the results.
 * @param {{plugins?: Array<{name: string, run: Function}>}} [options]
 * @returns {Promise<number>} Exit status: 1 if any errors, else 0
 */
async function runValidation({ plugins } = {}) {
  const chapters = getChapters();
  const indexFiles = getIndexFiles();
  const validators = await allValidators({ plugins });

  const allErrors = [];
  const allWarnings = [];
  const report = ({ errors, warnings }) => {
    for (const error of errors) {
      console.log(error);
      allErrors.push(error);
    }
    for (const warning of warnings) {
      console.log(`Warning: ${warning}`);
      allWarnings.push(warning);
    }
  };

  for (const { validator } of validators) {
    if (config.validators.severity?.[validator.name] === 'off') continue;
    const ctx = contextFor(validator, { config, indexFiles, chapters });
    report(applySeverity(validator.name, await validator.run(ctx)));
  }

  if (allErrors.length === 0) {
    console.log('✓ All chapters validated successfully');
  } else {
    console.log(`\n✗ Found ${allErrors.length} error(s)`);
  }

  if (allWarnings.length > 0) {
    console.log(`ℹ ${allWarnings.length} warning(s)`);
  }

  return allErrors.length > 0 ? 1 : 0;
}

/**
 * The `--list` output. Plain: one built-in name per line. Verbose: every
 * validator (presets' and plugins' too) in aligned columns of name,
 * effective severity (error, warn, off, or "default" for on or unset),
 * tags, and source (kit, preset <name>, or plugin <spec>).
 * @param {{verbose?: boolean, cfg?: object}} [options]
 * @returns {Promise<string>}
 */
async function listValidators({ verbose = false, cfg = config } = {}) {
  if (!verbose) return BUILTIN_VALIDATORS.map((validator) => validator.name).join('\n');
  const rows = (await allValidators({ cfg })).map(({ validator, source }) => {
    const severity = cfg.validators.severity?.[validator.name];
    return [
      validator.name,
      ['error', 'warn', 'off'].includes(severity) ? severity : 'default',
      (validator.tags ?? []).join(',') || '-',
      source,
    ];
  });
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => row.map((cell, i) => (i < 3 ? cell.padEnd(widths[i]) : cell)).join('  ')).join('\n');
}

// Built-in validator functions, re-exported for tests and older callers.
export { validateChapter } from '../validators/chapter.js';
export { validateSectionIntros } from '../validators/section-intros.js';
export { validateSectionIntroNoTldr } from '../validators/section-intro-no-tldr.js';
export { validateSectionIntroHasLead } from '../validators/section-intro-has-lead.js';
export { validateSectionIntroFinalLead } from '../validators/section-intro-final-lead.js';
export { validateNoTransitionTodos } from '../validators/no-transition-todos.js';
export { validateNoTodoMarkers } from '../validators/no-todo-markers.js';
export { validateMinOpenerLength } from '../validators/min-opener-length.js';
export { validateNoBareUrlLinkText } from '../validators/no-bare-url-link-text.js';
export { validateCrossReferences } from '../validators/cross-references.js';
export { validateIndexIntegrity } from '../validators/index-integrity.js';
export { validateSmallcaps } from '../validators/smallcaps.js';
export { validateEscapedSmallcaps } from '../validators/escaped-smallcaps.js';
export { validateCalloutBalance } from '../validators/callout-balance.js';
export { validateTldrLength } from '../validators/tldr-length.js';
export { validateDuplicateHeadings } from '../validators/duplicate-headings.js';
export { validateAcronymExpansion } from '../validators/acronym-expansion.js';
export { validateEmDashes } from '../validators/em-dashes.js';
export { validateNumberRangeDashes } from '../validators/number-range-dashes.js';
export { validateQuotePunctuation } from '../validators/quote-punctuation.js';
export { validateDoubledWords } from '../validators/doubled-words.js';
export { validateCalloutDivs } from '../validators/callout-divs.js';
export { validateRoleCalloutLabels } from '../validators/callout-labels.js';
export { validateFootnotes } from '../validators/footnotes.js';
export { validateHeadingHierarchy } from '../validators/heading-hierarchy.js';
export { validateSentenceStarters } from '../validators/sentence-starters.js';
export { validateListPunctuation } from '../validators/list-punctuation.js';
export { validateBoldKeywords } from '../validators/bold-keywords.js';
export { validateHypotheticalHooks } from '../validators/hypothetical-hooks.js';
export { validateParagraphLength } from '../validators/paragraph-length.js';
export {
  getChapters,
  getIndexFiles,
  getSectionIntros,
  isExcluded,
  headingToAnchor,
  collectAllAnchors,
  EXCLUDE_PATTERNS,
  KNOWN_ACRONYMS,
  UNIVERSALLY_KNOWN_ACRONYMS,
} from '../lib/validate.js';
export { BUILTIN_VALIDATORS };
export {
  runValidation,
  applySeverity,
  listValidators,
  loadPlugins,
  loadPresetValidators,
  resolvePlugin,
  VALIDATORS,
};

// Run if executed directly
if (isMain(import.meta.url)) {
  if (process.argv.includes('--list')) {
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    console.log(await listValidators({ verbose }));
    process.exit(0);
  }
  const exitCode = await runValidation();
  process.exit(exitCode);
}
