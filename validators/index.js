// The kit's built-in validators, in run order. Each module's default export
// has the same shape as a book's plugin: { name, tags, defaults, run(ctx) },
// where run returns { errors, warnings }. `tags` is ['structure'] for the
// neutral checks the kit defaults leave on, or ['style'] for the house-style
// checks defaults/book.config.yml turns off.
//
// Order matters: it's the order findings print in. `chapter` runs first.

import chapter from './chapter.js';
import sectionIntros from './section-intros.js';
import sectionIntroNoTldr from './section-intro-no-tldr.js';
import sectionIntroHasLead from './section-intro-has-lead.js';
import sectionIntroFinalLead from './section-intro-final-lead.js';
import noTransitionTodos from './no-transition-todos.js';
import noTodoMarkers from './no-todo-markers.js';
import noBareUrlLinkText from './no-bare-url-link-text.js';
import minOpenerLength from './min-opener-length.js';
import chapterLengths from './chapter-lengths.js';
import crossReferences from './cross-references.js';
import indexIntegrity from './index-integrity.js';
import smallcaps from './smallcaps.js';
import escapedSmallcaps from './escaped-smallcaps.js';
import calloutBalance from './callout-balance.js';
import tldrLength from './tldr-length.js';
import duplicateHeadings from './duplicate-headings.js';
import acronymExpansion from './acronym-expansion.js';
import emDashes from './em-dashes.js';
import numberRangeDashes from './number-range-dashes.js';
import quotePunctuation from './quote-punctuation.js';
import doubledWords from './doubled-words.js';
import calloutDivs from './callout-divs.js';
import calloutLabels from './callout-labels.js';
import footnotes from './footnotes.js';
import headingHierarchy from './heading-hierarchy.js';
import sentenceStarters from './sentence-starters.js';
import listPunctuation from './list-punctuation.js';
import boldKeywords from './bold-keywords.js';
import hypotheticalHooks from './hypothetical-hooks.js';
import paragraphLength from './paragraph-length.js';

export const BUILTIN_VALIDATORS = [
  chapter,
  sectionIntros,
  sectionIntroNoTldr,
  sectionIntroHasLead,
  sectionIntroFinalLead,
  noTransitionTodos,
  noTodoMarkers,
  noBareUrlLinkText,
  minOpenerLength,
  chapterLengths,
  crossReferences,
  indexIntegrity,
  smallcaps,
  escapedSmallcaps,
  calloutBalance,
  tldrLength,
  duplicateHeadings,
  acronymExpansion,
  emDashes,
  numberRangeDashes,
  quotePunctuation,
  doubledWords,
  calloutDivs,
  calloutLabels,
  footnotes,
  headingHierarchy,
  sentenceStarters,
  listPunctuation,
  boldKeywords,
  hypotheticalHooks,
  paragraphLength,
];
