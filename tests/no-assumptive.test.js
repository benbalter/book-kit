import { describe, it, expect } from 'vitest';
import rule from '../rules/no-assumptive.js';

// Run the rule over one paragraph with a minimal textlint context.
function lint(text, options = {}) {
  const errors = [];
  const context = {
    Syntax: { Paragraph: 'Paragraph' },
    getSource: () => text,
    report: (_node, error) => errors.push(error),
    RuleError: class {
      constructor(message, opts = {}) {
        this.message = message;
        this.index = opts.index;
      }
    },
  };
  rule.linter(context, options).Paragraph({ type: 'Paragraph' });
  return errors;
}

describe('no-assumptive', () => {
  it.each([
    ['Simply preheat the oven.', 'Simply'],
    ['Of course, the bakers agreed.', 'Of course'],
    ['As you know, we water weekly.', 'As you know'],
    ["As you're probably aware, the frost came early.", 'As you know'],
    ['As we all know, bread takes time.', 'As everyone knows'],
    ["It's obvious that the plan works.", "It's obvious"],
    ['It is clear that we need more time.', "It's clear"],
    ['As is well known, compost helps.', 'As is well known'],
  ])('flags %j', (text, label) => {
    const errors = lint(text);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(label.split(' ')[0]);
  });

  it.each([
    'The simplest fix is more water.',
    'Course corrections happen every season.',
    'You know the drill: weigh the flour first.',
    'The obvious answer turned out to be wrong.',
    'Clear writing beats clever writing.',
  ])('allows %j', (text) => {
    expect(lint(text)).toEqual([]);
  });

  it('reports where the phrase starts', () => {
    const [error] = lint('Then, of course, we planted it.');
    expect(error.index).toBe('Then, '.length);
  });

  it('reports each kind of phrase once per paragraph', () => {
    expect(lint('Simply put, of course, it is simply done.')).toHaveLength(2);
  });

  it('skips patterns named in options.allow', () => {
    expect(lint('Simply stir it.', { allow: ['"Simply"'] })).toEqual([]);
    expect(lint('Of course, simply stir it.', { allow: ['"Simply"'] })).toHaveLength(1);
  });
});
