/**
 * textlint rule: no-vague-intensifiers
 *
 * Detects vague intensifiers and superlative stacking, which plain-language
 * style guides recommend replacing with specific, concrete language.
 *
 * Catches:
 *   - Superlative stacking ("very unique", "highly effective", "extremely important")
 *   - Vague intensifiers before adjectives ("very important", "really critical")
 *   - "This ensures/allows/enables" constructions
 */

const PATTERNS = [
  // === Superlative stacking ===
  {
    pattern: /\bvery unique\b/i,
    message: '"Very unique" is redundant — "unique" already means one of a kind. Drop "very" or use a more specific word.'
  },
  {
    pattern: /\bhighly effective\b/i,
    message: '"Highly effective" is vague — provide evidence, metrics, or describe the specific effect.'
  },
  {
    pattern: /\bextremely important\b/i,
    message: '"Extremely important" is vague — explain why it matters instead.'
  },
  {
    pattern: /\bincredibly (?:important|valuable|powerful|useful)\b/i,
    message: '"Incredibly [adjective]" is vague — be specific about what makes it so.'
  },
  {
    pattern: /\bvery (?:important|critical|crucial|essential|significant|powerful|valuable)\b/i,
    message: '"Very [adjective]" is a vague intensifier — explain why it matters or provide specifics.'
  },
  {
    pattern: /\breally (?:important|critical|crucial|essential|significant|powerful|valuable|effective)\b/i,
    message: '"Really [adjective]" is a vague intensifier — explain why it matters or provide specifics.'
  },
  {
    pattern: /\btruly (?:important|critical|crucial|essential|significant|powerful|valuable|effective|unique|remarkable|transformative)\b/i,
    message: '"Truly [adjective]" is a vague intensifier — explain why it matters or provide specifics.'
  },
  {
    pattern: /\bsignificantly improved\b/i,
    message: '"Significantly improved" is vague — quantify the improvement or describe the specific change.'
  },
  {
    pattern: /\bmajor impact\b/i,
    message: '"Major impact" is vague — describe the actual effects or provide evidence.'
  },

  // === "This ensures/allows/enables" constructions ===
  {
    pattern: /(?:^|(?<=\. ))This (?:ensures|allows|enables|guarantees|makes sure) /m,
    message: '"This ensures/allows/enables…" is a formulaic construction — name the subject and use a more direct verb.'
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

        // Reset regex state for global/multiline patterns
        pattern.lastIndex = 0;
        const match = pattern.exec(text);

        if (match) {
          const index = match.index;
          report(node, new RuleError(message, { index }));
        }
      }
    }
  };
}

const rule = {
  linter: reporter
};

export default rule;
