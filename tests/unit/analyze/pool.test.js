import { describe, expect, it } from 'vitest';
import { poolRaws, upgradeRaw } from '../../../src/analyze/pool.js';
import { loadRaw, rawSnapshot, stat } from '../helpers.js';

const v1Raw = () =>
  rawSnapshot({
    colors: [
      stat('rgb(37, 99, 235)', 10, ['background']),
      stat('rgba(0, 0, 0, 0.1)', 5, ['border']),
    ],
    textStyles: [{ value: '16|24|400|Inter, sans-serif', weight: 120, count: 4, contexts: ['p'] }],
    samples: [{ kind: 'button', styles: {} }],
    cssVariables: { '--brand': '#2563eb' },
  });
const fonts = (family, weights, extra = {}) => ({
  family,
  weights,
  styles: ['normal'],
  provider: 'unknown',
  providerHost: null,
  loaded: false,
  ...extra,
});

describe('upgrading v1 raw snapshots (v2 spec 6.4 step 1)', () => {
  it('fills every new RawSnapshotV2 field with an empty value', () => {
    const raw = upgradeRaw(v1Raw());
    for (const field of [
      'letterSpacings',
      'borderWidths',
      'opacities',
      'durations',
      'gradients',
      'gaps',
    ]) {
      expect(raw[field], field).toEqual([]);
    }
    expect(raw.zIndices).toEqual([]);
    expect(raw.fontFaces).toEqual([]);
    expect(raw.stateSamples).toEqual([]);
    expect(raw.themeSignals).toMatchObject({
      darkMedia: false,
      darkSelectors: [],
      activeMode: 'light',
    });
    expect(raw.coverage).toEqual({
      frames: { read: 0, skipped: 0 },
      shadowRoots: 0,
      autoScrolled: false,
    });
  });

  it("sets each v1 color's effective and backdrop colors to its own value", () => {
    const [blue, border] = upgradeRaw(v1Raw()).colors;
    expect(blue).toMatchObject({
      effectiveHex: '#2563eb',
      backdropHex: '#2563eb',
      overImageShare: 0,
      maxWeight: 10,
    });
    expect(border).toMatchObject({ effectiveHex: '#000000', backdropHex: '#000000' });
  });

  it('keeps v2 colors as captured', () => {
    const raw = loadRaw('translucent');
    expect(upgradeRaw(raw).colors).toEqual(raw.colors);
  });

  it('converts v1 text-style value strings and variables', () => {
    const raw = upgradeRaw(v1Raw());
    expect(raw.textStyles).toEqual([
      {
        family: 'Inter, sans-serif',
        sizePx: 16,
        lineHeightPx: 24,
        fontWeight: 400,
        letterSpacingEm: 0,
        textTransform: 'none',
        tags: ['p'],
        count: 4,
        usage: 120,
      },
    ]);
    expect(raw.variableDefs).toEqual([
      { name: '--brand', value: '#2563eb', scope: 'root', selector: ':root' },
    ]);
    expect(raw.samples[0]).toMatchObject({ key: 'button:v1-0', hints: [], kind: 'button' });
  });

  it('is idempotent', () => {
    const once = upgradeRaw(v1Raw());
    expect(upgradeRaw(once)).toEqual(once);
  });
});

describe('pooling captures of several pages', () => {
  it('returns a single page unchanged apart from the upgrade', () => {
    const raw = loadRaw('classic');
    expect(poolRaws([raw])).toEqual(upgradeRaw(raw));
  });

  it('AC-F25.3 weights each page equally, whatever its size', () => {
    const big = rawSnapshot({ colors: [stat('rgb(255, 255, 255)', 9000, ['background'])] });
    const small = rawSnapshot({ colors: [stat('rgb(0, 0, 0)', 10, ['background'])] });
    const pooled = poolRaws([big, small]);
    const [white, black] = pooled.colors;
    expect(white.weight).toBeCloseTo(black.weight);
    expect(pooled.elementsSampled).toBe(200);
  });

  it('AC-F25.4 keeps the most-used value of a conflicting variable and records the conflict', () => {
    const page = (value, usage) =>
      rawSnapshot({
        variableDefs: [{ name: '--brand', value, scope: 'root', selector: ':root' }],
        variableUsage: { '--brand': usage },
      });
    const pooled = poolRaws([page('#2563eb', 5), page('#1d4ed8', 1)]);
    expect(pooled.variableDefs).toEqual([
      { name: '--brand', value: '#2563eb', scope: 'root', selector: ':root' },
    ]);
    expect(pooled.variableUsage).toEqual({ '--brand': 6 });
    expect(pooled.variableConflicts).toEqual([
      { name: '--brand', scope: 'root', kept: '#2563eb', others: ['#1d4ed8'] },
    ]);
  });

  it('unites theme signals, fonts, coverage and stylesheet counts', () => {
    const a = rawSnapshot({
      themeSignals: {
        darkMedia: true,
        darkSelectors: [],
        lightSelectors: [],
        activeMode: 'light',
        colorSchemeProperty: 'normal',
      },
      fontFaces: [fonts('Inter', [400])],
      coverage: { frames: { read: 1, skipped: 0 }, shadowRoots: 2, autoScrolled: false },
    });
    const b = rawSnapshot({
      themeSignals: {
        darkMedia: false,
        darkSelectors: ['.dark'],
        lightSelectors: [],
        activeMode: 'light',
        colorSchemeProperty: 'normal',
      },
      fontFaces: [
        fonts('Inter', [700], {
          provider: 'google-fonts',
          providerHost: 'fonts.gstatic.com',
          loaded: true,
        }),
      ],
      coverage: { frames: { read: 0, skipped: 1 }, shadowRoots: 0, autoScrolled: true },
      truncated: true,
    });
    const pooled = poolRaws([a, b]);
    expect(pooled.themeSignals).toMatchObject({ darkMedia: true, darkSelectors: ['.dark'] });
    expect(pooled.fontFaces).toEqual([
      fonts('Inter', [400, 700], {
        provider: 'google-fonts',
        providerHost: 'fonts.gstatic.com',
        loaded: true,
      }),
    ]);
    expect(pooled.coverage).toEqual({
      frames: { read: 1, skipped: 1 },
      shadowRoots: 2,
      autoScrolled: true,
    });
    expect(pooled.stylesheets).toEqual({ readable: 2, unreadable: 0 });
    expect(pooled.truncated).toBe(true);
  });
});
