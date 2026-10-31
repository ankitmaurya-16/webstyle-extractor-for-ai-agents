import { describe, expect, it } from 'vitest';
import {
  HIGH,
  MEDIUM,
  evidence,
  levelOf,
  recipeConfidence,
  roleConfidence,
  tokenConfidence,
} from '../../../src/analyze/confidence.js';
import { analyzeFixture, analyzeRaw, rawSnapshot, stat } from '../helpers.js';

const FIXTURES = [
  'classic',
  'components',
  'layout',
  'motion',
  'typography',
  'gradients',
  'frameworks-tailwind',
  'icons-lucide',
];

/** Every token list of a DesignSystemV2. */
const tokenLists = (d) => ({
  colors: d.colors,
  gradients: d.gradients,
  families: d.typography.families,
  sizes: d.typography.sizes,
  letterSpacings: d.typography.letterSpacings,
  textStyles: d.typography.textStyles,
  spacing: d.spacing.tokens,
  containers: d.layout.containers,
  gridColumns: d.layout.gridColumns,
  gaps: d.layout.gaps,
  radii: d.radii,
  borderWidths: d.borderWidths,
  shadows: d.shadows,
  opacities: d.opacities,
  zIndex: d.zIndex,
  durations: d.motion.durations,
  easings: d.motion.easings,
  breakpoints: d.breakpoints,
});

const isConfidence = (c) =>
  c &&
  ['high', 'medium', 'low'].includes(c.level) &&
  c.score >= 0 &&
  c.score <= 1 &&
  c.level === levelOf(c.score) &&
  Array.isArray(c.reasons) &&
  c.reasons.length > 0;

describe('confidence (F28)', () => {
  it('AC-F28.1 every token, role, recipe and detection has a score, level and reasons', () => {
    for (const name of FIXTURES) {
      const d = analyzeFixture(name);
      for (const [list, tokens] of Object.entries(tokenLists(d))) {
        for (const t of tokens)
          expect(isConfidence(t.confidence), `${name} ${list} ${t.id}`).toBe(true);
      }
      for (const [role, ref] of Object.entries(d.semantic)) {
        for (const mode of Object.keys(ref)) {
          expect(isConfidence(d.roleConfidence[role]?.[mode]), `${name} ${role} ${mode}`).toBe(
            true,
          );
        }
      }
      for (const r of d.components)
        expect(isConfidence(r.confidence), `${name} ${r.id}`).toBe(true);
      for (const det of [...d.meta.framework, ...d.meta.icons]) {
        expect(det.confidence, `${name} ${det.id}`).toMatchObject({
          level: expect.any(String),
          score: expect.any(Number),
        });
        expect(det.confidence.level).toBe(levelOf(det.confidence.score));
      }
    }
    expect(analyzeFixture('frameworks-tailwind').meta.framework.length).toBeGreaterThan(0);
    expect(analyzeFixture('icons-lucide').meta.icons.length).toBeGreaterThan(0);
  });

  it('AC-F28.2 evidence is log10(count + 1) / 2, full at about 100 elements', () => {
    expect(evidence(0)).toBe(0);
    expect(evidence(9)).toBeCloseTo(0.5, 10);
    expect(evidence(99)).toBe(1);
    expect(evidence(5000)).toBe(1);
    expect(evidence(undefined)).toBe(0);
  });

  it('AC-F28.2 levels: high at 0.75, medium at 0.45, low below', () => {
    expect([HIGH, MEDIUM]).toEqual([0.75, 0.45]);
    expect(levelOf(0.75)).toBe('high');
    expect(levelOf(0.7499)).toBe('medium');
    expect(levelOf(0.45)).toBe('medium');
    expect(levelOf(0.4499)).toBe('low');
  });

  it('AC-F28.2 tokens score 0.7 * evidence + 0.3 * consistency, clamped', () => {
    expect(tokenConfidence({ count: 9, consistency: 1 })).toEqual({
      level: 'medium',
      score: 0.65,
      reasons: ['Used on 9 elements'],
    });
    expect(tokenConfidence({ count: 99, consistency: 0.5 })).toMatchObject({
      score: 0.85,
      level: 'high',
    });
    expect(tokenConfidence({ count: 99, consistency: 0.5 }).reasons).toContain(
      '50% of its cluster',
    );
    expect(tokenConfidence({ count: 1 }).reasons).toEqual(['Used on 1 element']);
    // Boosts never push past 1.
    expect(tokenConfidence({ count: 999, siteVariable: '--brand' }).score).toBe(1);
  });

  it('AC-F28.2 applies the penalties for truncation and unreadable or override-only sources', () => {
    const base = tokenConfidence({ count: 99 }).score;
    expect(base).toBe(1);
    expect(tokenConfidence({ count: 99, truncated: true }).score).toBe(0.9);
    expect(tokenConfidence({ count: 99, unreadable: true }).score).toBe(0.9);
    expect(tokenConfidence({ count: 99, overrideOnly: true }).score).toBe(0.8);
    expect(tokenConfidence({ count: 99, overImage: true }).score).toBe(0.7);
    expect(
      tokenConfidence({ count: 0, consistency: 0, overImage: true, truncated: true }).score,
    ).toBe(0);
    expect(tokenConfidence({ count: 99, truncated: true }).reasons).toContain(
      'The capture stopped at the element limit',
    );
  });

  it('AC-F28.2 roles score 0.5 * evidence + 0.5 * margin', () => {
    // margin = (10 - 4) / 10 = 0.6; evidence(9) = 0.5.
    expect(roleConfidence({ count: 9, winnerWeight: 10, runnerUpWeight: 4 })).toMatchObject({
      score: 0.55,
      level: 'medium',
    });
    // A close runner-up is named in the reasons.
    const close = roleConfidence({
      count: 99,
      winnerWeight: 10,
      runnerUpWeight: 8,
      runnerUpName: 'blue-500',
    });
    expect(close).toMatchObject({ score: 0.6 });
    expect(close.reasons).toContain('Close runner-up: blue-500');
    // No runner-up is a full margin.
    expect(roleConfidence({ count: 99, winnerWeight: 10, runnerUpWeight: 0 }).score).toBe(1);
    expect(
      roleConfidence({ count: 99, winnerWeight: 10, runnerUpWeight: 0, overrideOnly: true }).score,
    ).toBe(0.8);
    const truncated = roleConfidence({
      count: 99,
      winnerWeight: 10,
      runnerUpWeight: 0,
      truncated: true,
    });
    expect(truncated.score).toBe(0.9);
    expect(truncated.reasons).toContain('The capture stopped at the element limit');
  });

  it('AC-F28.2 recipes score on sample evidence, with forced states as an exact source', () => {
    expect(recipeConfidence({ count: 0, stateSource: 'none' }).score).toBe(0.4);
    expect(recipeConfidence({ count: 99, stateSource: 'none' }).score).toBe(1);
    const forced = recipeConfidence({ count: 9, stateSource: 'forced' });
    const sheet = recipeConfidence({ count: 9, stateSource: 'stylesheet' });
    expect(forced.score).toBeGreaterThan(sheet.score);
    expect(forced.reasons).toContain('States from forced capture');
  });

  it('AC-F28.3 a site-variable match raises a token and a role', () => {
    const tokenBoost = tokenConfidence({ count: 3, siteVariable: '--brand-primary' });
    expect(tokenBoost.score).toBeCloseTo(tokenConfidence({ count: 3 }).score + 0.3, 2);
    expect(tokenBoost.reasons).toContain('Named --brand-primary on the site');

    const colors = [
      stat('rgb(255, 255, 255)', 100000, ['background'], 10),
      stat('rgb(17, 24, 39)', 2000, ['text'], 20),
      stat('rgb(37, 99, 235)', 500, ['background', 'interactive'], 3),
    ];
    const plain = analyzeRaw(rawSnapshot({ colors }));
    const named = analyzeRaw(
      rawSnapshot({
        colors,
        variableDefs: [
          { name: '--brand-primary', value: '#2563eb', scope: 'root', selector: ':root' },
        ],
        variableUsage: { '--brand-primary': 3 },
      }),
    );
    const blue = (d) => d.colors.find((c) => c.hex === '#2563eb');
    expect(blue(named).siteVariable).toBe('--brand-primary');
    expect(blue(named).confidence.score).toBeGreaterThan(blue(plain).confidence.score);
    expect(named.roleConfidence.primary.light.score).toBeGreaterThan(
      plain.roleConfidence.primary.light.score,
    );
  });

  it('AC-F28.3 a color measured over a background image loses confidence', () => {
    const colors = (overImageShare) => [
      stat('rgb(255, 255, 255)', 100000, ['background'], 10),
      { ...stat('rgb(17, 24, 39)', 2000, ['text'], 20), overImageShare },
    ];
    const clear = analyzeRaw(rawSnapshot({ colors: colors(0) }));
    const overImage = analyzeRaw(rawSnapshot({ colors: colors(1) }));
    const text = (d) => d.colors.find((c) => c.hex === '#111827').confidence;
    expect(overImage.colors.find((c) => c.hex === '#111827').overImageShare).toBe(1);
    expect(text(overImage).score).toBeCloseTo(text(clear).score - 0.3, 2);
    expect(text(overImage).reasons).toContain('Measured over a background image');
  });
});
