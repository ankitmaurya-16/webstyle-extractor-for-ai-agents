import { describe, expect, it } from 'vitest';
import {
  compareSpecificity,
  specificity,
  splitSelectorList,
  stripStates,
} from '../../../src/collect/specificity.js';

describe('selector specificity', () => {
  it.each([
    ['a', [0, 0, 1]],
    ['.btn', [0, 1, 0]],
    ['#main', [1, 0, 0]],
    ['button.btn:hover', [0, 2, 1]],
    ['nav > ul li a', [0, 0, 4]],
    ['a[href^="http"]', [0, 1, 1]],
    ['[data-theme="dark"] .card', [0, 2, 0]],
    ['li::before', [0, 0, 2]],
    ['p:first-letter', [0, 0, 2]],
    ['*', [0, 0, 0]],
    ['.a.b.c', [0, 3, 0]],
    ['#a .b c', [1, 1, 1]],
    [':is(#a, .b) span', [1, 0, 1]],
    [':not(.x) a', [0, 1, 1]],
    [':where(#a, .b) span', [0, 0, 1]],
    ['a:has(> img)', [0, 0, 2]],
    ['input:nth-child(2n+1)', [0, 1, 1]],
  ])('AC-F12.2 %s has specificity %j', (selector, expected) => {
    expect(specificity(selector)).toEqual(expected);
  });

  it('AC-F12.2 compares ids, then classes, then types', () => {
    const sorted = ['#a', 'a', '.b .c', '.b', 'a b'].map((s) => [s, specificity(s)]);
    sorted.sort((x, y) => compareSpecificity(x[1], y[1]));
    expect(sorted.map(([s]) => s)).toEqual(['a', 'a b', '.b', '.b .c', '#a']);
    expect(compareSpecificity([0, 1, 0], [0, 1, 0])).toBe(0);
  });

  it('AC-F12.1 splits selector lists on top-level commas only', () => {
    expect(splitSelectorList('a:hover, .b:is(.c, .d), [data-x="1,2"]')).toEqual([
      'a:hover',
      '.b:is(.c, .d)',
      '[data-x="1,2"]',
    ]);
    expect(splitSelectorList('')).toEqual([]);
  });
});

describe('stripStates', () => {
  it('AC-F12.1 removes state pseudo-classes to get the base selector', () => {
    expect(stripStates('.btn:hover')).toEqual({ base: '.btn', states: ['hover'] });
    expect(stripStates('button.btn:focus-visible')).toEqual({
      base: 'button.btn',
      states: ['focus-visible'],
    });
    expect(stripStates('a:hover:focus')).toEqual({ base: 'a', states: ['hover', 'focus'] });
    expect(stripStates('.nav a:active')).toEqual({ base: '.nav a', states: ['active'] });
  });

  it('AC-F12.1 keeps a match-anything base when only a state is left', () => {
    expect(stripStates(':focus-visible')).toEqual({ base: '*', states: ['focus-visible'] });
  });

  it('AC-F12.1 drops :focus-within without counting it as a state', () => {
    expect(stripStates('.field:focus-within input')).toEqual({ base: '.field input', states: [] });
  });

  it('AC-F12.1 leaves selectors without states unchanged', () => {
    expect(stripStates('.card > h3')).toEqual({ base: '.card > h3', states: [] });
  });
});
