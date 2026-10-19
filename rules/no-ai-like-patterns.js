/**
 * textlint rule: no-ai-like-patterns
 *
 * Detects formulaic writing patterns commonly associated with AI-generated text.
 * Plain-language style guides favor specific, human-written prose over these.
 *
 * Catches:
 *   - Excessive hedging phrases ("It's important to note that...")
 *   - Formulaic transitions ("Furthermore", "Moreover", "Additionally", "That said")
 *   - Meta-commentary ("Let's explore...", "Let's dive into...")
 *   - Hollow summarization ("In conclusion", "To summarize", "Overall")
 *   - Setup phrases ("When it comes to...", "In terms of...")
 *   - Performative enthusiasm ("Great question!", "Excellent point!")
 *   - AI-characteristic vocabulary ("delve")
 *   - Formulaic rhetorical questions ("What does this mean?", "Why does this matter?")
 */

const PATTERNS = [
  // === Hedging and qualifier phrases ===
  {
    pattern: /\bIt(?:'s| is) (?:important|critical|crucial|essential|notable|noteworthy) to (?:note|mention|remember|consider|point out|highlight|emphasize|stress|acknowledge|recognize|understand|realize|keep in mind) that\b/i,
    message: 'Avoid hedging phrases like "It\'s important to note that…" — state your point directly.'
  },
  {
    pattern: /\bIt(?:'s| is) worth (?:noting|mentioning|remembering|considering|pointing out|highlighting|emphasizing|stressing) that\b/i,
    message: 'Avoid hedging phrases like "It\'s worth noting that…" — state your point directly.'
  },
  {
    pattern: /\bIt should be (?:noted|mentioned|emphasized|stressed|pointed out|highlighted|acknowledged|recognized|understood) that\b/i,
    message: 'Avoid passive hedging like "It should be noted that…" — state your point directly.'
  },
  {
    pattern: /\b(?:as I recall|if I recall(?: correctly)?|as I remember it|if memory serves)\b/i,
    message: 'Avoid memory-hedging like "as I recall" — state the recollection directly or cut it.'
  },

  // === Formulaic transitions ===
  {
    pattern: /^Furthermore(?:,|\b)/m,
    message: '"Furthermore" is a formulaic transition. Use natural transitions or restructure the sentence.'
  },
  {
    pattern: /^Moreover(?:,|\b)/m,
    message: '"Moreover" is a formulaic transition. Use natural transitions or restructure the sentence.'
  },
  {
    pattern: /^Additionally(?:,|\b)/m,
    message: '"Additionally" is a formulaic transition. Use natural transitions or restructure the sentence.'
  },
  {
    pattern: /^In addition(?:,|\b)/m,
    message: '"In addition" is a formulaic transition. Use natural transitions or restructure the sentence.'
  },
  {
    pattern: /^That being said(?:,|\b)/m,
    message: '"That being said" is a formulaic transition. Use natural transitions or restructure the sentence.'
  },

  // === Meta-commentary (sentence-initial only) ===
  {
    pattern: /(?:^|(?<=\. ))Let(?:'s| us) (?:explore|dive into|take a (?:look|closer look|deep dive|deeper look) at|examine|consider|unpack|break down|delve into)\b/m,
    message: 'Avoid meta-commentary like "Let\'s explore…" — just explore, dive in, or examine directly.'
  },

  // === Hollow summarization ===
  {
    pattern: /^In conclusion(?:,|\b)/im,
    message: '"In conclusion" is a hollow summarization phrase — the content should speak for itself.'
  },
  {
    pattern: /^To summarize(?:,|\b)/im,
    message: '"To summarize" is a hollow summarization phrase — the content should speak for itself.'
  },
  {
    pattern: /^In summary(?:,|\b)/im,
    message: '"In summary" is a hollow summarization phrase — the content should speak for itself.'
  },
  {
    pattern: /^Overall(?:,|\b)/im,
    message: '"Overall" is a hollow summarization phrase — the content should speak for itself.'
  },

  // === Setup phrases (sentence-initial only) ===
  {
    pattern: /(?:^|(?<=\. ))When it comes to\b/m,
    message: '"When it comes to…" is a filler setup phrase — get to the point.'
  },
  {
    pattern: /^In terms of\b/im,
    message: '"In terms of…" is a filler setup phrase — get to the point.'
  },
  {
    pattern: /^In the context of\b/im,
    message: '"In the context of…" is a filler setup phrase — get to the point.'
  },

  // === Performative enthusiasm ===
  {
    pattern: /(?:^|(?<=\. ))(?:Great|Excellent|Fantastic|Wonderful|Amazing|Brilliant) (?:question|point|observation|insight|idea|suggestion|example|approach)(?:[.!]|\b)/m,
    message: 'Avoid performative enthusiasm like "Great question!" — maintain a measured, authentic tone.'
  },

  // === AI-characteristic vocabulary ===
  {
    pattern: /\bdelve(?:s|d)?\b/i,
    message: '"Delve" is an AI-characteristic word — use "examine", "explore", "look at", or "dig into" instead.'
  },
  {
    pattern: /(?:^|(?<=\. ))(?:So )?[Ww]hat does this (?:mean|look like)\?/m,
    message: 'Avoid rhetorical questions like "What does this mean?" — state the point directly.'
  },
  {
    pattern: /(?:^|(?<=\. ))Why does this matter\?/m,
    message: 'Avoid rhetorical questions like "Why does this matter?" — state the point directly.'
  },
  // === Conversational-AI tics and reassurance ===
  {
    pattern: /\blet that sink in\b/i,
    message: 'Avoid the conversational-AI tic "let that sink in" — trust the reader to absorb the point.'
  },
  {
    pattern: /\bbuckle up\b/i,
    message: 'Avoid the conversational-AI tic "buckle up" — get to the substance.'
  },
  {
    pattern: /\bspoiler alert\b/i,
    message: 'Avoid the conversational-AI tic "spoiler alert" — just state the point.'
  },
  {
    pattern: /\bplot twist\b/i,
    message: 'Avoid the conversational-AI tic "plot twist" — just state what happened.'
  },
  {
    pattern: /\bhere'?s the (?:kicker|catch)\b/i,
    message: 'Avoid the conversational-AI tic "here\'s the kicker/catch" — state the consequence directly.'
  },
  {
    pattern: /\blet'?s (?:face it|be honest)\b/i,
    message: 'Avoid the conversational-AI tic "let\'s face it / let\'s be honest" — just make the claim.'
  },
  {
    pattern: /\byou (?:might|may) be (?:wondering|asking yourself)\b/i,
    message: 'Avoid "you might be wondering" — pose the question directly or cut the setup.'
  },
  {
    pattern: /(?:—|–|, )and that'?s (?:okay|perfectly fine)\b/i,
    message: 'Avoid the formulaic reassurance "and that\'s okay" — it reads as AI-generated padding.'
  },
  // === Filler openers ===
  {
    pattern: /(?:^|(?<=\. ))In today'?s\b/m,
    message: '"In today\'s…" is a filler opener — get to the point.'
  },
  {
    pattern: /(?:^|(?<=\. ))(?:In an era|In the (?:world|realm) of|Gone are the days)\b/m,
    message: 'This is a filler opener — start with the substance.'
  },
  {
    pattern: /(?:^|(?<=\. ))At its (?:core|heart)\b/m,
    message: '"At its core/heart…" is an AI-characteristic essence framing — state the point directly.'
  },
  {
    pattern: /(?:^|(?<=\. ))In essence\b/m,
    message: '"In essence" is hollow framing — just state the essence.'
  }
  // NOTE: The negation-antithesis construction ("it's not X—it's Y"), "not only
  // X but also Y", and the "that's where X comes in" bridge are deliberately NOT
  // enforced here. Writers often use the device intentionally and well, and
  // textlint has no suggestion tier — every match would fail `just prose`.
  // Leave them to human review (or a suggestion-level Vale rule) instead.
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
      // Strip inline code spans so quoted examples don't trigger rules
      const text = getSource(node).replace(/`[^`]+`/g, match => ' '.repeat(match.length));

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
