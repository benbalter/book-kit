## business-nonfiction house style

These are the preset's conventions. `book-kit validate` and `just prose` enforce most of them; the rest are judgment calls for the writer and editor.

### TL;DRs and takeaways

- Every chapter opens with `::: {.tldr custom-style="tldr"}` right after its H2. It has one or two sentences that state the chapter's argument, not its topic.
- Section `*-key-takeaways.md` chapters collect the TL;DRs. After adding or editing a TL;DR, or changing `index.yml`, run `just key-takeaways`.

### Section openers

- A section's first file is an H1 with `{.section-opener}`, followed by a short `.lead` paragraph. It has no TL;DR.

### Role callouts

- Use `.for-managers` and `.for-ics` only where the advice genuinely differs by role, and give a chapter that has one the other as well.
- `.pro-tip` is for a concrete, actionable tip; `.common-objection` states a reader's pushback and answers it.

### Mechanics

- Acronyms: write them as `[API]{.smallcaps}`, and plurals as `[API]{.smallcaps}s`. Expand each one on first use, in book order.
- Dashes: em dashes (`—`) with no spaces for asides; en dashes (`–`) for number ranges.
- Quotes: periods and commas go inside quotation marks; colons and semicolons go outside. Use the serial comma.
- Footnotes get chapter-specific names (`[^style-guide]`, not `[^1]`), since chapters build into one document.

### Openings

- The first paragraph after the TL;DR shows the problem in action, states a provocative truth, asks the reader's question, or grounds the chapter in a specific experience.
- No throat-clearing ("In this chapter, we will explore…"), and no manufactured hypotheticals ("Picture this," "Imagine…," "Let's say…"). The hypothetical-hooks validator flags those.
- If the TL;DR already makes the point, skip the hook and start with the substance.

### Prose

- The kit's prose rules flag clichés, buzzwords, vague intensifiers, cultural idioms, assumptive phrasing ("simply," "of course"), and AI-sounding patterns. Read each finding in context: quoted bad examples and deliberate repetition aren't errors.
- Vary paragraph length and section shape. Bold-label bullet lists shouldn't stand in for an argument.
