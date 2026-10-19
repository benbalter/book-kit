import fs from 'node:fs';
import { callouts } from '../lib/callouts.js';

/**
 * Validate that labeled callouts (.for-managers / .for-ics / .pro-tip) don't
 * start with a hardcoded label like "**For managers:**" or "**Pro tip:**". The
 * label is injected by CSS (`.for-managers::before` / `.for-ics::before` /
 * `.pro-tip::before` in src/style.css) for HTML/PDF and by add-div-titles.lua
 * for EPUB, so a hardcoded label inside the callout renders twice
 * ("💡 Pro-Tip: Pro tip: ...") in HTML and PDF.
 * Mirrors the label strings checked by add-div-titles.lua.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateRoleCalloutLabels(indexFiles) {
  const errors = [];

  // Label patterns that duplicate the CSS ::before / Lua filter labels.
  // Matches plain or bold ("**For managers:**", "**For managers**:") forms,
  // including the smallcaps IC variant ("For [IC]{.smallcaps}s:").
  const LABEL_PATTERNS = {
    'for-managers': /^\*{0,2}For managers\*{0,2}\s*:/i,
    'for-ics': /^\*{0,2}For (?:individual contributors|ICs|\[IC\]\{\.smallcaps\}s)\*{0,2}\s*:/i,
    'pro-tip': /^\*{0,2}Pro[ -]?tip\*{0,2}\s*:/i,
  };

  // Human-readable label per callout class, for the error message.
  const LABEL_NAMES = {
    'for-managers': 'For managers:',
    'for-ics': 'For individual contributors:',
    'pro-tip': 'Pro tip:',
  };

  // Other labelled callouts from the registry match their own label text.
  // (The TL;DR and common-objection labels are checked elsewhere or never
  // typed by writers, as in the original rule set.)
  const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const c of callouts) {
    if (!c.label || c.class in LABEL_PATTERNS || c.class === 'tldr' || c.class === 'common-objection') continue;
    const bare = c.label.replace(/:$/, '');
    LABEL_PATTERNS[c.class] = new RegExp(`^\\*{0,2}${escapeRe(bare)}\\*{0,2}\\s*:`, 'i');
    LABEL_NAMES[c.class] = c.label;
  }
  const checked = Object.keys(LABEL_PATTERNS).filter((cls) => callouts.some((c) => c.class === cls));
  if (checked.length === 0) return { errors, warnings: [] };
  const LABELLED_OPEN_RE = new RegExp(`^:::\\s*\\{[^}]*\\.(${checked.map(escapeRe).join('|')})\\b`);

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let pendingCallout = null; // { class, line } awaiting its first content line

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (/^```/.test(line)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const openMatch = line.match(LABELLED_OPEN_RE);
      if (openMatch) {
        pendingCallout = { class: openMatch[1], line: i + 1 };
        continue;
      }

      if (!pendingCallout) continue;

      // Skip blanks and comments between the opening fence and first content
      if (line === '' || /^<!--/.test(line)) continue;

      // Closing fence or another div before any content
      if (/^:::/.test(line)) {
        pendingCallout = null;
        continue;
      }

      // First content line of the callout
      if (LABEL_PATTERNS[pendingCallout.class].test(line)) {
        const label = LABEL_NAMES[pendingCallout.class];
        errors.push(
          `Callout .${pendingCallout.class} in ${file}:${i + 1} starts with a hardcoded "${label}" label. ` +
          `Remove it — the label is added automatically by CSS ::before (HTML/PDF) and ` +
          `add-div-titles.lua (EPUB), so hardcoding it renders the label twice.`
        );
      }
      pendingCallout = null;
    }
  }

  return { errors, warnings: [] };
}

export default {
  name: 'callout-labels',
  tags: ['structure'],
  defaults: {},
  run: (ctx) => validateRoleCalloutLabels(ctx.indexFiles),
};
