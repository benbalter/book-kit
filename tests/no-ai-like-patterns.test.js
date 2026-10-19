import { describe, it, expect } from 'vitest';

/**
 * Test suite for no-ai-like-patterns textlint rule
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadRule() {
  const rulePath = path.join(SCRIPT_DIR, '..', 'rules', 'no-ai-like-patterns.js');
  const mod = await import(`file://${rulePath}`);
  return mod.default;
}

/**
 * Create a mock textlint context for testing
 * @param {string} text - The text to lint
 * @returns {{context: Object, getErrors: () => Array}} Mock context and error collector
 */
function createMockContext(text) {
  const errors = [];

  const context = {
    Syntax: {
      Paragraph: 'Paragraph',
      Str: 'Str',
      Header: 'Header'
    },
    getSource: () => text,
    report: (_node, error) => {
      errors.push(error);
    },
    RuleError: class RuleError {
      constructor(message, opts = {}) {
        this.message = message;
        this.index = opts.index;
      }
    }
  };

  return { context, getErrors: () => errors };
}

/**
 * Run the linter rule on a paragraph of text
 * @param {Object} rule - The rule module
 * @param {string} text - Text to check
 * @param {Object} [options] - Rule options
 * @returns {Array} Errors found
 */
function lintParagraph(rule, text, options = {}) {
  const { context, getErrors } = createMockContext(text);
  const handler = rule.linter(context, options);
  const mockNode = { type: 'Paragraph', value: text };
  handler[context.Syntax.Paragraph](mockNode);
  return getErrors();
}

const rule = await loadRule();
describe('no-ai-like-patterns: hedging phrases', () => {

  it('detects "It\'s important to note that"', () => {
    const errors = lintParagraph(rule, "It's important to note that tomatoes need full sun.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('hedging')).toBeTruthy();
  });

  it('detects "It is worth noting that"', () => {
    const errors = lintParagraph(rule, 'It is worth noting that sourdough rises slowly.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('hedging')).toBeTruthy();
  });

  it('detects "It\'s worth mentioning that"', () => {
    const errors = lintParagraph(rule, "It's worth mentioning that this matters.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('hedging')).toBeTruthy();
  });

  it('detects "It should be noted that"', () => {
    const errors = lintParagraph(rule, 'It should be noted that this approach has benefits.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('passive hedging')).toBeTruthy();
  });

  it('does not flag normal sentences with "it is"', () => {
    const errors = lintParagraph(rule, 'It is a good practice to label seed packets.');
    expect(errors.length).toBe(0);
  });

  it('detects "As I recall"', () => {
    const errors = lintParagraph(rule, 'As I recall, the bread took an hour to proof.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('memory-hedging')).toBeTruthy();
  });

  it('detects "if I recall correctly"', () => {
    const errors = lintParagraph(rule, 'The repotting, if I recall correctly, took two weekends.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('memory-hedging')).toBeTruthy();
  });

  it('detects "if memory serves"', () => {
    const errors = lintParagraph(rule, 'If memory serves, we planted on a Friday.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('memory-hedging')).toBeTruthy();
  });

  it('does not flag the plain verb "recall"', () => {
    const errors = lintParagraph(rule, 'I recall the eclipse clearly and wrote it all down.');
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: formulaic transitions', () => {

  it('detects "Furthermore,"', () => {
    const errors = lintParagraph(rule, 'Furthermore, this approach has many benefits.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Furthermore')).toBeTruthy();
  });

  it('detects "Moreover,"', () => {
    const errors = lintParagraph(rule, 'Moreover, gardeners should consider raised beds.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Moreover')).toBeTruthy();
  });

  it('detects "Additionally,"', () => {
    const errors = lintParagraph(rule, 'Additionally, there are productivity gains.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Additionally')).toBeTruthy();
  });

  it('detects "In addition,"', () => {
    const errors = lintParagraph(rule, 'In addition, there are cost savings.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('In addition')).toBeTruthy();
  });

  it('detects "That being said,"', () => {
    const errors = lintParagraph(rule, 'That being said, there are some caveats.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('That being said')).toBeTruthy();
  });

  it('does not flag "furthermore" mid-sentence', () => {
    const errors = lintParagraph(rule, 'The baker wanted to go furthermore into details.');
    expect(errors.length).toBe(0);
  });

  it('does not flag "that being said" mid-sentence', () => {
    const errors = lintParagraph(rule, 'I recall that being said at the workshop.');
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: meta-commentary', () => {

  it('detects "Let\'s explore"', () => {
    const errors = lintParagraph(rule, "Let's explore how this works in practice.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('meta-commentary')).toBeTruthy();
  });

  it('detects "Let\'s dive into"', () => {
    const errors = lintParagraph(rule, "Let's dive into the details.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('meta-commentary')).toBeTruthy();
  });

  it('detects "Let us examine"', () => {
    const errors = lintParagraph(rule, 'Let us examine the evidence more closely.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('meta-commentary')).toBeTruthy();
  });

  it('detects "Let\'s break down"', () => {
    const errors = lintParagraph(rule, "Let's break down what each one means.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('meta-commentary')).toBeTruthy();
  });

  it('does not flag "let\'s discuss" (not in pattern list)', () => {
    const errors = lintParagraph(rule, "let's discuss this openly.");
    expect(errors.length).toBe(0);
  });

  it('does not flag "let\'s" in quoted context mid-sentence', () => {
    const errors = lintParagraph(rule, 'She said "let\'s explore later" during the workshop.');
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: hollow summarization', () => {

  it('detects "In conclusion,"', () => {
    const errors = lintParagraph(rule, 'In conclusion, mulch is better.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('In conclusion')).toBeTruthy();
  });

  it('detects "To summarize,"', () => {
    const errors = lintParagraph(rule, 'To summarize, composting is effective.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('To summarize')).toBeTruthy();
  });

  it('detects "In summary,"', () => {
    const errors = lintParagraph(rule, 'In summary, soil health matters.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('In summary')).toBeTruthy();
  });

  it('detects "Overall,"', () => {
    const errors = lintParagraph(rule, 'Overall, the approach works well for small gardens.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Overall')).toBeTruthy();
  });

  it('does not flag "overall" mid-sentence', () => {
    const errors = lintParagraph(rule, 'The overall impact was positive for the harvest.');
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: setup phrases', () => {

  it('detects sentence-initial "When it comes to"', () => {
    const errors = lintParagraph(rule, 'When it comes to pruning, timing is key.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('When it comes to')).toBeTruthy();
  });

  it('does not flag mid-sentence "when it comes to"', () => {
    const errors = lintParagraph(rule, 'Bakers have unique concerns when it comes to oven temperature.');
    expect(errors.length).toBe(0);
  });

  it('detects "In terms of"', () => {
    const errors = lintParagraph(rule, 'In terms of yield, heirloom varieties vary.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('In terms of')).toBeTruthy();
  });

  it('detects "In the context of"', () => {
    const errors = lintParagraph(rule, 'In the context of stargazing, light pollution matters.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('In the context of')).toBeTruthy();
  });
});

describe('no-ai-like-patterns: performative enthusiasm', () => {

  it('detects "Great question!"', () => {
    const errors = lintParagraph(rule, 'Great question! The answer lies in the soil.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('performative enthusiasm')).toBeTruthy();
  });

  it('detects "Excellent point."', () => {
    const errors = lintParagraph(rule, 'Excellent point. Bakers should weigh their flour.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('performative enthusiasm')).toBeTruthy();
  });

  it('detects "Fantastic approach"', () => {
    const errors = lintParagraph(rule, 'Fantastic approach to solving the problem.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('performative enthusiasm')).toBeTruthy();
  });

  it('detects sentence-initial "Amazing insight"', () => {
    const errors = lintParagraph(rule, 'First sentence. Amazing insight from the guild.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('performative enthusiasm')).toBeTruthy();
  });

  it('does not flag "great" in normal context', () => {
    const errors = lintParagraph(rule, 'This is a great way to handle leftover dough.');
    expect(errors.length).toBe(0);
  });

  it('does not flag "excellent" as adjective in normal prose', () => {
    const errors = lintParagraph(rule, 'She has an excellent track record of growing roses.');
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: AI-characteristic vocabulary', () => {

  it('detects "delve"', () => {
    const errors = lintParagraph(rule, 'We need to delve deeper into this topic.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Delve')).toBeTruthy();
  });

  it('detects "delves"', () => {
    const errors = lintParagraph(rule, 'This chapter delves into seed saving.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Delve')).toBeTruthy();
  });

  it('detects "delved"', () => {
    const errors = lintParagraph(rule, 'The binder delved into the root cause.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Delve')).toBeTruthy();
  });

  it('detects "Delve" at start of sentence', () => {
    const errors = lintParagraph(rule, 'Delve into this more carefully before deciding.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Delve')).toBeTruthy();
  });
});

describe('no-ai-like-patterns: rhetorical questions', () => {

  it('detects "What does this mean?"', () => {
    const errors = lintParagraph(rule, 'What does this mean? It means the beds need more compost.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('rhetorical')).toBeTruthy();
  });

  it('detects "So what does this mean?"', () => {
    const errors = lintParagraph(rule, 'So what does this mean? Simply put, less overhead.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('rhetorical')).toBeTruthy();
  });

  it('detects "What does this look like?"', () => {
    const errors = lintParagraph(rule, 'What does this look like? Picture a garden across three terraces.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('rhetorical')).toBeTruthy();
  });

  it('detects "Why does this matter?"', () => {
    const errors = lintParagraph(rule, 'Why does this matter? Because frost comes early.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('rhetorical')).toBeTruthy();
  });

  it('detects rhetorical question after a sentence', () => {
    const errors = lintParagraph(rule, 'Hillside gardens face unique challenges. Why does this matter? Because drainage is everything.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('rhetorical')).toBeTruthy();
  });

  it('does not flag "what does this" without question mark', () => {
    const errors = lintParagraph(rule, 'Consider what does this approach offer in practice.');
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: clean prose passes', () => {

  it('normal prose has no errors', () => {
    const errors = lintParagraph(rule, 'Bread dough needs patient handling. Bakers who measure carefully tend to get better loaves across batches.');
    expect(errors.length).toBe(0);
  });

  it('conversational tone passes', () => {
    const errors = lintParagraph(rule, "Here's an uncomfortable truth about pruning: the best advice you get this year might come from the newest person at the allotment.");
    expect(errors.length).toBe(0);
  });

  it('opinionated prose passes', () => {
    const errors = lintParagraph(rule, "Seed catalogs are often where good intentions go to die—padded with filler, buried in glossy photos, and skimmed by nobody who needed them.");
    expect(errors.length).toBe(0);
  });

  it('"That said" (without "being") does not trigger "That being said" rule', () => {
    const errors = lintParagraph(rule, "That said, don't overthink it.");
    expect(errors.length).toBe(0);
  });

  it('technical metaphor passes', () => {
    const errors = lintParagraph(rule, "A sharp knife is like a good recipe—it catches mistakes at 'prep time' rather than 'dinner time.'");
    expect(errors.length).toBe(0);
  });

  it('a scenario opener passes (hook openers are the hypothetical-hooks validator\'s job, not this rule\'s)', () => {
    const errors = lintParagraph(rule, "Picture this: you're six months into a quilt when you discover a neighbor finished the exact same pattern three months ago.");
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: allow option', () => {

  it('skips patterns matching allow list', () => {
    const errors = lintParagraph(rule, 'Furthermore, this approach has many benefits.', {
      allow: ['Furthermore']
    });
    expect(errors.length).toBe(0);
  });

  it('still catches non-allowed patterns', () => {
    const errors = lintParagraph(rule, 'Moreover, gardeners should consider raised beds.', {
      allow: ['Furthermore']
    });
    expect(errors.length).toBe(1);
  });

  it('allow list works for new pattern categories', () => {
    const errors = lintParagraph(rule, 'We need to delve deeper into this topic.', {
      allow: ['Delve']
    });
    expect(errors.length).toBe(0);
  });
});

describe('no-ai-like-patterns: multiple patterns in one paragraph', () => {

  it('detects first matching pattern in a paragraph', () => {
    const errors = lintParagraph(rule, "It's important to note that this matters. Furthermore, there are benefits.");
    expect(errors.length >= 1).toBeTruthy();
  });

  it('detects hedging plus AI vocabulary', () => {
    const errors = lintParagraph(rule, "It's worth noting that we should delve deeper.");
    expect(errors.length >= 1).toBeTruthy();
  });
});

describe('no-ai-like-patterns: error index accuracy', () => {

  it('reports correct index for pattern at start of text', () => {
    const errors = lintParagraph(rule, 'Furthermore, this works well.');
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe(0);
  });

  it('reports correct index for "delve" mid-sentence', () => {
    const errors = lintParagraph(rule, 'We need to delve deeper.');
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe('We need to '.length);
  });

  it('reports correct index for hedging phrase', () => {
    const errors = lintParagraph(rule, "It's important to note that drainage matters.");
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe(0);
  });
});

describe('no-ai-like-patterns: case sensitivity', () => {

  it('hedging is case-insensitive', () => {
    const errors = lintParagraph(rule, "IT IS IMPORTANT TO NOTE THAT seedlings need water.");
    expect(errors.length).toBe(1);
  });

  it('formulaic transitions are case-sensitive (start of line)', () => {
    const errors = lintParagraph(rule, 'furthermore, this works.');
    expect(errors.length).toBe(0);
  });

  it('"delve" is case-insensitive', () => {
    const errors = lintParagraph(rule, 'We DELVE into the details.');
    expect(errors.length).toBe(1);
  });

  it('hollow summarization is case-insensitive', () => {
    const errors = lintParagraph(rule, 'IN CONCLUSION, this approach works.');
    expect(errors.length).toBe(1);
  });
});

describe('no-ai-like-patterns: conversational tics and filler openers', () => {

  it('detects "let that sink in"', () => {
    const errors = lintParagraph(rule, 'They never replied. Let that sink in.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('let that sink in');
  });

  it('detects "buckle up"', () => {
    const errors = lintParagraph(rule, 'Buckle up, this gets complicated.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('buckle up');
  });

  it('detects "spoiler alert"', () => {
    const errors = lintParagraph(rule, 'Spoiler alert: nobody read the recipe.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('spoiler alert');
  });

  it('detects "here\'s the kicker"', () => {
    const errors = lintParagraph(rule, "Here's the kicker: it scaled anyway.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('kicker');
  });

  it('detects "let\'s face it"', () => {
    const errors = lintParagraph(rule, "Let's face it, weeds rarely help.");
    expect(errors.length).toBe(1);
  });

  it('detects "you might be wondering"', () => {
    const errors = lintParagraph(rule, 'You might be wondering why this matters.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('you might be wondering');
  });

  it('detects "and that\'s okay" reassurance', () => {
    const errors = lintParagraph(rule, "You won't get it perfect, and that's okay.");
    expect(errors.length).toBe(1);
  });

  it('detects "In today\'s" opener', () => {
    const errors = lintParagraph(rule, "In today's kitchen, cast iron wins.");
    expect(errors.length).toBe(1);
  });

  it('detects "At its core" framing', () => {
    const errors = lintParagraph(rule, 'At its core, the practice is about patience.');
    expect(errors.length).toBe(1);
  });

  it('detects "In essence" framing', () => {
    const errors = lintParagraph(rule, 'In essence, you water the roots.');
    expect(errors.length).toBe(1);
  });

  it('does not flag the antithesis construction', () => {
    const errors = lintParagraph(rule, "That's not a weed—it's a wildflower.");
    expect(errors.length).toBe(0);
  });
});
