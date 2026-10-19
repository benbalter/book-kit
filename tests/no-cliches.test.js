import { describe, it, expect } from 'vitest';

/**
 * Test suite for no-cliches textlint rule
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadRule() {
  const rulePath = path.join(SCRIPT_DIR, '..', 'rules', 'no-cliches.js');
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
describe('no-cliches: corporate buzzwords', () => {

  it('detects "leverage" as verb', () => {
    const errors = lintParagraph(rule, 'We should leverage our existing tools.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Leverage')).toBeTruthy();
  });

  it('detects "leveraging"', () => {
    const errors = lintParagraph(rule, 'By leveraging cold frames, gardeners plant earlier.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Leverage')).toBeTruthy();
  });

  it('detects "synergy"', () => {
    const errors = lintParagraph(rule, 'We need more synergy between the beds.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Synergy')).toBeTruthy();
  });

  it('detects "paradigm shift"', () => {
    const errors = lintParagraph(rule, 'This represents a paradigm shift in how we bake.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Paradigm shift')).toBeTruthy();
  });

  it('detects "game-changer"', () => {
    const errors = lintParagraph(rule, 'A stand mixer is a game-changer for bread.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Game-changer')).toBeTruthy();
  });

  it('detects "seamless"', () => {
    const errors = lintParagraph(rule, 'The transition was seamless.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Seamless')).toBeTruthy();
  });

  it('detects "robust"', () => {
    const errors = lintParagraph(rule, 'We need a robust solution for this problem.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Robust')).toBeTruthy();
  });

  it('detects "cutting-edge"', () => {
    const errors = lintParagraph(rule, 'Our cutting-edge technology leads the industry.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Cutting-edge')).toBeTruthy();
  });

  it('detects "innovative"', () => {
    const errors = lintParagraph(rule, 'This is an innovative approach to composting.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Innovative')).toBeTruthy();
  });

  it('detects "holistic"', () => {
    const errors = lintParagraph(rule, 'We need a holistic approach to pest control.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Holistic')).toBeTruthy();
  });

  it('detects "holistically"', () => {
    const errors = lintParagraph(rule, 'We should think about this holistically.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Holistic')).toBeTruthy();
  });
});

describe('no-cliches: business clichés', () => {

  it('detects "circle back"', () => {
    const errors = lintParagraph(rule, "Let's circle back on this next week.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Circle back')).toBeTruthy();
  });

  it('detects "touch base"', () => {
    const errors = lintParagraph(rule, "Let's touch base about the project.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Touch base')).toBeTruthy();
  });

  it('detects "low-hanging fruit"', () => {
    const errors = lintParagraph(rule, 'Start with the low-hanging fruit.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Low-hanging fruit')).toBeTruthy();
  });

  it('detects "move the needle"', () => {
    const errors = lintParagraph(rule, 'This change will move the needle on yield.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Move the needle')).toBeTruthy();
  });

  it('detects "deep dive"', () => {
    const errors = lintParagraph(rule, "Let's do a deep dive into the metrics.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Deep dive')).toBeTruthy();
  });

  it('detects "drill down"', () => {
    const errors = lintParagraph(rule, 'We need to drill down into the data.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Drill down')).toBeTruthy();
  });

  it('detects "loop in"', () => {
    const errors = lintParagraph(rule, 'Can you loop in the bindery?');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Loop in')).toBeTruthy();
  });

  it('detects "take it offline"', () => {
    const errors = lintParagraph(rule, "Let's take this offline and discuss later.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Take it offline')).toBeTruthy();
  });

  it('detects "boil the ocean"', () => {
    const errors = lintParagraph(rule, "We don't want to boil the ocean with this project.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Boil the ocean')).toBeTruthy();
  });
});

describe('no-cliches: vague corporate filler', () => {

  it('detects "best practices"', () => {
    const errors = lintParagraph(rule, 'Follow the best practices for seed starting.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Best practice')).toBeTruthy();
  });

  it('detects "best practice" singular', () => {
    const errors = lintParagraph(rule, 'This is a best practice for home bakers.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Best practice')).toBeTruthy();
  });

  it('detects "unique opportunity"', () => {
    const errors = lintParagraph(rule, 'This is a unique opportunity to transform the garden.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Unique opportunity')).toBeTruthy();
  });

  it('detects "pain points"', () => {
    const errors = lintParagraph(rule, 'We identified several pain points in the canning process.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Pain point')).toBeTruthy();
  });

  it('detects "value proposition"', () => {
    const errors = lintParagraph(rule, 'The value proposition of raised beds is clear.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Value proposition')).toBeTruthy();
  });
});

describe('no-cliches: metaphorical clichés', () => {

  it('detects "at the end of the day" at sentence start', () => {
    const errors = lintParagraph(rule, 'At the end of the day, what matters is results.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('At the end of the day')).toBeTruthy();
  });

  it('detects "at the end of the day" after period', () => {
    const errors = lintParagraph(rule, 'We tried everything. At the end of the day, nothing worked.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('At the end of the day')).toBeTruthy();
  });

  it('does not flag literal "at the end of the day" mid-sentence', () => {
    const errors = lintParagraph(rule, 'They go home at the end of the day.');
    expect(errors.length).toBe(0);
  });

  it('detects "think outside the box"', () => {
    const errors = lintParagraph(rule, 'We need to think outside the box on this one.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Think outside the box')).toBeTruthy();
  });

  it('detects "on the same page"', () => {
    const errors = lintParagraph(rule, 'We need everyone on the same page before launching.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('On the same page')).toBeTruthy();
  });

  it('detects "not a bug, it\'s a feature"', () => {
    const errors = lintParagraph(rule, "That's not a bug, it's a feature of sourdough.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Not a bug')).toBeTruthy();
  });

  it('detects "isn\'t a bug—it\'s a feature" variant', () => {
    const errors = lintParagraph(rule, "This isn't a bug—it's a feature.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Not a bug')).toBeTruthy();
  });

  it('detects "X is a feature, not a bug" reversed form', () => {
    const errors = lintParagraph(rule, "The slow start on Monday mornings is a feature, not a bug.");
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('feature, not a bug')).toBeTruthy();
  });
});

describe('no-cliches: allow option', () => {

  it('skips patterns matching allow list', () => {
    const errors = lintParagraph(rule, 'We should leverage our tools.', {
      allow: ['Leverage']
    });
    expect(errors.length).toBe(0);
  });

  it('still catches non-allowed patterns', () => {
    const errors = lintParagraph(rule, 'We should leverage our tools and do a deep dive.', {
      allow: ['Leverage']
    });
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Deep dive')).toBeTruthy();
  });
});

describe('no-cliches: clean text passes', () => {

  it('does not flag normal prose', () => {
    const errors = lintParagraph(rule, 'Gardeners rotate crops each season to keep the soil healthy and the pests guessing.');
    expect(errors.length).toBe(0);
  });

  it('does not flag specific alternatives', () => {
    const errors = lintParagraph(rule, 'Use proven methods for small plots. Follow up on unfinished chores. Check the seedlings regularly.');
    expect(errors.length).toBe(0);
  });
});

describe('no-cliches: general business clichés', () => {

  it('detects "back to square one"', () => {
    const errors = lintParagraph(rule, 'After the flood, we were back to square one.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Back to square one');
  });

  it('detects "back to the drawing board"', () => {
    const errors = lintParagraph(rule, "The prototype failed, so it's back to the drawing board.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Back to the drawing board');
  });

  it('detects "bite the bullet"', () => {
    const errors = lintParagraph(rule, 'Sometimes you have to bite the bullet and replant.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Bite the bullet');
  });

  it('detects "crystal clear"', () => {
    const errors = lintParagraph(rule, 'The requirements should be crystal clear before you start.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Crystal clear');
  });

  it('detects "easier said than done"', () => {
    const errors = lintParagraph(rule, 'No-dig gardening is easier said than done for most growers.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Easier said than done');
  });

  it('detects "for all intents and purposes"', () => {
    const errors = lintParagraph(rule, 'For all intents and purposes, the orchard is fully grown.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('For all intents and purposes');
  });

  it('detects "goes without saying"', () => {
    const errors = lintParagraph(rule, 'It goes without saying that drainage matters.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Goes without saying');
  });

  it('detects "needless to say"', () => {
    const errors = lintParagraph(rule, 'Needless to say, the cake could have used more sugar.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Needless to say');
  });

  it('detects "in a nutshell"', () => {
    const errors = lintParagraph(rule, 'In a nutshell, baking is about patience.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('In a nutshell');
  });

  it('detects "in this day and age"', () => {
    const errors = lintParagraph(rule, 'In this day and age, composting should be the default.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('In this day and age');
  });

  it('detects "last but not least"', () => {
    const errors = lintParagraph(rule, 'Last but not least, consider the frost dates.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Last but not least');
  });

  it('detects "it is what it is"', () => {
    const errors = lintParagraph(rule, 'The policy is frustrating, but it is what it is.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('It is what it is');
  });

  it('detects "bottom line" as cliché', () => {
    const errors = lintParagraph(rule, 'The bottom line is that mulched beds need less water.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Bottom line');
  });

  it('does not flag "bottom line up front"', () => {
    const errors = lintParagraph(rule, 'Put the bottom line up front when writing recipes.');
    expect(errors.length).toBe(0);
  });
});

describe('no-cliches: metaphorical clichés in professional writing', () => {

  it('detects "tip of the iceberg"', () => {
    const errors = lintParagraph(rule, 'The aphids are just the tip of the iceberg.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Tip of the iceberg');
  });

  it('detects "perfect storm"', () => {
    const errors = lintParagraph(rule, 'It was a perfect storm of late frost and heavy rain.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Perfect storm');
  });

  it('detects "uphill battle"', () => {
    const errors = lintParagraph(rule, 'Growing citrus is an uphill battle without a greenhouse.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Uphill battle');
  });

  it('detects "light at the end of the tunnel"', () => {
    const errors = lintParagraph(rule, 'After months of drought, they saw a light at the end of the tunnel.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Light at the end of the tunnel');
  });

  it('detects "reinvent the wheel"', () => {
    const errors = lintParagraph(rule, 'There is no need to reinvent the wheel for pie crust.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Reinvent the wheel');
  });

  it('detects "reinventing the wheel"', () => {
    const errors = lintParagraph(rule, 'Bakers keep reinventing the wheel instead of sharing.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Reinvent the wheel');
  });

  it('detects "can of worms"', () => {
    const errors = lintParagraph(rule, 'Changing the policy opened a can of worms.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Can of worms');
  });

  it('detects "par for the course"', () => {
    const errors = lintParagraph(rule, 'Slugs are par for the course in damp gardens.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Par for the course');
  });

  it('detects "cut to the chase"', () => {
    const errors = lintParagraph(rule, "Let me cut to the chase: compost works.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Cut to the chase');
  });

  it('detects "water under the bridge"', () => {
    const errors = lintParagraph(rule, "The past disagreements are water under the bridge now.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Water under the bridge');
  });

  it('detects "when push comes to shove"', () => {
    const errors = lintParagraph(rule, 'When push comes to shove, people revert to old habits.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('When push comes to shove');
  });

  it('detects "read between the lines"', () => {
    const errors = lintParagraph(rule, 'Seed savers have to read between the lines of every old label.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Read between the lines');
  });

  it('detects "shed some light on"', () => {
    const errors = lintParagraph(rule, 'This chapter will shed some light on grafting.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Shed some light on');
  });

  it('detects "shedding light on"', () => {
    const errors = lintParagraph(rule, 'The soil test was shedding light on hidden problems.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Shed');
  });

  it('detects "elephant in the room"', () => {
    const errors = lintParagraph(rule, "Let's address the elephant in the room: the weeds.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Elephant in the room');
  });

  it('detects "raise the bar"', () => {
    const errors = lintParagraph(rule, 'A good oven should raise the bar for crusts.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Raise the bar');
  });

  it('detects "hit the ground running"', () => {
    const errors = lintParagraph(rule, 'New gardeners should hit the ground running with good tools.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Hit the ground running');
  });

  it('detects "silver lining"', () => {
    const errors = lintParagraph(rule, 'The silver lining of the wet spring was a bumper crop of greens.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Silver lining');
  });

  it('detects "breath of fresh air"', () => {
    const errors = lintParagraph(rule, 'The new kitchen was a breath of fresh air after years of cramped counters.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Breath of fresh air');
  });
});

describe('no-cliches: tech/management clichés', () => {

  it('detects "one size fits all"', () => {
    const errors = lintParagraph(rule, 'There is no one size fits all solution for potting soil.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('One size fits all');
  });

  it('detects "call the shots"', () => {
    const errors = lintParagraph(rule, 'The head gardener should not be the only one calling the shots.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Call the shots');
  });

  it('detects "phone it in"', () => {
    const errors = lintParagraph(rule, 'Bakers who phone it in are quickly noticed.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Phone it in');
  });

  it('detects "go the extra mile"', () => {
    const errors = lintParagraph(rule, 'Good neighbors go the extra mile for each other.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Go the extra mile');
  });

  it('detects "going the extra mile"', () => {
    const errors = lintParagraph(rule, 'Going the extra mile on soil prep pays dividends.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Go the extra mile');
  });

  it('detects "from the ground up"', () => {
    const errors = lintParagraph(rule, 'We built the greenhouse from the ground up.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('From the ground up');
  });

  it('detects "on the radar"', () => {
    const errors = lintParagraph(rule, 'This blight has been on our radar for months.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('On the radar');
  });

  it('detects "drop the ball"', () => {
    const errors = lintParagraph(rule, 'Without a watering schedule, someone will drop the ball.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Drop the ball');
  });

  it('detects "get the ball rolling"', () => {
    const errors = lintParagraph(rule, "Let's get the ball rolling on the spring planting.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Get the ball rolling');
  });

  it('detects "run it up the flagpole"', () => {
    const errors = lintParagraph(rule, "Let's run it up the flagpole and see what happens.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Run it up the flagpole');
  });

  it('detects "push the envelope"', () => {
    const errors = lintParagraph(rule, 'Urban growers push the envelope on what a balcony garden can be.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Push the envelope');
  });

  it('detects "move the goalposts"', () => {
    const errors = lintParagraph(rule, 'The judges keep moving the goalposts on the pie contest.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Move the goalposts');
  });

  it('detects "skin in the game"', () => {
    const errors = lintParagraph(rule, 'Volunteers need skin in the game to keep the garden going.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Skin in the game');
  });

  it('detects "all hands on deck"', () => {
    const errors = lintParagraph(rule, 'It was an all hands on deck situation during the harvest.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('All hands on deck');
  });

  it('detects "rubber stamp"', () => {
    const errors = lintParagraph(rule, 'Seed inspections should not be a rubber stamp process.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Rubber stamp');
  });

  it('detects "rubber-stamped"', () => {
    const errors = lintParagraph(rule, 'The proposal was rubber-stamped without discussion.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Rubber stamp');
  });

  it('detects "take it to the next level"', () => {
    const errors = lintParagraph(rule, 'This framework will take it to the next level.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Take it to the next level');
  });

  // === AI-characteristic buzzwords and clichés (regression guards) ===

  it('detects "tapestry"', () => {
    const errors = lintParagraph(rule, 'The garden is a rich tapestry of colors.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Tapestry');
  });

  it('detects "testament to"', () => {
    const errors = lintParagraph(rule, 'The result is a testament to careful pruning.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Testament to');
  });

  it('detects "myriad"', () => {
    const errors = lintParagraph(rule, 'There are a myriad of tools to choose from.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Myriad');
  });

  it('detects "north star"', () => {
    const errors = lintParagraph(rule, 'Impact is our north star.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('North star');
  });

  it('detects "underscores"', () => {
    const errors = lintParagraph(rule, 'This underscores the need for mulch.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Underscore');
  });

  it('detects "supercharge"', () => {
    const errors = lintParagraph(rule, 'A drip line will supercharge the garden.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Supercharge');
  });

  it('detects "double-edged sword"', () => {
    const errors = lintParagraph(rule, 'Pruning is a double-edged sword.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Double-edged sword');
  });

  it('detects "win-win"', () => {
    const errors = lintParagraph(rule, 'Composting is a win-win for everyone.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Win-win');
  });

  it('detects "no-brainer"', () => {
    const errors = lintParagraph(rule, 'Labeling seedlings is a no-brainer.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('No-brainer');
  });

  it('detects "moving parts"', () => {
    const errors = lintParagraph(rule, 'The banquet has a lot of moving parts.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Moving parts');
  });

  it('detects "double-click" as a metaphor', () => {
    const errors = lintParagraph(rule, "Let's double-click on the germination numbers.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Double-click');
  });

  it('does not flag a literal "double-click the icon"', () => {
    const errors = lintParagraph(rule, 'Double-click the icon to open the app.');
    expect(errors.length).toBe(0);
  });
});

describe('no-cliches: additional buzzwords and metaphors', () => {

  it('detects "thought leadership"', () => {
    const errors = lintParagraph(rule, 'She built a reputation in horticulture through thought leadership.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Thought leader');
  });

  it('detects "game plan"', () => {
    const errors = lintParagraph(rule, 'We need a game plan for the harvest.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Game plan');
  });

  it('detects "mission-critical"', () => {
    const errors = lintParagraph(rule, 'The irrigation line is mission-critical infrastructure.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Mission-critical');
  });

  it('detects "silver bullet"', () => {
    const errors = lintParagraph(rule, 'There is no silver bullet for powdery mildew.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Silver bullet');
  });

  it('detects "holy grail"', () => {
    const errors = lintParagraph(rule, 'A weed-free bed is the holy grail of gardening.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Holy grail');
  });

  it('detects "herding cats"', () => {
    const errors = lintParagraph(rule, 'Coordinating five volunteers felt like herding cats.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Herding cats');
  });

  it('detects "wears many hats"', () => {
    const errors = lintParagraph(rule, 'On a small farm, everyone wears many hats.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Wear many hats');
  });

  it('detects "bring to the table"', () => {
    const errors = lintParagraph(rule, 'Explain what each herb brings to the table.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Bring to the table');
  });

  it('detects "lay of the land"', () => {
    const errors = lintParagraph(rule, 'New volunteers need to learn the lay of the land.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Lay of the land');
  });

  it('does not flag clean prose', () => {
    const errors = lintParagraph(rule, 'Write the planting date down so anyone can check it later.');
    expect(errors.length).toBe(0);
  });
});
