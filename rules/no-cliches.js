/**
 * textlint rule: no-cliches
 *
 * Detects corporate clichés and buzzwords that plain-language style guides
 * recommend avoiding. These are phrases that obscure meaning
 * and should be replaced with specific, direct language.
 *
 * Catches:
 *   - Corporate buzzwords ("leverage", "synergy", "paradigm shift")
 *   - Business clichés ("circle back", "touch base", "low-hanging fruit")
 *   - Vague corporate terms ("best practices", "alignment", "going forward")
 *   - Filler phrases ("at the end of the day", "move the needle")
 */

const PATTERNS = [
  // === Corporate buzzwords ===
  {
    pattern: /\bleverag(?:e[sd]?|ing)\b/i,
    message: '"Leverage" is a buzzword — use "use", "apply", "build on", or be specific about how.'
  },
  {
    pattern: /\bsynerg(?:y|ies|ize|ized|izing)\b/i,
    message: '"Synergy" is a buzzword — use "collaboration", "combined effect", or describe the actual benefit.'
  },
  {
    pattern: /\bparadigm shift\b/i,
    message: '"Paradigm shift" is a buzzword — use "significant change", "fundamental change", or describe what\'s changing.'
  },
  {
    pattern: /\bgame[- ]?changer\b/i,
    message: '"Game-changer" is a buzzword — describe the specific impact or benefit.'
  },
  {
    pattern: /\bseamless(?:ly)?\b/i,
    message: '"Seamless" is a buzzword — use "smooth", "integrated", or describe the actual experience.'
  },
  {
    pattern: /\brobust\b/i,
    message: '"Robust" is a buzzword — use "reliable", "well-tested", or be specific.'
  },
  {
    pattern: /\bworld[- ]?class\b/i,
    message: '"World-class" is a buzzword — provide actual evidence or metrics.'
  },
  {
    pattern: /\bbest[- ]?in[- ]?class\b/i,
    message: '"Best-in-class" is a buzzword — provide actual evidence or metrics.'
  },
  {
    pattern: /\bcutting[- ]?edge\b/i,
    message: '"Cutting-edge" is a buzzword — describe what\'s new or advanced about it specifically.'
  },
  {
    pattern: /\bvalue[- ]?add\b/i,
    message: '"Value-add" is a buzzword — describe the actual value or benefit.'
  },
  {
    pattern: /\bholistic(?:ally)?\b/i,
    message: '"Holistic" is a buzzword — use "comprehensive", "complete", or describe the scope specifically.'
  },

  // === Business clichés ===
  {
    pattern: /\bcircle back\b/i,
    message: '"Circle back" is a cliché — use "follow up", "return to", or "discuss later".'
  },
  {
    pattern: /\btouch base\b/i,
    message: '"Touch base" is a cliché — use "check in", "discuss", or "meet".'
  },
  {
    pattern: /\blow[- ]?hanging fruit\b/i,
    message: '"Low-hanging fruit" is a cliché — use "easy wins", "quick improvements", or be specific.'
  },
  {
    pattern: /\bmove the needle\b/i,
    message: '"Move the needle" is a cliché — describe the specific impact or metric.'
  },
  {
    pattern: /\bdeep dive\b/i,
    message: '"Deep dive" is a cliché — use "detailed analysis", "thorough review", or "examine closely".'
  },
  {
    pattern: /\bdrill down\b/i,
    message: '"Drill down" is a cliché — use "examine in detail" or "look closer at".'
  },
  {
    pattern: /\bloop(?:ed|ing)? (?:you |them |us |him |her )?in\b/i,
    message: '"Loop in" is a cliché — use "include", "inform", or "add to the conversation".'
  },
  {
    pattern: /\btake (?:it|this|that) offline\b/i,
    message: '"Take it offline" is a cliché — use "discuss separately", "continue in private", or be specific.'
  },
  {
    pattern: /\bboil the ocean\b/i,
    message: '"Boil the ocean" is a cliché — use "take on too much", "overreach", or describe the scope problem specifically.'
  },

  // === Vague corporate filler ===
  {
    pattern: /\bbest practice(?:s)?\b/i,
    message: '"Best practice(s)" is vague — use "proven practice(s)", "effective approach", or be specific about what works.'
  },
  {
    pattern: /\bunique opportunity\b/i,
    message: '"Unique opportunity" is a cliché — explain what makes it unique and what the opportunity is.'
  },
  {
    pattern: /\binnovative\b/i,
    message: '"Innovative" is a buzzword — describe what makes it new or different specifically.'
  },

  // === Metaphorical clichés ===
  {
    pattern: /(?:^|(?<=\. ))at the end of the day\b/im,
    message: '"At the end of the day" is a cliché — use "ultimately" or state the point directly.'
  },
  {
    pattern: /\bthink outside the box\b/i,
    message: '"Think outside the box" is a cliché — describe the creative approach you mean.'
  },
  {
    pattern: /\bon the same page\b/i,
    message: '"On the same page" is a cliché — use "in agreement", "aligned", or be specific.'
  },
  {
    pattern: /\bpain point(?:s)?\b/i,
    message: '"Pain point(s)" is a cliché — describe the specific problem or frustration.'
  },
  {
    pattern: /\bvalue proposition\b/i,
    message: '"Value proposition" is a cliché — describe the actual benefit or value.'
  },
  {
    pattern: /(?:not|n't) a (?:\w+ )?bug[—–\-,;:]\s*it'?s (?:a |the |an )?(?:\w+ )?feature/i,
    message: '"Not a bug, it\'s a feature" is a cliché — say what you mean directly: "by design", "the whole point", or describe the actual advantage.'
  },
  {
    pattern: /\ba feature[,;:—–-]?\s*not (?:a )?bug\b/i,
    message: '"A feature, not a bug" is a cliché — say what you mean directly: "by design", "the whole point", or describe the actual advantage.'
  },

  // === General business clichés ===
  {
    pattern: /\bback to square one\b/i,
    message: '"Back to square one" is a cliché — use "restart", "start over", or describe what failed.'
  },
  {
    pattern: /\bback to the drawing board\b/i,
    message: '"Back to the drawing board" is a cliché — use "rethink", "redesign", or describe the pivot.'
  },
  {
    pattern: /\bbite the bullet\b/i,
    message: '"Bite the bullet" is a cliché — use "commit", "decide", or describe the difficult choice.'
  },
  {
    pattern: /\bcrystal clear\b/i,
    message: '"Crystal clear" is a cliché — use "clear", "obvious", or "unambiguous".'
  },
  {
    pattern: /\beasier said than done\b/i,
    message: '"Easier said than done" is a cliché — describe the specific difficulty.'
  },
  {
    pattern: /\bfor all intents and purposes\b/i,
    message: '"For all intents and purposes" is a cliché — use "effectively", "in practice", or cut entirely.'
  },
  {
    pattern: /\b(?:it )?goes without saying\b/i,
    message: '"Goes without saying" is a cliché — cut it and just say the thing.'
  },
  {
    pattern: /\bneedless to say\b/i,
    message: '"Needless to say" is a cliché — cut it and just say it.'
  },
  {
    pattern: /\bin a nutshell\b/i,
    message: '"In a nutshell" is a cliché — use "briefly", "in short", or just state it.'
  },
  {
    pattern: /\bin this day and age\b/i,
    message: '"In this day and age" is a cliché — use "today", "now", or be specific about the era.'
  },
  {
    pattern: /\blast but not least\b/i,
    message: '"Last but not least" is a cliché — just list the item; no fanfare needed.'
  },
  {
    pattern: /\bit is what it is\b/i,
    message: '"It is what it is" is meaningless filler — describe what "it" actually is.'
  },
  {
    pattern: /\bbottom line\b(?! up front)/i,
    message: '"Bottom line" is a cliché — use "the key point", "what matters", or state the point directly.'
  },

  // === Metaphorical clichés common in professional writing ===
  {
    pattern: /\btip of the iceberg\b/i,
    message: '"Tip of the iceberg" is a cliché — use "a small part of a larger problem" or describe the scope.'
  },
  {
    pattern: /\bperfect storm\b/i,
    message: '"Perfect storm" is a cliché — describe the specific confluence of factors.'
  },
  {
    pattern: /\buphill battle\b/i,
    message: '"Uphill battle" is a cliché — use "difficult effort" or describe the obstacles.'
  },
  {
    pattern: /\blight at the end of the tunnel\b/i,
    message: '"Light at the end of the tunnel" is a cliché — use "signs of progress" or describe what\'s improving.'
  },
  {
    pattern: /\breinvent(?:ing)? the wheel\b/i,
    message: '"Reinvent the wheel" is a cliché — use "duplicate existing work" or "rebuild what already exists".'
  },
  {
    pattern: /\b(?:open(?:ing|ed|s)? )?a can of worms\b/i,
    message: '"Can of worms" is a cliché — use "create complications" or describe the risks.'
  },
  {
    pattern: /\bpar for the course\b/i,
    message: '"Par for the course" is a cliché — use "expected", "typical", or "normal".'
  },
  {
    pattern: /\bcut to the chase\b/i,
    message: '"Cut to the chase" is a cliché — just get to the point instead of announcing it.'
  },
  {
    pattern: /\bwater under the bridge\b/i,
    message: '"Water under the bridge" is a cliché — use "past", "resolved", or "behind us".'
  },
  {
    pattern: /\bwhen push comes to shove\b/i,
    message: '"When push comes to shove" is a cliché — use "when it matters", "under pressure", or be specific.'
  },
  {
    pattern: /\bread between the lines\b/i,
    message: '"Read between the lines" is a cliché — use "infer", "interpret the subtext", or describe what\'s implicit.'
  },
  {
    pattern: /\bshed(?:s|ding)? (?:some |more )?light on\b/i,
    message: '"Shed some light on" is a cliché — use "clarify", "explain", or "illuminate".'
  },
  {
    pattern: /\belephant in the room\b/i,
    message: '"Elephant in the room" is a cliché — name the actual issue directly.'
  },
  {
    pattern: /\braise the bar\b/i,
    message: '"Raise the bar" is a cliché — use "increase standards" or describe the specific improvement.'
  },
  {
    pattern: /\bhit the ground running\b/i,
    message: '"Hit the ground running" is a cliché — use "start immediately", "begin productively", or describe the onboarding expectation.'
  },
  {
    pattern: /\bsilver lining\b/i,
    message: '"Silver lining" is a cliché — describe the actual benefit or upside.'
  },
  {
    pattern: /\bbreath of fresh air\b/i,
    message: '"Breath of fresh air" is a cliché — describe what\'s refreshing about it specifically.'
  },

  // === Tech/management clichés ===
  {
    pattern: /\bone[- ]size[- ]fits[- ]all\b/i,
    message: '"One size fits all" is a cliché — use "universal", "generic", or describe the limitation.'
  },
  {
    pattern: /\bcall(?:s|ing|ed)? the shots\b/i,
    message: '"Call the shots" is a cliché — use "make decisions", "direct", or be specific.'
  },
  {
    pattern: /\bphon(?:e[sd]?|ing) it in\b/i,
    message: '"Phone it in" is a cliché — use "do the minimum", "not invest effort", or describe the lack of engagement.'
  },
  {
    pattern: /\bgo(?:ing|es|ne)? the extra mile\b/i,
    message: '"Go the extra mile" is a cliché — describe the specific extra effort.'
  },
  {
    pattern: /\bfrom the ground up\b/i,
    message: '"From the ground up" is a cliché — use "from scratch", "entirely new", or describe what\'s new.'
  },
  {
    pattern: /\bon (?:the |my |our |your )?radar\b/i,
    message: '"On the radar" is a cliché — use "aware of", "tracking", or "monitoring".'
  },
  {
    pattern: /\bdrop(?:ped|ping|s)? the ball\b/i,
    message: '"Drop the ball" is a cliché — use "miss", "fail to follow through", or describe what was missed.'
  },
  {
    pattern: /\bget(?:ting)? the ball rolling\b/i,
    message: '"Get the ball rolling" is a cliché — use "start", "begin", or "initiate".'
  },
  {
    pattern: /\brun(?:ning)? it up the flagpole\b/i,
    message: '"Run it up the flagpole" is a cliché — use "propose", "share for feedback", or "test the idea".'
  },
  {
    pattern: /\bpush(?:ing|es|ed)? the envelope\b/i,
    message: '"Push the envelope" is a cliché — describe the specific boundary being tested.'
  },
  {
    pattern: /\bmov(?:e[sd]?|ing) the goalposts?\b/i,
    message: '"Move the goalposts" is a cliché — use "change requirements" or describe what changed.'
  },
  {
    pattern: /\bskin in the game\b/i,
    message: '"Skin in the game" is a cliché — use "personal stake", "accountability", or describe the incentive.'
  },
  {
    pattern: /\ball hands on deck\b/i,
    message: '"All hands on deck" is a cliché — use "everyone contributing", "full team effort", or describe who\'s needed.'
  },
  {
    pattern: /\brubber[- ]stamp(?:ed|ing|s)?\b/i,
    message: '"Rubber stamp" is a cliché — use "approve without review" or describe the lack of scrutiny.'
  },
  {
    pattern: /\btake (?:it |this |things )?to the next level\b/i,
    message: '"Take it to the next level" is a cliché — describe the specific improvement.'
  },
  // === AI-characteristic buzzwords ===
  {
    pattern: /\btapestry\b/i,
    message: '"Tapestry" is an AI-characteristic metaphor — describe the actual mix or variety.'
  },
  {
    pattern: /\btestament to\b/i,
    message: '"Testament to" is an AI cliché — use "shows", "proves", or state the evidence directly.'
  },
  {
    pattern: /\bmyriad\b/i,
    message: '"Myriad" is AI-characteristic — use "many" or give the actual number.'
  },
  {
    pattern: /\bplethora\b/i,
    message: '"Plethora" is AI-characteristic — use "many", "too many", or be specific.'
  },
  {
    pattern: /\bnorth star\b/i,
    message: '"North star" is a buzzword — use "guiding goal", "primary objective", or name it.'
  },
  {
    pattern: /\bsecret sauce\b/i,
    message: '"Secret sauce" is a cliché — describe the actual differentiator.'
  },
  {
    pattern: /\bfuture[- ]?proof\b/i,
    message: '"Future-proof" is a buzzword — describe how it adapts to specific changes.'
  },
  {
    pattern: /\bsupercharg(?:e[sd]?|ing)\b/i,
    message: '"Supercharge" is a buzzword — use "speed up", "improve", or describe the specific gain.'
  },
  {
    pattern: /\bunleash(?:e[sd]|ing)?\b/i,
    message: '"Unleash" is a buzzword — use "release", "enable", or describe the effect.'
  },
  {
    pattern: /\bunderscor(?:e[sd]?|ing)\b/i,
    message: '"Underscore" is AI-characteristic importance-inflation — use "shows", "emphasizes", or state the point directly.'
  },
  {
    pattern: /\bnavigate the complexit(?:y|ies)\b/i,
    message: '"Navigate the complexities" is an AI cliché — describe the specific difficulty.'
  },
  // === Common clichés ===
  {
    pattern: /\bdouble[- ]edged sword\b/i,
    message: '"Double-edged sword" is a cliché — name the specific upside and downside.'
  },
  {
    pattern: /\bwin[- ]win\b/i,
    message: '"Win-win" is a cliché — describe who gains what.'
  },
  {
    pattern: /\bno[- ]brainer\b/i,
    message: '"No-brainer" is a cliché — explain why the choice is obvious.'
  },
  {
    pattern: /\bneedle in a haystack\b/i,
    message: '"Needle in a haystack" is a cliché — use "hard to find" or describe the search problem.'
  },
  {
    pattern: /\bthe name of the game\b/i,
    message: '"The name of the game" is a cliché — state what actually matters.'
  },
  {
    pattern: /\bsay goodbye to\b/i,
    message: '"Say goodbye to" is marketing-speak — use "eliminate", "end", or describe what changes.'
  },
  {
    pattern: /\bdouble[- ]click(?:ing)?\b(?! (?:the|on the|a) (?:mouse|button|icon|link|file))/i,
    message: '"Double-click" (as a metaphor) is corporate-speak — use "examine closely", "dig into", or "go deeper on".'
  },
  {
    pattern: /\bmoving parts\b/i,
    message: '"Moving parts" is a cliché — describe the actual components or dependencies.'
  },

  // === Additional corporate buzzwords ===
  {
    pattern: /\bthought[- ]leader(?:ship|s)?\b/i,
    message: '"Thought leader(ship)" is a buzzword — describe the actual expertise, ideas, or influence.'
  },
  {
    pattern: /\bgame plan\b/i,
    message: '"Game plan" is a cliché — use "plan", "strategy", or "approach".'
  },
  {
    pattern: /\bmission[- ]critical\b/i,
    message: '"Mission-critical" is a buzzword — use "essential", "required", or describe what breaks without it.'
  },
  {
    pattern: /\bgold standard\b/i,
    message: '"Gold standard" is a cliché — name the actual benchmark or describe what makes it the reference.'
  },
  {
    pattern: /\bstate[- ]of[- ]the[- ]art\b/i,
    message: '"State-of-the-art" is a buzzword — describe what\'s actually advanced about it.'
  },
  {
    pattern: /\bbleeding[- ]edge\b/i,
    message: '"Bleeding-edge" is a buzzword — describe what\'s new or unproven about it specifically.'
  },
  {
    pattern: /\bturnkey\b/i,
    message: '"Turnkey" is a buzzword — use "ready to use", "fully set up", or describe what\'s included.'
  },
  {
    pattern: /\bmoonshot\b/i,
    message: '"Moonshot" is a buzzword — describe the ambitious goal and why it\'s a stretch.'
  },
  {
    pattern: /\blift and shift\b/i,
    message: '"Lift and shift" is jargon — use "migrate as-is", "move without changes", or be specific.'
  },
  {
    pattern: /\bblue[- ]sky(?:[- ]thinking)?\b/i,
    message: '"Blue-sky thinking" is a cliché — use "open-ended brainstorming" or describe the goal.'
  },
  {
    pattern: /\bdo(?:ing)? more with less\b/i,
    message: '"Do more with less" is a cliché — describe the actual constraint and trade-off.'
  },
  {
    pattern: /\btrim the fat\b/i,
    message: '"Trim the fat" is a cliché — use "cut what\'s unnecessary" or name what to remove.'
  },

  // === Additional metaphorical clichés ===
  {
    pattern: /\bsilver bullet\b/i,
    message: '"Silver bullet" is a cliché — use "simple fix", "single solution", or describe why none exists.'
  },
  {
    pattern: /\bmagic bullet\b/i,
    message: '"Magic bullet" is a cliché — use "simple fix" or describe why none exists.'
  },
  {
    pattern: /\bholy grail\b/i,
    message: '"Holy grail" is a cliché — describe the actual goal or ideal outcome.'
  },
  {
    pattern: /\bsecret weapon\b/i,
    message: '"Secret weapon" is a cliché — name the actual advantage.'
  },
  {
    pattern: /\bivory tower\b/i,
    message: '"Ivory tower" is a cliché — describe the actual disconnect from day-to-day work.'
  },
  {
    pattern: /\bin the weeds\b/i,
    message: '"In the weeds" is a cliché — use "lost in detail", "overwhelmed", or be specific.'
  },
  {
    pattern: /\bherding cats\b/i,
    message: '"Herding cats" is a cliché — describe the actual coordination difficulty.'
  },
  {
    pattern: /\bsea change\b/i,
    message: '"Sea change" is a cliché — use "major shift" or describe what changed.'
  },
  {
    pattern: /\bwear(?:s|ing)? many hats\b/i,
    message: '"Wear many hats" is a cliché — describe the actual range of responsibilities.'
  },
  {
    pattern: /\bbring(?:s|ing)? (?:\w+ )?to the table\b/i,
    message: '"Bring to the table" is a cliché — use "contribute", "offer", or name what they add.'
  },
  {
    pattern: /\bknee[- ]jerk\b/i,
    message: '"Knee-jerk" is a cliché — use "reflexive", "reactive", or "unconsidered".'
  },
  {
    pattern: /\blay of the land\b/i,
    message: '"Lay of the land" is a cliché — use "the current situation" or "how things work here".'
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
