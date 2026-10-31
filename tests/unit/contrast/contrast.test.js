import { describe, expect, it } from 'vitest';
import {
  contrastLevel,
  contrastRatio,
  contrastResults,
  isLargeText,
  nearestToken,
  nonTextChecks,
} from '../../../src/contrast/index.js';
import { analyzeFixture, analyzeRaw, loadRaw } from '../helpers.js';

const token = (hex, extra = {}) => ({
  id: `color:${hex.slice(0, 7)}`,
  hex,
  effectiveHex: hex.slice(0, 7),
  excluded: false,
  ...extra,
});
const sample = (effectiveText, effectiveBg, sizePx = 16, fontWeight = 400, count = 1) => ({
  effectiveText,
  effectiveBg,
  sizePx,
  fontWeight,
  count,
});

describe('contrast (F27)', () => {
  it('AC-F27.1 contrast samples use effective colors for translucent text and backgrounds', () => {
    const raw = loadRaw('translucent');
    // rgba(17, 24, 39, 0.6) text over white, and #111827 over rgba(37, 99, 235, 0.1) on white.
    expect(raw.contrastSamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectiveText: '#70747d', effectiveBg: '#ffffff' }),
        expect.objectContaining({ effectiveText: '#111827', effectiveBg: '#e9effd' }),
      ]),
    );
    const d = analyzeRaw(raw);
    const muted = d.colors.find((c) => c.hex === '#11182799');
    const pair = d.contrast.find((r) => r.textTokenId === muted.id);
    expect(pair).toMatchObject({
      backgroundTokenId: 'color:#ffffff',
      ratio: contrastRatio('#70747d', '#ffffff'),
    });
  });

  it('AC-F27.1 a translucent background is matched by its effective color', () => {
    const overlay = token('#2563eb80', { id: 'color:#2563eb@50', effectiveHex: '#92b1f5' });
    const text = token('#111827');
    const [result] = contrastResults({ light: [sample('#111827', '#92b1f5')] }, [overlay, text]);
    expect(result).toMatchObject({
      textTokenId: 'color:#111827',
      backgroundTokenId: 'color:#2563eb@50',
    });
    expect(result.ratio).toBe(contrastRatio('#111827', '#92b1f5'));
  });

  it('AC-F27.2 ratios follow the WCAG 2.x formula on known pairs', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    // Alpha in a hex is ignored: the inputs are already effective colors.
    expect(contrastRatio('#000000ff', '#ffffff80')).toBe(21);
  });

  it('AC-F27.3 large text is 24 px, or 18.66 px at weight 700', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(23.9, 400)).toBe(false);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 600)).toBe(false);
    expect(isLargeText(18.5, 800)).toBe(false);
  });

  it('AC-F27.3 levels follow the WCAG thresholds for normal and large text', () => {
    expect(contrastLevel(7, false)).toBe('AAA');
    expect(contrastLevel(6.99, false)).toBe('AA');
    expect(contrastLevel(4.5, false)).toBe('AA');
    expect(contrastLevel(4.49, false)).toBe('fail');
    expect(contrastLevel(4.5, true)).toBe('AAA');
    // Passes only because the text is large.
    expect(contrastLevel(3, true)).toBe('AA-large');
    expect(contrastLevel(4.49, true)).toBe('AA-large');
    expect(contrastLevel(2.99, true)).toBe('fail');
  });

  it('AC-F27.4 aggregates samples by token pair and theme with counts', () => {
    const tokens = [
      token('#ffffff', { mergedFrom: ['#fefefe'] }),
      token('#111827'),
      token('#6b7280'),
      token('#0f172a', { excluded: true }),
    ];
    const results = contrastResults(
      {
        light: [
          sample('#111827', '#ffffff', 16, 400, 5),
          // #fefefe sits within OKLab 0.02 of white and counts as the same pair.
          sample('#111827', '#fefefe', 16, 400, 3),
          sample('#6b7280', '#ffffff', 14, 400, 2),
          sample('#111827', '#ffffff', 32, 700, 1),
          // Matches no visible token: dropped.
          sample('#ff0000', '#ffffff', 16, 400, 9),
        ],
        dark: [sample('#ffffff', '#111827', 16, 400, 4)],
      },
      tokens,
    );
    expect(
      results.map((r) => [r.mode, r.textTokenId, r.backgroundTokenId, r.large, r.count, r.level]),
    ).toEqual([
      ['light', 'color:#111827', 'color:#ffffff', false, 8, 'AAA'],
      ['dark', 'color:#ffffff', 'color:#111827', false, 4, 'AAA'],
      ['light', 'color:#6b7280', 'color:#ffffff', false, 2, 'AA'],
      ['light', 'color:#111827', 'color:#ffffff', true, 1, 'AAA'],
    ]);
    // The ratio is the token pair's, whichever sample came first.
    expect(results[0].ratio).toBe(contrastRatio('#111827', '#ffffff'));
  });

  it('AC-F27.4 a pair resolving to one token is not a pair', () => {
    expect(contrastResults({ light: [sample('#ffffff', '#fefefe')] }, [token('#ffffff')])).toEqual(
      [],
    );
    expect(nearestToken('#123456', [token('#ffffff')])).toBeNull();
  });

  it('AC-F27.4 the analysis aggregates the classic fixture by token pair', () => {
    const d = analyzeFixture('classic');
    const keys = d.contrast.map(
      (r) => `${r.mode}|${r.textTokenId}|${r.backgroundTokenId}|${r.large}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    const body = d.contrast.find(
      (r) =>
        r.textTokenId === 'color:#111827' && r.backgroundTokenId === 'color:#ffffff' && !r.large,
    );
    expect(body).toMatchObject({ ratio: 17.74, level: 'AAA', mode: 'light' });
  });

  it('AC-F27.5 checks the focus ring and input borders at 3:1', () => {
    expect(
      nonTextChecks({
        focusRingHex: '#2563eb',
        backgroundHex: '#ffffff',
        inputBorderHex: '#d1d5db',
        inputBackgroundHex: '#ffffff',
      }),
    ).toEqual([
      { check: 'focus-ring', ratio: 5.17, pass: true },
      { check: 'input-border', ratio: 1.47, pass: false },
    ]);
    expect(nonTextChecks({ focusRingHex: '#949494', backgroundHex: '#ffffff' })).toEqual([
      { check: 'focus-ring', ratio: 3.03, pass: true },
    ]);
    expect(nonTextChecks({})).toEqual([]);
  });

  it('AC-F27.5 the analysis checks the classic fixture input border', () => {
    // classic.html draws inputs with a #d1d5db border on white.
    expect(analyzeFixture('classic').nonTextContrast).toContainEqual({
      check: 'input-border',
      ratio: 1.47,
      pass: false,
    });
  });
});
