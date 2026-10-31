import { describe, expect, it } from 'vitest';
import { buildAudit } from '../../../src/audit/index.js';
import { analyzeFixture, analyzeRaw, rawSnapshot, stat } from '../helpers.js';

const AUDIT_KEYS = [
  'colorsBeforeMerge',
  'colorsAfterMerge',
  'nearDuplicateGroups',
  'offScaleSpacing',
  'distinct',
  'contrastFailures',
  'contrastFailureList',
  'missingFocusStyle',
  'variableConflicts',
  'lowConfidence',
];

const input = (overrides = {}) => ({
  colorsBeforeMerge: 3,
  colors: [
    { hex: '#ffffff', mergedFrom: ['#fefefe', '#fdfdfd'] },
    { hex: '#111827', mergedFrom: [] },
  ],
  spacing: { baseUnitPx: 4, offScale: [{ px: 6, usageShare: 0.05 }] },
  distinct: { fontSizes: 5, radii: 2, shadows: 1, zIndices: 0, durations: 3 },
  contrast: [
    { textTokenId: 'a', backgroundTokenId: 'b', level: 'AA' },
    { textTokenId: 'c', backgroundTokenId: 'b', level: 'fail' },
  ],
  focusRing: { source: 'stylesheet' },
  variableConflicts: [],
  lowConfidence: ['radius:4'],
  ...overrides,
});

describe('consistency report (F29)', () => {
  it('AC-F29.1 contains every item of the report', () => {
    const report = buildAudit(input());
    expect(Object.keys(report).sort()).toEqual([...AUDIT_KEYS].sort());
    expect(report).toMatchObject({
      colorsBeforeMerge: 3,
      colorsAfterMerge: 2,
      distinct: { fontSizes: 5, radii: 2, shadows: 1, zIndices: 0, durations: 3 },
      contrastFailures: 1,
      missingFocusStyle: false,
      variableConflicts: [],
      lowConfidence: ['radius:4'],
    });
  });

  it('AC-F29.1 reports a missing focus style and variable conflicts', () => {
    const conflicts = [{ name: '--brand', values: ['#2563eb', '#1d4ed8'] }];
    const report = buildAudit(
      input({ focusRing: { source: 'browser-default' }, variableConflicts: conflicts }),
    );
    expect(report.missingFocusStyle).toBe(true);
    expect(report.variableConflicts).toEqual(conflicts);
    expect(buildAudit(input({ variableConflicts: undefined })).variableConflicts).toEqual([]);
  });

  it('AC-F29.1 the analysis fills every item from the fixtures', () => {
    const layout = analyzeFixture('layout').audit;
    expect(Object.keys(layout).sort()).toEqual([...AUDIT_KEYS].sort());
    // layout.html sets nine z-index values; motion.html eight durations.
    expect(layout.distinct.zIndices).toBe(9);
    expect(analyzeFixture('motion').audit.distinct.durations).toBe(8);
    const classic = analyzeFixture('classic');
    expect(classic.audit.colorsAfterMerge).toBe(classic.colors.length);
    expect(classic.audit.colorsBeforeMerge).toBeGreaterThanOrEqual(classic.audit.colorsAfterMerge);
    expect(classic.audit.distinct.radii).toBeGreaterThan(0);
    // classic.html sets no focus style.
    expect(classic.audit.missingFocusStyle).toBe(classic.focusRing.source === 'browser-default');
    // Every low-confidence id names a real token with a low score.
    const ids = new Map(
      [
        ...classic.colors,
        ...classic.typography.families,
        ...classic.typography.sizes,
        ...classic.typography.textStyles,
        ...classic.radii,
        ...classic.shadows,
        ...classic.breakpoints,
        ...classic.layout.containers,
        ...classic.spacing.tokens,
      ].map((t) => [t.id, t]),
    );
    for (const id of classic.audit.lowConfidence) {
      if (ids.has(id)) expect(ids.get(id).confidence.level, id).toBe('low');
    }
  });

  it('AC-F29.2 near-duplicate groups list the kept and merged values', () => {
    expect(buildAudit(input()).nearDuplicateGroups).toEqual([
      { kept: '#ffffff', merged: ['#fefefe', '#fdfdfd'] },
    ]);
    const d = analyzeRaw(
      rawSnapshot({
        colors: [
          stat('rgb(255, 255, 255)', 100000, ['background'], 10),
          stat('rgb(254, 254, 254)', 10000, ['background'], 2),
          stat('rgb(17, 24, 39)', 2000, ['text'], 20),
        ],
      }),
    );
    expect(d.audit.nearDuplicateGroups).toEqual([{ kept: '#ffffff', merged: ['#fefefe'] }]);
    expect(d.audit).toMatchObject({ colorsBeforeMerge: 3, colorsAfterMerge: 2 });
  });

  it('AC-F29.3 lists off-scale spacing with its usage share', () => {
    const d = analyzeFixture('layout');
    expect(d.spacing.baseUnitPx).toBe(4);
    // layout.html spacing includes 1 px and 6 px, neither on the 4 px scale.
    expect(d.audit.offScaleSpacing.map((s) => s.px).sort((a, b) => a - b)).toEqual([1, 6]);
    for (const s of d.audit.offScaleSpacing) expect(s.usageShare).toBeGreaterThan(0);
  });

  it('AC-F29.3 omits off-scale spacing when there is no base unit', () => {
    expect(
      buildAudit(input({ spacing: { baseUnitPx: null, offScale: [] } })).offScaleSpacing,
    ).toBeNull();
    const d = analyzeRaw(
      rawSnapshot({
        spacing: [stat('5px', 10, [], 10), stat('7px', 10, [], 10), stat('13px', 10, [], 10)],
      }),
    );
    expect(d.spacing.baseUnitPx).toBeNull();
    expect(d.audit.offScaleSpacing).toBeNull();
  });

  it('AC-F29.4 computes no overall score', () => {
    const report = analyzeFixture('classic').audit;
    const keys = JSON.stringify(report).match(/"[a-zA-Z]+":/g) ?? [];
    expect(keys.filter((k) => /score|grade|rating|overall/i.test(k))).toEqual([]);
  });

  it('AC-F27.8 the consistency report counts contrast failures', () => {
    const report = buildAudit(input());
    expect(report.contrastFailures).toBe(1);
    expect(report.contrastFailureList).toEqual([
      { textTokenId: 'c', backgroundTokenId: 'b', level: 'fail' },
    ]);
    // #9ca3af on white is about 2.5:1 and fails for normal text.
    const d = analyzeRaw(
      rawSnapshot({
        colors: [
          stat('rgb(255, 255, 255)', 100000, ['background'], 10),
          stat('rgb(17, 24, 39)', 3000, ['text'], 20),
          stat('rgb(156, 163, 175)', 1000, ['text'], 5),
        ],
        contrastSamples: [
          {
            effectiveText: '#111827',
            effectiveBg: '#ffffff',
            sizePx: 16,
            fontWeight: 400,
            count: 20,
          },
          {
            effectiveText: '#9ca3af',
            effectiveBg: '#ffffff',
            sizePx: 16,
            fontWeight: 400,
            count: 5,
          },
        ],
      }),
    );
    expect(d.contrast.filter((c) => c.level === 'fail')).toHaveLength(1);
    expect(d.audit.contrastFailures).toBe(1);
  });
});
