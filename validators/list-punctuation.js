import fs from 'node:fs';

/**
 * Validate that bullet list items have consistent terminal punctuation.
 * Within a single list, items should either all end with periods or all
 * lack them — mixing looks unprofessional in print.
 * @param {string[]} indexFiles - Files listed in index.yml
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateListPunctuation(indexFiles) {
  const warnings = [];

  for (const file of indexFiles) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    let inCodeBlock = false;
    let currentList = [];      // [{line, endsPeriod}]
    let listStartLine = 0;
    let inListContinuation = false;
    let lastItemText;

    const checkList = () => {
      if (currentList.length < 2) {
        currentList = [];
        return;
      }

      const withPeriod = currentList.filter(item => item.endsPeriod).length;
      const withoutPeriod = currentList.length - withPeriod;

      // Only warn if there's a genuine mix (not all same)
      // Exclude single-sentence continuation lists: where only the LAST item
      // has a period (grammatically, these are one sentence broken across bullets)
      if (withPeriod > 0 && withoutPeriod > 0) {
        const lastHasPeriod = currentList[currentList.length - 1].endsPeriod;
        const onlyLastHasPeriod = lastHasPeriod && withPeriod === 1;
        if (!onlyLastHasPeriod) {
          warnings.push(
            `Inconsistent list punctuation in ${file}:${listStartLine} ` +
            `(${withPeriod} items end with period, ${withoutPeriod} don't)`
          );
        }
      }
      currentList = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        checkList();
        inListContinuation = false;
        continue;
      }
      if (inCodeBlock) continue;

      // Detect bullet list items (- or * or + followed by space)
      const bulletMatch = line.match(/^(\s*[-*+])\s+(.*)/);
      if (bulletMatch) {
        // If this is a new list (previous line wasn't a list item or continuation)
        if (currentList.length === 0) {
          listStartLine = i + 1;
        }

        lastItemText = bulletMatch[2].trim();
        inListContinuation = true;

        // Don't evaluate yet — item might continue on next line
        currentList.push({ line: i + 1, endsPeriod: false, text: lastItemText });
        continue;
      }

      // Continuation of a list item (indented text after a bullet)
      if (inListContinuation && /^\s{2,}\S/.test(line)) {
        lastItemText = line.trim();
        // Update the last item's text
        if (currentList.length > 0) {
          currentList[currentList.length - 1].text = lastItemText;
        }
        continue;
      }

      // End of list (blank line or non-indented non-list text)
      if (inListContinuation) {
        // Finalize punctuation detection for all items
        for (const item of currentList) {
          const text = item.text;
          // Check if text ends with sentence-ending punctuation (period, !, ?)
          // Strip trailing markdown formatting (**, `, etc.) and quotes first
          const cleaned = text.replace(/[*_`\]}\s"'"')\]]+$/, '');
          item.endsPeriod = /[.!?]$/.test(cleaned);
        }
        checkList();
        inListContinuation = false;
      }

      // Non-list content: reset
      if (line.trim() === '' && !inListContinuation) {
        continue;
      }
    }

    // Finalize any remaining list
    if (inListContinuation && currentList.length > 0) {
      for (const item of currentList) {
        const cleaned = item.text.replace(/[*_`\]}\s"'"')\]]+$/, '');
        item.endsPeriod = /[.!?]$/.test(cleaned);
      }
      checkList();
    }
  }

  return { errors: [], warnings };
}

export default {
  name: 'list-punctuation',
  tags: ['style'],
  defaults: {},
  run: (ctx) => validateListPunctuation(ctx.indexFiles),
};
