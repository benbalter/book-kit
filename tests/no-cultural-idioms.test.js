import { describe, it, expect } from 'vitest';

/**
 * Test suite for no-cultural-idioms textlint rule
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadRule() {
  const rulePath = path.join(SCRIPT_DIR, '..', 'rules', 'no-cultural-idioms.js');
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

describe('no-cultural-idioms: American sports idioms', () => {

  it('detects "home run"', () => {
    const errors = lintParagraph(rule, 'That recipe was a real home run for the family.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Home run')).toBeTruthy();
  });

  it('detects "knocked it out of the park"', () => {
    const errors = lintParagraph(rule, 'The catering crew knocked it out of the park.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Knock it out of the park')).toBeTruthy();
  });

  it('detects "touch base"', () => {
    const errors = lintParagraph(rule, 'Let me touch base with you about the garden plot.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Touch base')).toBeTruthy();
  });

  it('detects "curveball"', () => {
    const errors = lintParagraph(rule, 'The late frost threw us a curveball.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Curveball')).toBeTruthy();
  });

  it('detects "tee-ball"', () => {
    const errors = lintParagraph(rule, 'This should be as easy as tee-ball.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Tee-ball')).toBeTruthy();
  });

  it('detects "right off the bat"', () => {
    const errors = lintParagraph(rule, 'Right off the bat, we knew this approach would work.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Right off the bat')).toBeTruthy();
  });

  it('detects "step up to the plate"', () => {
    const errors = lintParagraph(rule, 'Someone needs to step up to the plate and organize the bake sale.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Step up to the plate')).toBeTruthy();
  });

  it('detects "ballpark figure"', () => {
    const errors = lintParagraph(rule, 'Can you give me a ballpark figure for the harvest?');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Ballpark')).toBeTruthy();
  });

  it('detects "slam dunk"', () => {
    const errors = lintParagraph(rule, 'Switching to raised beds was a slam dunk decision.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Slam dunk')).toBeTruthy();
  });

  it('detects "three strikes"', () => {
    const errors = lintParagraph(rule, 'After three strikes, the bake-off was cancelled.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Three strikes')).toBeTruthy();
  });

  it('detects "hail mary"', () => {
    const errors = lintParagraph(rule, 'The last-minute proposal was a hail mary attempt.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Hail Mary')).toBeTruthy();
  });

  it('detects "moving the goalposts"', () => {
    const errors = lintParagraph(rule, 'The judges keep moving the goalposts on this contest.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Moving the goalposts')).toBeTruthy();
  });

  it('detects "dropped the ball"', () => {
    const errors = lintParagraph(rule, 'The volunteers dropped the ball on the watering.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Drop the ball')).toBeTruthy();
  });

  it('detects "punt"', () => {
    const errors = lintParagraph(rule, 'We decided to punt the replanting until next spring.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Punt')).toBeTruthy();
  });

  it('detects "levels the playing field"', () => {
    const errors = lintParagraph(rule, 'This rule levels the playing field for all entrants.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Level the playing field')).toBeTruthy();
  });

  it('detects "level the playing field"', () => {
    const errors = lintParagraph(rule, 'We need to level the playing field across plots.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Level the playing field')).toBeTruthy();
  });
});

describe('no-cultural-idioms: poker/gambling idioms', () => {

  it('detects "table stakes"', () => {
    const errors = lintParagraph(rule, 'Good drainage is table stakes for container gardens.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Table stakes')).toBeTruthy();
  });

  it('detects "double down"', () => {
    const errors = lintParagraph(rule, 'We decided to double down on heirloom tomatoes.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Double down')).toBeTruthy();
  });

  it('detects "up the ante"', () => {
    const errors = lintParagraph(rule, 'The club decided to up the ante with stricter judging.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Up the ante')).toBeTruthy();
  });

  it('detects "wild card"', () => {
    const errors = lintParagraph(rule, 'The new variety is a wild card in the garden.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Wild card')).toBeTruthy();
  });

  it('detects "ace up your sleeve"', () => {
    const errors = lintParagraph(rule, 'She always has an ace up her sleeve for tough pie contests.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Ace up your sleeve')).toBeTruthy();
  });

  it('detects "poker face"', () => {
    const errors = lintParagraph(rule, 'She maintained a poker face during the negotiation.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Poker face')).toBeTruthy();
  });
});

describe('no-cultural-idioms: military idioms', () => {

  it('detects "top cover"', () => {
    const errors = lintParagraph(rule, 'We need top cover from the council to push this through.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Top cover')).toBeTruthy();
  });

  it('detects "give ammunition"', () => {
    const errors = lintParagraph(rule, 'This report gives them ammunition to block the proposal.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Give ammunition')).toBeTruthy();
  });

  it('detects "in the trenches"', () => {
    const errors = lintParagraph(rule, 'The gardeners working in the trenches know the real problems.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('In the trenches')).toBeTruthy();
  });

  it('detects "rally the troops"', () => {
    const errors = lintParagraph(rule, 'The organizer tried to rally the troops before the fair.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Rally the troops')).toBeTruthy();
  });

  it('detects "war room"', () => {
    const errors = lintParagraph(rule, 'The club set up a war room to coordinate the flower show.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('War room')).toBeTruthy();
  });
});

describe('no-cultural-idioms: region-specific idioms', () => {

  it('detects "game of telephone"', () => {
    const errors = lintParagraph(rule, 'Without written recipes, family dishes become a game of telephone.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Game of telephone')).toBeTruthy();
  });

  it('detects "paper over"', () => {
    const errors = lintParagraph(rule, 'Don\'t paper over the underlying problems with fertilizer.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Paper over')).toBeTruthy();
  });

  it('detects "spreading the gospel"', () => {
    const errors = lintParagraph(rule, 'She spent months spreading the gospel of no-dig gardening.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Spreading the gospel')).toBeTruthy();
  });

  it('detects "drinking the Kool-Aid"', () => {
    const errors = lintParagraph(rule, 'The whole club was drinking the Kool-Aid on this new fertilizer.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Drinking the Kool-Aid')).toBeTruthy();
  });

  it('detects "drinking from the firehose"', () => {
    const errors = lintParagraph(rule, 'New beekeepers feel like they are drinking from the firehose.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Drinking from a firehose')).toBeTruthy();
  });

  it('detects "boiling the ocean"', () => {
    const errors = lintParagraph(rule, 'Trying to weed everything at once is boiling the ocean.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Boiling the ocean')).toBeTruthy();
  });

  it('detects "zip code"', () => {
    const errors = lintParagraph(rule, 'Your zip code should not determine which seeds you can buy.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Zip code')).toBeTruthy();
  });

  it('detects "passing the buck"', () => {
    const errors = lintParagraph(rule, 'Stop passing the buck and fix the leaky hose.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Passing the buck')).toBeTruthy();
  });

  it('detects "sweep it under the rug"', () => {
    const errors = lintParagraph(rule, 'Gardeners often sweep it under the rug instead of addressing blight.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Sweep under the rug')).toBeTruthy();
  });

  it('detects "reading the room"', () => {
    const errors = lintParagraph(rule, 'At a crowded market, reading the room is much harder.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Read the room')).toBeTruthy();
  });

  it('detects "evangelist"', () => {
    const errors = lintParagraph(rule, 'Every garden club needs a composting evangelist to champion change.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Evangelist')).toBeTruthy();
  });

  it('detects "seat at the table"', () => {
    const errors = lintParagraph(rule, 'Every grower deserves a seat at the table in these discussions.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Seat at the table')).toBeTruthy();
  });

  it('detects "pull the plug"', () => {
    const errors = lintParagraph(rule, 'If adoption is low after six months, pull the plug.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Pull the plug')).toBeTruthy();
  });

  it('detects "tee up"', () => {
    const errors = lintParagraph(rule, 'Let me tee up the tasting with some context.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Tee up')).toBeTruthy();
  });
});

describe('no-cultural-idioms: domestic/food idioms', () => {

  it('detects "have your cake and eat it"', () => {
    const errors = lintParagraph(rule, 'You can\'t have your cake and eat it when choosing seeds.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Have your cake and eat it')).toBeTruthy();
  });

  it('detects "put all eggs in one basket"', () => {
    const errors = lintParagraph(rule, 'Don\'t put all your eggs in one basket with a single tomato variety.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Put all eggs in one basket')).toBeTruthy();
  });
});

describe('no-cultural-idioms: colloquial/slang', () => {

  it('detects "on deck"', () => {
    const errors = lintParagraph(rule, 'The next project on deck is the herb spiral.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('On deck')).toBeTruthy();
  });

  it('detects "hash it out"', () => {
    const errors = lintParagraph(rule, 'We need to hash it out before making a final decision.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Hash it out')).toBeTruthy();
  });

  it('detects "hashed that out" variant', () => {
    const errors = lintParagraph(rule, 'Alex and Jordan hashed that out over lunch last summer.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Hash it out')).toBeTruthy();
  });

  it('detects "crickets"', () => {
    const errors = lintParagraph(rule, 'After posting the recipe, all we heard was crickets.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Crickets')).toBeTruthy();
  });

  it('detects "take the hint"', () => {
    const errors = lintParagraph(rule, 'Some people just can\'t take the hint that the party is over.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Take the hint')).toBeTruthy();
  });

  it('detects "spun wheels"', () => {
    const errors = lintParagraph(rule, 'The volunteers spun their wheels for weeks without clear direction.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Spun wheels')).toBeTruthy();
  });

  it('detects "get it out the door"', () => {
    const errors = lintParagraph(rule, 'We need to get it out the door before the fair.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Get out the door')).toBeTruthy();
  });

  it('detects "fair game"', () => {
    const errors = lintParagraph(rule, 'Once a recipe is published, the method is fair game for discussion.');
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Fair game')).toBeTruthy();
  });
});

describe('no-cultural-idioms: inline code exemption', () => {

  it('does NOT flag idiom inside backtick code spans', () => {
    const errors = lintParagraph(rule, 'The `home run` function calculates the score.');
    expect(errors.length).toBe(0);
  });
});

describe('no-cultural-idioms: allow option', () => {

  it('skips patterns matching allow list', () => {
    const errors = lintParagraph(rule, 'Good drainage is table stakes for container gardens.', {
      allow: ['Table stakes']
    });
    expect(errors.length).toBe(0);
  });

  it('still catches non-allowed patterns', () => {
    const errors = lintParagraph(rule, 'Good drainage is table stakes and mulch is a slam dunk.', {
      allow: ['Table stakes']
    });
    expect(errors.length).toBe(1);
    expect(errors[0].message.includes('Slam dunk')).toBeTruthy();
  });
});

describe('no-cultural-idioms: military idioms', () => {

  it('detects "boots on the ground"', () => {
    const errors = lintParagraph(rule, 'We need boots on the ground for the planting day.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Boots on the ground');
  });
});

describe('no-cultural-idioms: clean text passes', () => {

  it('does not flag normal prose without idioms', () => {
    const errors = lintParagraph(rule, 'Gardeners rotate crops each season to keep the soil healthy and the pests guessing.');
    expect(errors.length).toBe(0);
  });
});

describe('no-cultural-idioms: additional sports idioms', () => {

  it('detects "out of left field" (baseball)', () => {
    const errors = lintParagraph(rule, 'The objection came out of left field.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Out of left field');
  });

  it('detects "the ball is in your court" (tennis)', () => {
    const errors = lintParagraph(rule, 'I sent the recipe, so the ball is in your court.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('ball is in your court');
  });

  it('detects "ball\'s in your court" contraction', () => {
    const errors = lintParagraph(rule, "The ball's in your court now.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('ball is in your court');
  });

  it('detects "Monday-morning quarterback" (football)', () => {
    const errors = lintParagraph(rule, "Don't Monday-morning quarterback the burnt roast.");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('quarterback');
  });

  it('detects "throw in the towel" (boxing)', () => {
    const errors = lintParagraph(rule, 'They threw in the towel after the second attempt.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Throw in the towel');
  });

  it('detects "down to the wire" (horse racing)', () => {
    const errors = lintParagraph(rule, 'The pie contest went down to the wire.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Down to the wire');
  });

  it('detects "throw under the bus" (American)', () => {
    const errors = lintParagraph(rule, 'He threw the crew under the bus at the tasting.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('under the bus');
  });

  it('detects "ducks in a row" (American)', () => {
    const errors = lintParagraph(rule, 'Get your ducks in a row before the fair.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Ducks in a row');
  });

  it('detects "piece of cake" (food idiom)', () => {
    const errors = lintParagraph(rule, 'Setting up the trellis was a piece of cake.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('Piece of cake');
  });

  it('detects "not my cup of tea" (British)', () => {
    const errors = lintParagraph(rule, 'Early-morning weeding is not my cup of tea.');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('cup of tea');
  });

  it('does NOT flag the additional idioms inside code spans', () => {
    const errors = lintParagraph(rule, 'The `down to the wire` label tracks harvest timing.');
    expect(errors.length).toBe(0);
  });
});
