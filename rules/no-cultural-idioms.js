/**
 * textlint rule: no-cultural-idioms
 *
 * Detects culturally specific idioms that may confuse a global audience.
 * Readers who learned English as a second or third language, or who read
 * literally, can't decode an idiom they've never heard.
 *
 * Catches:
 *   - American sports idioms (baseball, football, basketball)
 *   - Poker/gambling idioms
 *   - Military idioms
 *   - Region-specific idioms (British, American colloquialisms)
 *   - Food/domestic idioms opaque to non-native speakers
 */

const PATTERNS = [
  // === American sports idioms ===
  {
    pattern: /\bhome run\b/i,
    message: '"Home run" is a baseball idiom — use "major success", "big win", or describe the achievement.'
  },
  {
    pattern: /\bknock(?:ed|ing)? (?:it )?out of the park\b/i,
    message: '"Knock it out of the park" is a baseball idiom — use "exceeded expectations" or describe the success.'
  },
  {
    pattern: /\btouch base\b/i,
    message: '"Touch base" is a baseball idiom — use "check in", "follow up", or "connect".'
  },
  {
    pattern: /\bcurveball\b/i,
    message: '"Curveball" is a baseball idiom — use "unexpected challenge", "surprise", or "complication".'
  },
  {
    pattern: /\btee-?ball\b/i,
    message: '"Tee-ball" is an American youth sport — use a universally recognized activity.'
  },
  {
    pattern: /\bright off the bat\b/i,
    message: '"Right off the bat" is a baseball idiom — use "immediately", "from the start", or "right away".'
  },
  {
    pattern: /\bstep up to the plate\b/i,
    message: '"Step up to the plate" is a baseball idiom — use "take responsibility" or "volunteer".'
  },
  {
    pattern: /\bballpark (?:figure|estimate|number)\b/i,
    message: '"Ballpark" is a baseball idiom — use "rough estimate" or "approximate figure".'
  },
  {
    pattern: /\bthree strikes\b/i,
    message: '"Three strikes" is a baseball idiom — use "three attempts" or "multiple failures".'
  },
  {
    pattern: /\bhail mary\b/i,
    message: '"Hail Mary" is an American football idiom — use "desperate attempt" or "long shot".'
  },
  {
    pattern: /\bmoving the goalposts?\b/i,
    message: '"Moving the goalposts" is a sports idiom — use "changing the criteria" or "shifting expectations".'
  },
  {
    pattern: /\bdrop(?:ped|ping)? the ball\b/i,
    message: '"Drop the ball" is a sports idiom — use "failed to follow through", "missed", or "neglected".'
  },
  {
    pattern: /\bpunt(?:ed|ing)?\b(?! (?:on|return))/i,
    message: '"Punt" is an American football idiom — use "defer", "postpone", or "skip".'
  },
  {
    pattern: /\bslam dunk\b/i,
    message: '"Slam dunk" is a basketball idiom — use "easy win", "obvious choice", or "guaranteed success".'
  },
  {
    pattern: /\blevels? the playing field\b/i,
    message: '"Level the playing field" is a sports idiom — use "create equal footing", "remove barriers", or "equalize opportunity".'
  },

  // === Poker/gambling idioms ===
  {
    pattern: /\btable stakes\b/i,
    message: '"Table stakes" is a poker idiom — use "the baseline", "minimum requirement", or "expected standard".'
  },
  {
    pattern: /\bdouble down\b/i,
    message: '"Double down" is a gambling idiom — use "commit fully", "intensify", or "increase investment".'
  },
  {
    pattern: /\bup the ante\b/i,
    message: '"Up the ante" is a poker idiom — use "raise expectations" or "increase the stakes".'
  },
  {
    pattern: /\bwild card\b/i,
    message: '"Wild card" is a card game idiom — use "unpredictable factor", "unknown variable", or "surprise".'
  },
  {
    pattern: /\bace up (?:your|their|his|her|one's) sleeve\b/i,
    message: '"Ace up your sleeve" is a card game idiom — use "hidden advantage" or "secret resource".'
  },
  {
    pattern: /\bpoker face\b/i,
    message: '"Poker face" is a gambling idiom — use "neutral expression" or "composure".'
  },

  // === Military idioms ===
  {
    pattern: /\btop cover\b/i,
    message: '"Top cover" is military jargon — use "organizational cover", "leadership protection", or "executive support".'
  },
  {
    pattern: /\bgive[sn]? (?:\w+ )?ammunition\b/i,
    message: '"Give ammunition" is a military metaphor — use "give evidence", "provide support", or "arm with data".'
  },
  {
    pattern: /\bin the trenches\b/i,
    message: '"In the trenches" is a military idiom — use "doing the daily work" or "on the front lines of the work".'
  },
  {
    pattern: /\brally(?:ing)? the troops\b/i,
    message: '"Rally the troops" is a military idiom — use "motivate the team" or "build team energy".'
  },
  {
    pattern: /\bwar room\b/i,
    message: '"War room" is a military idiom — use "incident channel", "command center", or "situation room".'
  },

  // === Region-specific idioms ===
  {
    pattern: /\bgame of telephone\b/i,
    message: '"Game of telephone" is a US-specific children\'s game name — describe the concept directly (e.g., "each relay loses fidelity").'
  },
  {
    pattern: /\bpaper(?:ed|ing)? over\b/i,
    message: '"Paper over" is a culturally opaque idiom — use "hide", "conceal", or "cover up".'
  },
  {
    pattern: /\bspreading the gospel\b/i,
    message: '"Spreading the gospel" is a religious idiom — use "campaigning for it", "advocating", or "promoting".'
  },
  {
    pattern: /\bevangelist(?:s)?\b/i,
    message: '"Evangelist" is a religious term — use "advocate", "promoter", or "champion".'
  },
  {
    pattern: /\bdrink(?:ing)? the Kool-Aid\b/i,
    message: '"Drinking the Kool-Aid" is a US-specific reference — use "accepting uncritically" or "adopting without question".'
  },
  {
    pattern: /\bdrink(?:ing)? from (?:a |the )?firehose\b/i,
    message: '"Drinking from a firehose" is a North American idiom — use "overwhelmed with information" or "flooded with data".'
  },
  {
    pattern: /\bboil(?:ing)? the ocean\b/i,
    message: '"Boiling the ocean" is an English idiom — use "taking on too much" or "trying to do everything at once".'
  },
  {
    pattern: /\bzip code\b/i,
    message: '"Zip code" is US-specific — use "postal code" for a global audience.'
  },
  {
    pattern: /\bpass(?:ing|ed)? the buck\b/i,
    message: '"Passing the buck" is an American idiom — use "shifting responsibility" or "deflecting blame".'
  },
  {
    pattern: /\bsweep(?:ing)? (?:it |things? )?under the rug\b/i,
    message: '"Sweep under the rug" is an English idiom — use "hide", "ignore", or "suppress".'
  },
  {
    pattern: /\bread(?:ing)? the room\b/i,
    message: '"Read the room" is an English idiom — use "gauge the mood", "assess the situation", or "pick up on context".'
  },
  {
    pattern: /\bseat at the table\b/i,
    message: '"Seat at the table" is an American business idiom — use "a voice in the conversation", "influence", or "representation".'
  },
  {
    pattern: /\bpull(?:ed|ing)? the plug\b/i,
    message: '"Pull the plug" is an English idiom — use "cancel", "stop", "shut down", or "end".'
  },
  {
    pattern: /\btee[ds]? up\b/i,
    message: '"Tee up" is a golf idiom — use "prepare", "set up", "queue", or "introduce".'
  },

  // === Domestic/food idioms ===
  {
    pattern: /\bhave (?:your|their|his|her) cake and eat it\b/i,
    message: '"Have your cake and eat it" is an English idiom — use "have both" or "get all the benefits without tradeoffs".'
  },
  {
    pattern: /\bput all (?:your|their|his|her|the) eggs in one basket\b/i,
    message: '"Put all eggs in one basket" is an English idiom — use "concentrate all resources in one place" or "rely on a single approach".'
  },

  // === Colloquial/slang ===
  {
    pattern: /\bon deck\b/i,
    message: '"On deck" is a baseball/nautical idiom — use "upcoming", "next", or "queued".'
  },
  {
    pattern: /\bhash(?:ed|ing)? (?:\w+ )?out\b/i,
    message: '"Hash it out" is an English idiom — use "resolve", "work through", or "discuss thoroughly".'
  },
  {
    pattern: /\bcrickets\b/i,
    message: '"Crickets" (meaning silence) is a North American idiom — use "silence" or "no response".'
  },
  {
    pattern: /\btake the hint\b/i,
    message: '"Take the hint" is an English idiom — use "recognize the signal" or "understand the implication".'
  },
  {
    pattern: /\bspun (?:their |our |your )?wheels\b/i,
    message: '"Spun wheels" is an English idiom — use "made no progress" or "wasted effort".'
  },
  {
    pattern: /\bget (?:it |a \w+ )?out the door\b/i,
    message: '"Get out the door" is an English idiom — use "ship", "deliver", or "release".'
  },
  {
    pattern: /\bfair game\b/i,
    message: '"Fair game" is an English hunting idiom — use "legitimate topics" or "acceptable targets".'
  },
  {
    pattern: /\bboots on the ground\b/i,
    message: '"Boots on the ground" is a military idiom — use "people doing the actual work" or "on-site staff".'
  },

  // === Additional baseball idioms ===
  {
    pattern: /\bout of left field\b/i,
    message: '"Out of left field" is a baseball idiom — use "unexpected", "out of nowhere", or "surprising".'
  },
  {
    pattern: /\bswing(?:ing)? for the fences\b/i,
    message: '"Swing for the fences" is a baseball idiom — use "aim high", "go all in", or describe the ambition.'
  },
  {
    pattern: /\bgo(?:es|ing)? to bat for\b/i,
    message: '"Go to bat for" is a baseball idiom — use "advocate for", "support", or "stand up for".'
  },
  {
    pattern: /\binside baseball\b/i,
    message: '"Inside baseball" is a baseball idiom — use "insider detail" or "niche specifics".'
  },
  {
    pattern: /\brain check\b/i,
    message: '"Rain check" is a baseball idiom — use "reschedule", "postpone", or "another time".'
  },
  {
    pattern: /\bplay(?:ing)? hardball\b/i,
    message: '"Play hardball" is a baseball idiom — use "negotiate aggressively" or "take a firm stance".'
  },

  // === Additional American football idioms ===
  {
    pattern: /\b(?:Monday[- ]morning|armchair) quarterback(?:ing)?\b/i,
    message: '"Monday-morning/armchair quarterback" is an American football idiom — use "second-guess in hindsight" or "criticize after the fact".'
  },

  // === Basketball idioms ===
  {
    pattern: /\bfull[- ]court press\b/i,
    message: '"Full-court press" is a basketball idiom — use "all-out effort" or "intense, sustained push".'
  },

  // === Tennis idioms ===
  {
    pattern: /\bball(?:'s| is) in (?:your|their|his|her|our) court\b/i,
    message: '"The ball is in your court" is a tennis idiom — use "it\'s your decision" or "the next step is yours".'
  },

  // === Horse racing / track idioms ===
  {
    pattern: /\bdown to the wire\b/i,
    message: '"Down to the wire" is a horse-racing idiom — use "until the last moment" or "right up to the deadline".'
  },
  {
    pattern: /\blong shot\b/i,
    message: '"Long shot" is a horse-racing idiom — use "unlikely" or "low-probability".'
  },
  {
    pattern: /\bneck and neck\b/i,
    message: '"Neck and neck" is a horse-racing idiom — use "evenly matched" or "very close".'
  },
  {
    pattern: /\bfront[- ]runner\b/i,
    message: '"Front-runner" is a racing idiom — use "leading candidate" or "the favorite".'
  },
  {
    pattern: /\bjump(?:ed|ing)? the gun\b/i,
    message: '"Jump the gun" is a track-and-field idiom — use "act prematurely" or "start too early".'
  },

  // === Boxing idioms ===
  {
    pattern: /\bthr(?:ow|ew|owing|own) in the towel\b/i,
    message: '"Throw in the towel" is a boxing idiom — use "give up", "concede", or "stop".'
  },
  {
    pattern: /\broll(?:ing)? with the punches\b/i,
    message: '"Roll with the punches" is a boxing idiom — use "adapt", "stay flexible", or "absorb setbacks".'
  },
  {
    pattern: /\bbelow the belt\b/i,
    message: '"Below the belt" is a boxing idiom — use "unfair" or "out of bounds".'
  },
  {
    pattern: /\bsaved by the bell\b/i,
    message: '"Saved by the bell" is a boxing idiom — use "rescued at the last moment".'
  },
  {
    pattern: /\bthe gloves (?:are|come) off\b/i,
    message: '"The gloves are off" is a boxing idiom — use "no longer holding back" or describe the escalation.'
  },

  // === Pool/billiards idioms ===
  {
    pattern: /\bbehind the eight ball\b/i,
    message: '"Behind the eight ball" is a billiards idiom — use "at a disadvantage" or "in a tough spot".'
  },

  // === Bowling idioms ===
  {
    pattern: /\bright up (?:your|their|his|her|my|our) alley\b/i,
    message: '"Right up your alley" is a bowling idiom — use "well suited to you" or "a good fit".'
  },

  // === American colloquialisms ===
  {
    pattern: /\bkick(?:ed|ing)? the tires\b/i,
    message: '"Kick the tires" is an American car-buying idiom — use "evaluate", "try out", or "test".'
  },
  {
    pattern: /\bkick(?:ed|ing)? the can down the road\b/i,
    message: '"Kick the can down the road" is an American idiom — use "defer", "postpone", or "put off the decision".'
  },
  {
    pattern: /\bthe whole nine yards\b/i,
    message: '"The whole nine yards" is an American idiom — use "everything", "the full set", or "all of it".'
  },
  {
    pattern: /\bunder the bus\b/i,
    message: '"Throw under the bus" is an American idiom — use "blame", "sacrifice", or "betray".'
  },
  {
    pattern: /\bcircl(?:e[sd]?|ing) the wagons\b/i,
    message: '"Circle the wagons" is an American frontier idiom — use "close ranks", "get defensive", or "regroup".'
  },
  {
    pattern: /\bducks in a row\b/i,
    message: '"Ducks in a row" is an American idiom — use "organized", "prepared", or "details sorted".'
  },
  {
    pattern: /\bwheelhouse\b/i,
    message: '"Wheelhouse" is an American (baseball-origin) idiom — use "area of strength" or "specialty".'
  },

  // === Food/domestic idioms ===
  {
    pattern: /\bpiece of cake\b/i,
    message: '"Piece of cake" is an English idiom — use "easy" or "simple".'
  },
  {
    pattern: /\bbite off more than (?:you|they|he|she|we|I) can chew\b/i,
    message: '"Bite off more than you can chew" is an English idiom — use "take on too much" or "overcommit".'
  },
  {
    pattern: /\bspill(?:ed|ing)? the beans\b/i,
    message: '"Spill the beans" is an English idiom — use "reveal", "disclose", or "give it away".'
  },
  {
    pattern: /\bbring(?:s|ing)? home the bacon\b/i,
    message: '"Bring home the bacon" is an English idiom — use "earn a living" or "deliver results".'
  },
  {
    pattern: /\bproof is in the pudding\b/i,
    message: '"The proof is in the pudding" is a British idiom — use "results prove it" or "judge by outcomes".'
  },
  {
    pattern: /\b(?:not |isn['']t )?(?:my|their|his|her|your) cup of tea\b/i,
    message: '"Not my cup of tea" is a British idiom — use "not my preference" or "not for me".'
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
