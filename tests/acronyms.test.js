import { describe, it, expect } from 'vitest';

/**
 * `book-kit validate` and the no-bare-acronyms textlint rule share one acronym
 * list (lib/acronyms.js), extended by lint.acronyms. They used to keep
 * separate lists that had drifted apart.
 */

import { SMALLCAPS_ACRONYMS, smallcapsAcronyms } from '../lib/acronyms.js';
import { KNOWN_ACRONYMS } from '../commands/validate.js';
import rule from '../rules/no-bare-acronyms.js';

function lint(text) {
  const errors = [];
  const context = {
    Syntax: { Paragraph: 'Paragraph' },
    getSource: () => text,
    report: (_node, error) => errors.push(error.message),
    RuleError: class {
      constructor(message) {
        this.message = message;
      }
    },
    fixer: { replaceTextRange: () => ({}) },
  };
  rule.linter(context, {}).Paragraph({ type: 'Paragraph' });
  return errors.join('\n');
}

describe('shared acronym list', () => {
  it('validate uses the kit list plus lint.acronyms', () => {
    expect(KNOWN_ACRONYMS).toEqual([...SMALLCAPS_ACRONYMS, 'ZQX']);
  });

  it('tolerates a config without lint.acronyms', () => {
    expect(smallcapsAcronyms({ lint: {} })).toEqual(SMALLCAPS_ACRONYMS);
  });

  it('the textlint rule flags acronyms from the shared list', () => {
    expect(lint('Read the RFC before you merge.')).toContain('[RFC]{.smallcaps}');
  });

  it("the textlint rule flags the book's own lint.acronyms", () => {
    expect(lint('The ZQX garden opens on Fridays.')).toContain('[ZQX]{.smallcaps}');
  });

  it('escapes regex characters in acronyms', () => {
    expect(lint('Hold a Q&A after the talk.')).toContain('[Q&A]{.smallcaps}');
  });
});
