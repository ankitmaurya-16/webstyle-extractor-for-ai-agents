import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { detectBaseUnit, shadowBlur } from '../../../src/analyze/layout.js';
import { rawSnapshot, stat } from '../helpers.js';

const spacing = (pairs) => pairs.map(([v, n]) => stat(`${v}px`, n, [], n));

describe('layout tokens', () => {
  it('AC-F4.1 picks 4 when odd multiples of 4 are used, ties go to 4', () => {
    expect(
      detectBaseUnit(
        new Map([
          [4, 10],
          [8, 10],
          [12, 10],
          [16, 10],
        ]),
      ),
    ).toBe(4);
    expect(
      detectBaseUnit(
        new Map([
          [8, 10],
          [16, 10],
          [24, 10],
        ]),
      ),
    ).toBe(8);
  });

  it('AC-F4.1 has no base when neither unit covers 60% of the weight', () => {
    expect(
      detectBaseUnit(
        new Map([
          [5, 10],
          [7, 10],
          [13, 10],
          [8, 5],
        ]),
      ),
    ).toBeNull();
    const d = analyze(
      rawSnapshot({
        spacing: spacing([
          [5, 10],
          [7, 10],
          [13, 10],
        ]),
      }),
    );
    expect(d.spacing.baseUnitPx).toBeNull();
    expect(d.spacing.tokens.map((t) => t.name)).toEqual(['space-5px', 'space-7px', 'space-13px']);
  });

  it('AC-F4.2 names space-n by base multiple and snaps values within 1 px', () => {
    const d = analyze(
      rawSnapshot({
        spacing: spacing([
          [4, 10],
          [8, 20],
          [15, 5],
          [16, 20],
          [12, 10],
        ]),
      }),
    );
    expect(d.spacing.baseUnitPx).toBe(4);
    expect(d.spacing.tokens.map((t) => [t.name, t.px])).toEqual([
      ['space-1', 4],
      ['space-2', 8],
      ['space-3', 12],
      ['space-4', 16],
    ]);
  });

  it('AC-F4.3 deduplicates radii, names them in ascending order and finds radius-full', () => {
    const d = analyze(
      rawSnapshot({
        radii: [
          stat('8px', 5, [], 5),
          stat('4px', 5, [], 5),
          stat('8px', 1, [], 1),
          stat('9999px', 3, [], 3),
          stat('50%', 2, [], 2),
          stat('12px', 2, [], 2),
        ],
      }),
    );
    expect(d.radii.map((r) => [r.name, r.px])).toEqual([
      ['radius-sm', 4],
      ['radius-md', 8],
      ['radius-lg', 12],
      ['radius-full', 9999],
    ]);
  });

  it('AC-F4.4 keeps up to 6 shadows by usage, named by blur radius', () => {
    const shadows = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      stat(`rgba(0, 0, 0, 0.1) 0px ${n}px ${n * 2}px 0px`, 10 - n, [], 10 - n),
    );
    const d = analyze(rawSnapshot({ shadows }));
    expect(d.shadows).toHaveLength(6);
    expect(d.shadows.map((s) => s.name)).toEqual([
      'shadow-xs',
      'shadow-sm',
      'shadow-md',
      'shadow-lg',
      'shadow-xl',
      'shadow-2xl',
    ]);
    expect(d.shadows.map((s) => s.blurPx)).toEqual([2, 4, 6, 8, 10, 12]);
    const few = analyze(rawSnapshot({ shadows: shadows.slice(0, 2) })).shadows;
    expect(few.map((s) => s.name)).toEqual(['shadow-sm', 'shadow-md']);
  });

  it('measures blur across shadow layers', () => {
    expect(
      shadowBlur('rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px'),
    ).toBe(15);
    expect(shadowBlur('rgb(0 0 0 / 0.1) 0px 1px 2px 0px')).toBe(2);
  });

  it('AC-F4.5 names breakpoints sm to 2xl in ascending order', () => {
    const d = analyze(rawSnapshot({ breakpoints: [768, 1024, 640, 1280, 1536, 1920] }));
    expect(d.breakpoints.map((b) => [b.name, b.px])).toEqual([
      ['sm', 640],
      ['md', 768],
      ['lg', 1024],
      ['xl', 1280],
      ['2xl', 1536],
    ]);
  });

  it('AC-F4.6 marks breakpoints partial when no stylesheet is readable', () => {
    const d = analyze(rawSnapshot({ stylesheets: { readable: 0, unreadable: 2 } }));
    expect(d.meta.partial).toEqual(['breakpoints', 'cssVariables']);
    expect(d.breakpoints).toEqual([]);
  });
});
