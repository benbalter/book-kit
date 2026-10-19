import { describe, it, expect } from 'vitest';

/**
 * Test suite for no-vague-intensifiers textlint rule
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadRule() {
  const rulePath = path.join(SCRIPT_DIR, '..', 'rules', 'no-vague-intensifiers.js');
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
describe('no-vague-intensifiers: superlative stacking', () => {

  it('detects "very unique"', () => {
    const errors = lintParagraph(rule, 'This is a very unique approach to composting.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Very unique')).toBeTruthy();
  });

  it('detects "highly effective"', () => {
    const errors = lintParagraph(rule, 'Companion planting is highly effective for small gardens.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Highly effective')).toBeTruthy();
  });

  it('detects "extremely important"', () => {
    const errors = lintParagraph(rule, 'Drainage is extremely important for potted herbs.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Extremely important')).toBeTruthy();
  });

  it('detects "incredibly valuable"', () => {
    const errors = lintParagraph(rule, 'A kitchen scale is incredibly valuable in a home bakery.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Incredibly')).toBeTruthy();
  });

  it('detects "significantly improved"', () => {
    const errors = lintParagraph(rule, 'Tomato yield significantly improved after adding compost.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Significantly improved')).toBeTruthy();
  });

  it('detects "major impact"', () => {
    const errors = lintParagraph(rule, 'This change had a major impact on how the garden grows.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Major impact')).toBeTruthy();
  });
});

describe('no-vague-intensifiers: vague intensifiers before adjectives', () => {

  it('detects "very important"', () => {
    const errors = lintParagraph(rule, 'Steady watering is very important for seedlings.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Very')).toBeTruthy();
  });

  it('detects "very critical"', () => {
    const errors = lintParagraph(rule, 'This step is very critical to success.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Very')).toBeTruthy();
  });

  it('detects "really important"', () => {
    const errors = lintParagraph(rule, 'Sunlight is really important in vegetable beds.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Really')).toBeTruthy();
  });

  it('detects "really effective"', () => {
    const errors = lintParagraph(rule, 'Row covers are really effective for frost protection.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Really')).toBeTruthy();
  });

  it('detects "truly transformative"', () => {
    const errors = lintParagraph(rule, 'The switch to a wood-fired oven was truly transformative.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Truly')).toBeTruthy();
  });

  it('detects "truly unique"', () => {
    const errors = lintParagraph(rule, 'Each sourdough starter has a truly unique flavor.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Truly')).toBeTruthy();
  });
});

describe('no-vague-intensifiers: "This ensures/allows/enables" constructions', () => {

  it('detects "This ensures" at sentence start', () => {
    const errors = lintParagraph(rule, 'This ensures that every plant gets water.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('ensures')).toBeTruthy();
  });

  it('detects "This allows" at sentence start', () => {
    const errors = lintParagraph(rule, 'This allows roots to spread freely.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('ensures')).toBeTruthy();
  });

  it('detects "This enables" at sentence start', () => {
    const errors = lintParagraph(rule, 'This enables bees to pollinate the orchard.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('ensures')).toBeTruthy();
  });

  it('detects "This ensures" after a period', () => {
    const errors = lintParagraph(rule, 'Label every row. This ensures clarity across the garden.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('ensures')).toBeTruthy();
  });

  it('does not flag "this" mid-sentence', () => {
    const errors = lintParagraph(rule, 'The fact that this ensures consistency is a bonus.');
    expect(errors.length).toBe(0);
  });

  it('does not flag "ensures" without "this" subject', () => {
    const errors = lintParagraph(rule, 'Mulch ensures that moisture is preserved.');
    expect(errors.length).toBe(0);
  });
});

describe('no-vague-intensifiers: clean prose passes', () => {

  it('does not flag normal prose', () => {
    const errors = lintParagraph(rule, 'Bread dough needs patient handling. Bakers who measure carefully tend to get better loaves across batches.');
    expect(errors.length).toBe(0);
  });

  it('does not flag specific language', () => {
    const errors = lintParagraph(rule, 'Drip irrigation reduces water use by 40% compared to overhead sprinklers.');
    expect(errors.length).toBe(0);
  });

  it('does not flag normal adjectives without intensifiers', () => {
    const errors = lintParagraph(rule, 'Good drainage is critical for potted herbs growing on sunny balconies.');
    expect(errors.length).toBe(0);
  });

  it('does not flag "effective" without intensifier', () => {
    const errors = lintParagraph(rule, 'Companion planting is an effective pattern for small gardens.');
    expect(errors.length).toBe(0);
  });

  it('does not flag "unique" without intensifier', () => {
    const errors = lintParagraph(rule, 'Each starter has a unique flavor shaped by its feeding schedule.');
    expect(errors.length).toBe(0);
  });

  it('does not flag named subjects with ensures', () => {
    const errors = lintParagraph(rule, 'Mulch ensures that moisture is preserved through the summer.');
    expect(errors.length).toBe(0);
  });
});

describe('no-vague-intensifiers: allow option', () => {

  it('skips patterns matching allow list', () => {
    const errors = lintParagraph(rule, 'This is very important for the garden.', {
      allow: ['Very']
    });
    expect(errors.length).toBe(0);
  });

  it('still catches non-allowed patterns', () => {
    const errors = lintParagraph(rule, 'This is very important and highly effective.', {
      allow: ['Very']
    });
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Highly effective')).toBeTruthy();
  });
});

describe('no-vague-intensifiers: error index accuracy', () => {

  it('reports correct index for pattern at start of text', () => {
    const errors = lintParagraph(rule, 'This ensures everyone is on board.');
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe(0);
  });

  it('reports correct index for intensifier mid-sentence', () => {
    const errors = lintParagraph(rule, 'It is very important to act now.');
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe('It is '.length);
  });
});

describe('no-vague-intensifiers: case sensitivity', () => {

  it('detects uppercase "VERY IMPORTANT"', () => {
    const errors = lintParagraph(rule, 'This step is VERY IMPORTANT for success.');
    expect(errors.length).toBe(1);
  });

  it('detects mixed case "Very Unique"', () => {
    const errors = lintParagraph(rule, 'This is a Very Unique opportunity.');
    expect(errors.length).toBe(1);
  });
});
