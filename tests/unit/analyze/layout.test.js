import { describe, expect, it } from 'vitest';
import {
  analyzeBorderWidths,
  analyzeContainers,
  analyzeGaps,
  analyzeGridColumns,
  analyzeOpacities,
  analyzeZIndex,
  detectBaseUnit,
  shadowBlur,
} from '../../../src/analyze/layout.js';
import { analyzeFixture, analyzeRaw, loadRaw, rawSnapshot, stat } from '../helpers.js';

const analyze = (raw) => analyzeRaw(raw);

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
    expect(d.meta.partial).toEqual(expect.arrayContaining(['breakpoints', 'cssVariables']));
    expect(d.breakpoints).toEqual([]);
  });
});

describe('layout structure (F16)', () => {
  it('AC-F16.1 collects centered containers weighted by area, in px', () => {
    const containers = loadRaw('layout').containers;
    const byPx = Object.fromEntries(containers.map((c) => [c.value, c]));
    // 48em on 16px text arrives as 768px; the 65ch article is a px value too.
    expect(Object.keys(byPx).sort()).toEqual([
      '1100px',
      '1200px',
      '360px',
      '400px',
      '656px',
      '768px',
      '960px',
    ]);
    // .wide is 1100 by 400 px.
    expect(byPx['1100px'].weight).toBe(440000);
    // .offset has unequal margins and is not a container.
    expect(byPx['700px']).toBeUndefined();
  });

  it('AC-F16.1 converts em and rem container values with the root font size', () => {
    const tokens = analyzeContainers(
      rawSnapshot({ rootFontSizePx: 16, containers: [stat('40rem', 100), stat('80em', 50)] }),
    );
    expect(tokens.map((t) => t.px)).toEqual([640, 1280]);
  });

  it('AC-F16.2 keeps 5 containers by area, named sm to 2xl ascending, plus prose', () => {
    const { containers } = analyzeFixture('layout').layout;
    expect(containers.map((c) => [c.name, c.px])).toEqual([
      ['container-sm', 400],
      ['container-md', 768],
      ['container-lg', 960],
      ['container-xl', 1100],
      ['container-2xl', 1200],
      ['prose', 656],
    ]);
  });

  it('AC-F16.2 adds no prose token without a paragraph column', () => {
    const tokens = analyzeContainers(
      rawSnapshot({ containers: [stat('1024px', 10, []), stat('640px', 5, [])] }),
    );
    expect(tokens.map((t) => t.name)).toEqual(['container-sm', 'container-md']);
  });

  it('AC-F16.3 counts grid tracks, ignoring line names, and equal-width flex rows', () => {
    const counts = Object.fromEntries(loadRaw('layout').gridColumns.map((g) => [g.value, g.count]));
    // repeat(12, 1fr); three tracks with line names; 1fr 1fr plus a flex row of two equal
    // children. The flex row of unequal children is not counted.
    expect(counts).toEqual({ 12: 1, 3: 1, 2: 2 });
    const { gridColumns } = analyzeFixture('layout').layout;
    expect(gridColumns.map((g) => [g.name, g.value, g.usageShare])).toEqual([
      ['grid-2', 2, 0.5],
      ['grid-12', 12, 0.25],
      ['grid-3', 3, 0.25],
    ]);
  });

  it('AC-F16.3 ignores invalid column counts', () => {
    const tokens = analyzeGridColumns(
      rawSnapshot({ gridColumns: [stat('0', 1), stat('x', 1), stat('4', 3, [], 3)] }),
    );
    expect(tokens.map((t) => t.value)).toEqual([4]);
  });

  it('AC-F16.4 collects row and column gaps; a gap equal to a spacing token references it', () => {
    const d = analyzeFixture('layout');
    const gaps = Object.fromEntries(d.layout.gaps.map((g) => [g.px, g]));
    expect(Object.keys(gaps).map(Number)).toEqual([8, 12, 16, 24, 32]);
    const space = Object.fromEntries(d.spacing.tokens.map((t) => [t.px, t]));
    expect(gaps[16]).toMatchObject({ spaceId: space[16].id, name: space[16].name });
    expect(gaps[8].spaceId).toBe(space[8].id);
    // 12 px, 24 px and 32 px are not spacing tokens on this page.
    expect(gaps[24]).toMatchObject({ spaceId: null, name: 'gap-24' });
    expect(gaps[32]).toMatchObject({ spaceId: null, name: 'gap-32' });
  });

  it('AC-F16.4 names fractional gaps without a dot', () => {
    const gaps = analyzeGaps(rawSnapshot({ gaps: [stat('10.5px', 1)] }), []);
    expect(gaps[0]).toMatchObject({ name: 'gap-10-5', px: 10.5, spaceId: null });
  });
});

describe('layout values (F17)', () => {
  it('AC-F17.1 collects z-index from positioned elements with layer hints', () => {
    const hints = Object.fromEntries(loadRaw('layout').zIndices.map((z) => [z.value, z.hints]));
    expect(hints).toEqual({
      1: [],
      2: [],
      10: [],
      40: ['menu'],
      50: ['sticky-header'],
      60: ['toast'],
      70: ['tooltip'],
      90: ['overlay'],
      100: ['dialog'],
    });
  });

  it('AC-F17.2 names layers after their dominant hint and keeps at most 8', () => {
    const { zIndex } = analyzeFixture('layout');
    // Nine values used once each: the anonymous z-10 gives way to the six layers.
    expect(zIndex).toHaveLength(8);
    expect(zIndex.map((z) => [z.name, z.value])).toEqual([
      ['z-1', 1],
      ['z-2', 2],
      ['z-menu', 40],
      ['z-header', 50],
      ['z-toast', 60],
      ['z-tooltip', 70],
      ['z-overlay', 90],
      ['z-dialog', 100],
    ]);
    expect(zIndex.find((z) => z.value === 100).layer).toBe('dialog');
  });

  it('AC-F17.2 uses z-<value> when no hint dominates and never repeats a layer name', () => {
    const tokens = analyzeZIndex(
      rawSnapshot({
        zIndices: [
          { value: 10, count: 4, hints: ['menu'] },
          { value: 10, count: 6, hints: [] },
          { value: 50, count: 2, hints: ['dialog'] },
          { value: 60, count: 1, hints: ['dialog'] },
        ],
      }),
    );
    expect(tokens.map((t) => [t.name, t.layer])).toEqual([
      ['z-10', null],
      ['z-dialog', 'dialog'],
      ['z-60', null],
    ]);
  });

  it('AC-F17.3 rounds opacity to 0.05, names opacity-<percent> and finds disabled opacity', () => {
    const { opacities } = analyzeFixture('layout');
    expect(opacities.map((o) => [o.name, o.value])).toEqual([
      // 0.33 rounds to 0.35.
      ['opacity-35', 0.35],
      ['opacity-disabled', 0.4],
      ['opacity-50', 0.5],
      ['opacity-75', 0.75],
    ]);
  });

  it('AC-F17.3 ignores opacity 0 and 1', () => {
    const tokens = analyzeOpacities(
      rawSnapshot({ opacities: [stat('0', 5), stat('1', 5), stat('0.98', 5), stat('0.6', 5)] }),
    );
    expect(tokens.map((t) => t.value)).toEqual([0.6]);
  });

  it('AC-F17.4 names border widths border-<px> and notes the dominant style', () => {
    const d = analyzeFixture('layout');
    expect(d.borderWidths.map((b) => [b.name, b.px])).toEqual([
      ['border-1', 1],
      ['border-2', 2],
      ['border-4', 4],
    ]);
    expect(d.meta.borderStyle).toBe('solid');
    const dashed = analyzeBorderWidths(
      rawSnapshot({
        borderWidths: [stat('0.5px', 3)],
        borderStyles: [stat('dashed', 3, [], 3), stat('solid', 1, [], 1)],
      }),
    );
    expect(dashed).toEqual({
      tokens: [expect.objectContaining({ name: 'border-0-5', px: 0.5 })],
      style: 'dashed',
    });
  });
});
