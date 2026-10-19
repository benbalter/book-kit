import { auditChapterLengths, MAX_WORDS, MIN_WORDS } from '../commands/audit-chapter-lengths.js';

// Flags content chapters outside a recommended word count range. The audit
// itself lives in commands/audit-chapter-lengths.js, which also runs on its
// own (`book-kit audit-chapter-lengths`) with the same defaults.
export default {
  name: 'chapter-lengths',
  tags: ['style'],
  defaults: {
    min_words: MIN_WORDS,
    max_words: MAX_WORDS,
  },
  run: (ctx) => ({ errors: [], warnings: auditChapterLengths(undefined, ctx.options).warnings }),
};
