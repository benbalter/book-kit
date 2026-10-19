/**
 * textlint rule: no-assumptive
 *
 * Detects assumptive language that presupposes the reader already understands
 * something, which condescends to readers who are less familiar with the topic.
 * For a global, neurodiverse audience, clarity beats implied familiarity.
 *
 * Catches phrases like "simply", "of course", "as you know", "it's obvious that".
 * Note: "needless to say" and "goes without saying" are caught by no-cliches.js.
 */

const PATTERNS = [
  {
    pattern: /\bsimply\b/i,
    message: '"Simply" assumes the reader finds this easy. If it\'s worth explaining, explain it without the qualifier.'
  },
  {
    pattern: /\bof course\b/i,
    message: '"Of course" presupposes the reader already knows this. State it plainly or cut the phrase.'
  },
  {
    pattern: /\bas you(?:'re| are)? (?:probably |likely )?(?:already )?(?:aware|know|know,)\b/i,
    message: '"As you know" assumes shared knowledge. State the point directly.'
  },
  {
    pattern: /\bas (?:we all|everyone) know(?:s)?\b/i,
    message: '"As everyone knows" assumes universal knowledge. Not everyone does — state it plainly.'
  },
  {
    pattern: /\bit(?:'s| is) obvious(?: that)?\b/i,
    message: '"It\'s obvious that" — if it were obvious, you wouldn\'t need to say it. Just say it.'
  },
  {
    pattern: /\bit(?:'s| is) clear(?: that)?\b/i,
    message: '"It\'s clear that" implies the reader should already understand. State the point directly.'
  },
  {
    pattern: /\bas is (?:well |widely )?known\b/i,
    message: '"As is well known" assumes shared awareness. State the point instead.'
  }
];

/**
 * @param {import("@textlint/types").TextlintRuleContext} context
 * @param {Object} options
 * @param {string[]} [options.allow] - Patterns to skip (by message substring)
 */
function reporter(context, options = {}) {
  const { Syntax, getSource, report, RuleError } = context;
  const allow = options.allow || [];

  return {
    [Syntax.Paragraph](node) {
      const text = getSource(node);

      for (const { pattern, message } of PATTERNS) {
        if (allow.some(a => message.includes(a))) {
          continue;
        }

        pattern.lastIndex = 0;
        const match = pattern.exec(text);

        if (match) {
          report(node, new RuleError(message, { index: match.index }));
        }
      }
    }
  };
}

const rule = {
  linter: reporter
};

export default rule;
