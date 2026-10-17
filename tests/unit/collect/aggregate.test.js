import { describe, expect, it } from 'vitest';
import {
  StatMap,
  isTransparent,
  parseMediaBreakpoints,
  rgbLuminance,
} from '../../../src/collect/aggregate.js';

describe('collector helpers', () => {
  it('AC-F2.1 recognises fully transparent colors in every syntax', () => {
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true);
    expect(isTransparent('transparent')).toBe(true);
    expect(isTransparent('oklch(0.5 0.1 200 / 0)')).toBe(true);
    expect(isTransparent('rgba(0, 0, 0, 0.5)')).toBe(false);
    expect(isTransparent('rgb(10, 20, 30)')).toBe(false);
  });

  it('AC-F4.5 reads min-width, max-width and range media queries', () => {
    expect(parseMediaBreakpoints('(min-width: 768px)')).toEqual([768]);
    expect(parseMediaBreakpoints('(max-width: 767.98px)')).toEqual([768]);
    expect(parseMediaBreakpoints('(max-width: 639px)')).toEqual([640]);
    expect(parseMediaBreakpoints('(min-width: 40em)')).toEqual([640]);
    expect(parseMediaBreakpoints('(width >= 1024px)')).toEqual([1024]);
    expect(parseMediaBreakpoints('print')).toEqual([]);
  });

  it('aggregates values with weight and contexts, heaviest first', () => {
    const map = new StatMap();
    map.add('a', 1, ['text']);
    map.add('b', 5, ['background']);
    map.add('a', 2, ['interactive']);
    expect(map.toStats()).toEqual([
      { value: 'b', count: 1, weight: 5, contexts: ['background'] },
      { value: 'a', count: 2, weight: 3, contexts: ['interactive', 'text'] },
    ]);
  });

  it('keeps one entry per context set when asked', () => {
    const map = new StatMap();
    map.add('red', 1, ['text'], true);
    map.add('red', 1, ['text', 'interactive'], true);
    expect(map.toStats()).toHaveLength(2);
  });

  it('computes luminance for rgb strings only', () => {
    expect(rgbLuminance('rgb(255, 255, 255)')).toBeCloseTo(1);
    expect(rgbLuminance('rgb(0, 0, 0)')).toBe(0);
    expect(rgbLuminance('oklch(0.5 0 0)')).toBeNull();
  });
});
