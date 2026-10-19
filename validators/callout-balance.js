import fs from 'node:fs';
import { callouts } from '../lib/callouts.js';
import { TAKEAWAYS_SUFFIX, allowFor, optionsFor } from '../lib/validate.js';

const defaults = {
  // The name a warning uses for each callout class. A class not listed here
  // uses its registry label without the trailing colon, or `.class` if it has
  // no label.
  names: {},
};

/**
 * The callout pairs to check, from the registry's `pair_with` fields, in
 * registry order: [[class, partner], ...]. A symmetric pair lists both
 * entries, so each direction is checked.
 * @param {Array<{class: string, pair_with?: string}>} [registry]
 * @returns {Array<[string, string]>}
 */
export function calloutPairs(registry = callouts) {
  return registry.filter((c) => c.pair_with).map((c) => [c.class, c.pair_with]);
}

/**
 * Validate that chapters using a paired callout include its partner. Pairs
 * come from `pair_with` in the callout registry; the business-nonfiction
 * preset pairs .for-managers and .for-ics both ways, so a chapter with one
 * should also have the other.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @param {{names?: Object<string, string>}} [options]
 * @param {Set<string>} [allowed] - Files exempt from the check (validators.allow)
 * @param {Array<{class: string, label?: string, pair_with?: string}>} [registry]
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateCalloutBalance(
  indexFiles,
  options = optionsFor('callout-balance', defaults),
  allowed = allowFor('callout-balance'),
  registry = callouts,
) {
  const warnings = [];
  const pairs = calloutPairs(registry);
  if (pairs.length === 0) return { errors: [], warnings };

  const nameOf = (cls) =>
    options.names?.[cls] ?? registry.find((c) => c.class === cls)?.label?.replace(/:$/, '') ?? `.${cls}`;

  // Files that legitimately use only one side of a pair (validators.allow),
  // e.g. a chapter that introduces each callout in its own section
  const EXEMPT_FILES = [...allowed];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    if (EXEMPT_FILES.includes(file)) continue;
    if (file.includes(TAKEAWAYS_SUFFIX)) continue;

    const content = fs.readFileSync(file, 'utf8');
    for (const [cls, partner] of pairs) {
      if (content.includes(`.${cls}`) && !content.includes(`.${partner}`)) {
        warnings.push(
          `${file} has "${nameOf(cls)}" callout but no "${nameOf(partner)}" callout`
        );
      }
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'callout-balance',
  tags: ['style'],
  defaults,
  run: (ctx) => validateCalloutBalance(ctx.indexFiles, ctx.options, ctx.allow, ctx.config.callouts),
};
