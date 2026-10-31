import { describe, expect, it } from 'vitest';
import {
  ALPHA_STEP,
  alphaBucket,
  colorLookup,
  familyOf,
  normalizeColor,
  oklchOf,
  stepOf,
} from '../../../src/analyze/colors.js';
import { DARK_CANVAS, LIGHT_CANVAS, composite, toHex } from '../../../src/collect/color.js';
import { exportFile } from '../../../src/export/index.js';
import { analyzeFixture, analyzeRaw, loadRaw, rawSnapshot, stat } from '../helpers.js';

const designOf = (colors, extra = {}) => analyzeRaw(rawSnapshot({ colors, ...extra }));
const colorsOf = (colors, extra) => designOf(colors, extra).colors;
const byHex = (tokens, hex) => tokens.find((t) => t.hex === hex);
const holder = (d, role, mode = 'light') => d.colors.find((c) => c.id === d.semantic[role]?.[mode]);
/** A translucent ColorStat as the collector records it, with its blended color and backdrop. */
const tstat = (value, weight, contexts, effectiveHex, backdropHex = '#ffffff', extra = {}) => ({
  ...stat(value, weight, contexts, extra.count ?? 2),
  effectiveHex,
  backdropHex,
  overImageShare: 0,
  ...extra,
});
const page = [stat('rgb(255, 255, 255)', 100000, ['background'], 3)];
const blend = (fg, bg) => toHex(composite(fg, bg));

describe('opaque colors (v1 rules on the v2 engine)', () => {
  it('AC-F2.1 ignores fully transparent colors and keeps partial alpha as 8-digit hex', () => {
    expect(normalizeColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(normalizeColor('transparent')).toBeNull();
    expect(normalizeColor('not-a-color')).toBeNull();
    expect(normalizeColor('rgba(0, 0, 0, 0.5)')).toEqual({ hex: '#00000080', alpha: 0.5 });
    expect(normalizeColor('rgb(37, 99, 235)')).toEqual({ hex: '#2563eb', alpha: 1 });
    expect(normalizeColor('oklch(0.6 0.2 25)')?.hex).toMatch(/^#[0-9a-f]{6}$/);
    const tokens = colorsOf([...page, stat('rgba(0, 0, 0, 0.5)', 50000, ['background'])]);
    expect(tokens.map((t) => t.hex)).toContain('#00000080');
  });

  it('AC-F2.2 merges colors closer than OKLab 0.02; the most-used wins', () => {
    const tokens = colorsOf([
      stat('rgb(5, 150, 105)', 10, ['background']),
      stat('rgb(5, 150, 104)', 3, ['background']),
      stat('rgb(255, 255, 255)', 50, ['background']),
    ]);
    expect(byHex(tokens, '#059669').mergedFrom).toEqual(['#059668']);
    expect(byHex(tokens, '#059668')).toBeUndefined();
  });

  it('AC-F2.2 keeps colors further apart than 0.02 separate', () => {
    const tokens = colorsOf([
      stat('rgb(37, 99, 235)', 10, ['background']),
      stat('rgb(29, 78, 216)', 10, ['background']),
    ]);
    expect(tokens).toHaveLength(2);
  });

  it('AC-F2.3 assigns hue family and step by OKLCH, white and black by name', () => {
    const family = (hex) => familyOf({ oklch: oklchOf(hex) });
    expect(family('#ffffff')).toBe('white');
    expect(family('#000000')).toBe('black');
    expect(family('#6b7280')).toBe('gray');
    expect(family('#111827')).toBe('gray');
    expect(family('#2563eb')).toBe('blue');
    expect(family('#dc2626')).toBe('red');
    expect(family('#16a34a')).toBe('green');
    expect(family('#dcfce7')).toBe('green');
    expect(family('#7c3aed')).toBe('purple');
    expect([0.95, 0.9, 0.8, 0.72, 0.65, 0.58, 0.5, 0.4, 0.2].map(stepOf)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900,
    ]);
    const tokens = colorsOf([
      stat('rgb(255,255,255)', 10, ['background']),
      stat('rgb(37, 99, 235)', 10, ['background']),
    ]);
    expect(tokens.map((t) => t.name)).toEqual(['white', 'blue-600']);
  });

  it('AC-F2.4 moves the less-used color of a step collision in its lightness direction', () => {
    const tokens = colorsOf([
      stat('rgb(10, 10, 10)', 100, ['text']),
      stat('rgb(40, 40, 40)', 20, ['text']),
      stat('rgb(255, 255, 255)', 100, ['background']),
    ]);
    expect(byHex(tokens, '#0a0a0a').name).toBe('gray-900');
    expect(byHex(tokens, '#282828').name).toBe('gray-800');
  });

  it('AC-F2.4 names a color extra when no free step exists in its direction', () => {
    const tokens = colorsOf([
      stat('rgb(40, 40, 40)', 100, ['text']),
      stat('rgb(10, 10, 10)', 50, ['text']),
      stat('rgb(255, 255, 255)', 100, ['background']),
    ]);
    expect(byHex(tokens, '#282828').name).toBe('gray-900');
    expect(byHex(tokens, '#0a0a0a').name).toBe('gray-extra-1');
    expect(byHex(tokens, '#0a0a0a').step).toBeNull();
  });

  it('AC-F2.5 generates no shades: only extracted values sit on steps', () => {
    expect(colorsOf([stat('rgb(37, 99, 235)', 10, ['background'])])).toHaveLength(1);
  });

  it('AC-F2.6 assigns background, surface, text, text-muted and border by usage', () => {
    const d = designOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(249, 250, 251)', 200, ['background']),
      stat('rgb(17, 24, 39)', 500, ['text']),
      stat('rgb(107, 114, 128)', 100, ['text']),
      stat('rgb(229, 231, 235)', 50, ['border']),
    ]);
    expect(d.semantic).toMatchObject({
      background: { light: 'color:#ffffff' },
      text: { light: 'color:#111827' },
      'text-muted': { light: 'color:#6b7280' },
      border: { light: 'color:#e5e7eb' },
    });
  });

  it('AC-F2.6 skips surface when it is under 5% of the background weight', () => {
    const d = designOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(200, 200, 200)', 10, ['background']),
    ]);
    expect(d.semantic.surface).toBeUndefined();
  });

  it('AC-F2.6 detects accent, success, warning and danger only when present', () => {
    const d = designOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(37, 99, 235)', 100, ['background', 'interactive'], 5),
      stat('rgb(219, 39, 119)', 50, ['background', 'interactive'], 3),
      stat('rgb(22, 163, 74)', 40, ['text'], 2),
      stat('rgb(234, 179, 8)', 40, ['text'], 2),
      stat('rgb(220, 38, 38)', 40, ['text'], 2),
    ]);
    expect(holder(d, 'primary').hex).toBe('#2563eb');
    expect(holder(d, 'accent').hex).toBe('#db2777');
    expect(holder(d, 'success').hex).toBe('#16a34a');
    expect(holder(d, 'warning').hex).toBe('#eab308');
    expect(holder(d, 'danger').hex).toBe('#dc2626');
    expect(
      Object.keys(designOf([stat('rgb(255, 255, 255)', 1000, ['background'])]).semantic),
    ).toEqual(['background']);
  });

  it('AC-F2.7 picks primary from interactive colors with chroma of at least 0.08', () => {
    const base = [
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(55, 65, 81)', 100, ['background', 'interactive'], 9),
    ];
    const d = designOf([...base, stat('rgb(37, 99, 235)', 10, ['background', 'interactive'], 2)]);
    expect(holder(d, 'primary').hex).toBe('#2563eb');
    expect(designOf(base).semantic.primary).toBeUndefined();
  });

  it('AC-F2.8 drops colors under 0.5% unless they hold a role', () => {
    const d = designOf([
      stat('rgb(255, 255, 255)', 10000, ['background']),
      stat('rgb(200, 30, 30)', 1, ['background']),
      stat('rgb(37, 99, 235)', 1, ['background', 'interactive'], 2),
    ]);
    expect(byHex(d.colors, '#c81e1e')).toBeUndefined();
    expect(holder(d, 'primary').hex).toBe('#2563eb');
  });

  it('gives colors value-based ids in export order (v2 spec 6.3)', () => {
    const tokens = colorsOf([
      stat('rgb(37, 99, 235)', 10, ['background']),
      stat('rgb(255, 255, 255)', 10, ['background']),
      stat('rgba(0, 0, 0, 0.1)', 10, ['border']),
    ]);
    expect(tokens.map((t) => t.id)).toEqual(['color:#ffffff', 'color:#2563eb', 'color:#000000@10']);
  });
});

describe('translucent colors (F9)', () => {
  it('AC-F9.1 blends over the nearest opaque backdrop with translucent ancestors in between', () => {
    const raw = loadRaw('translucent');
    const find = (value, context) =>
      raw.colors.find((c) => c.value === value && c.contexts.includes(context));
    // Borders and muted text on the white page.
    expect(find('rgba(0, 0, 0, 0.1)', 'border')).toMatchObject({
      effectiveHex: '#e6e6e6',
      backdropHex: '#ffffff',
    });
    expect(find('rgba(17, 24, 39, 0.6)', 'text').backdropHex).toBe('#ffffff');
    // The chip sits inside a blue tint at 10%: its backdrop is the tint over white.
    const tint = blend({ r: 37, g: 99, b: 235, a: 0.1 }, LIGHT_CANVAS);
    expect(find('rgba(37, 99, 235, 0.1)', 'background').effectiveHex).toBe(tint);
    expect(find('rgba(37, 99, 235, 0.2)', 'background')).toMatchObject({
      backdropHex: tint,
      effectiveHex: blend({ r: 37, g: 99, b: 235, a: 0.2 }, { r: 0xe9, g: 0xef, b: 0xfd, a: 1 }),
    });
  });

  it('AC-F9.1 falls back to #ffffff for a light page and #121212 for a dark page', () => {
    expect(toHex(LIGHT_CANVAS)).toBe('#ffffff');
    expect(toHex(DARK_CANVAS)).toBe('#121212');
    // A dark page's translucent white is blended over its own root background.
    const dark = loadRaw('dark');
    const scrim = dark.colors.find((c) => c.value === 'rgba(0, 0, 0, 0.5)');
    expect(scrim.backdropHex).not.toBe('#ffffff');
  });

  it('AC-F9.2 blends per channel in sRGB: out = a * fg + (1 - a) * bg', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(blend({ r: 0, g: 0, b: 0, a: 0.1 }, white)).toBe('#e6e6e6');
    expect(blend({ r: 0, g: 0, b: 0, a: 0.5 }, white)).toBe('#808080');
    expect(blend({ r: 255, g: 255, b: 255, a: 0.1 }, { r: 18, g: 18, b: 18, a: 1 })).toBe(
      '#2a2a2a',
    );
    expect(blend({ r: 37, g: 99, b: 235, a: 0.2 }, white)).toBe('#d3e0fb');
    // Opaque colors are unchanged, and the fixture's measured values agree with the formula.
    expect(blend({ r: 37, g: 99, b: 235, a: 1 }, white)).toBe('#2563eb');
    const muted = loadRaw('translucent').colors.find((c) => c.value === 'rgba(17, 24, 39, 0.6)');
    expect(muted.effectiveHex).toBe(blend({ r: 17, g: 24, b: 39, a: 0.6 }, white));
  });

  it('AC-F9.3 rounds alpha to the nearest 0.05', () => {
    expect(ALPHA_STEP).toBe(0.05);
    expect(alphaBucket(0.1)).toBeCloseTo(0.1);
    expect(alphaBucket(0.12)).toBeCloseTo(0.1);
    expect(alphaBucket(0.13)).toBeCloseTo(0.15);
    expect(alphaBucket(0.5)).toBeCloseTo(0.5);
    // Never rounds to fully transparent or fully opaque.
    expect(alphaBucket(0.01)).toBeCloseTo(0.05);
    expect(alphaBucket(0.99)).toBeCloseTo(0.95);
  });

  it('AC-F9.3 merges translucent values with the same base and alpha bucket', () => {
    const d = designOf([
      ...page,
      tstat('rgba(0, 0, 0, 0.1)', 400, ['border'], '#e6e6e6'),
      tstat('rgba(0, 0, 0, 0.12)', 200, ['border'], '#e0e0e0'),
      tstat('rgba(0, 0, 0, 0.2)', 300, ['border'], '#cccccc'),
      tstat('rgba(37, 99, 235, 0.1)', 300, ['border'], '#e9effd'),
      tstat('rgba(37, 99, 236, 0.11)', 100, ['border'], '#e9effd'),
    ]);
    const translucent = d.colors.filter((c) => c.alpha < 1);
    expect(translucent.map((c) => c.id).sort()).toEqual([
      'color:#000000@10',
      'color:#000000@20',
      'color:#2563eb@10',
    ]);
    expect(d.colors.find((c) => c.id === 'color:#000000@10').mergedFrom).toEqual(['#0000001f']);
    expect(d.colors.find((c) => c.id === 'color:#2563eb@10').mergedFrom).toEqual(['#2563ec1c']);
  });

  it('AC-F9.3 merges the 10% and 12% borders of the fixture into one token', () => {
    const d = analyzeFixture('translucent');
    const border = d.colors.find((c) => c.id === 'color:#000000@10');
    expect(border.hex).toBe('#0000001a');
    expect(border.mergedFrom).toEqual(['#0000001f']);
    expect(colorLookup(d.colors)('rgba(0, 0, 0, 0.12)')).toBe(border);
    // An alpha never seen on the page still finds its bucket.
    expect(colorLookup(d.colors)('rgba(0, 0, 0, 0.11)')).toBe(border);
  });

  it('AC-F9.4 names translucent tokens <base>/<alpha%> after white, black or the opaque token', () => {
    const d = analyzeFixture('translucent');
    const name = (id) => d.colors.find((c) => c.id === id)?.name;
    expect(name('color:#000000@10')).toBe('black/10');
    expect(name('color:#000000@50')).toBe('black/50');
    expect(name('color:#ffffff@80')).toBe('white/80');
    // The muted text is the page's text color at 60%: it takes the opaque token's name.
    expect(name('color:#111827')).toBe('gray-900');
    expect(name('color:#111827@60')).toBe('gray-900/60');
    expect(d.colors.find((c) => c.id === 'color:#111827@60').baseTokenId).toBe('color:#111827');
    expect(d.colors.find((c) => c.id === 'color:#2563eb@10')).toMatchObject({
      name: 'blue-600/10',
      baseTokenId: 'color:#2563eb',
    });
  });

  it('AC-F9.4 creates no opaque base token when the opaque color is not on the page', () => {
    const d = analyzeFixture('translucent');
    expect(d.colors.find((c) => c.id === 'color:#000000')).toBeUndefined();
    expect(d.colors.find((c) => c.id === 'color:#000000@10').baseTokenId).toBeNull();
    const alone = designOf([
      ...page,
      tstat('rgba(37, 99, 235, 0.2)', 5000, ['background'], '#d3e0fb'),
    ]);
    expect(alone.colors.map((c) => c.name)).toEqual(['white', 'blue-600/20']);
    expect(alone.colors[1]).toMatchObject({ hex: '#2563eb33', alpha: 0.2, baseTokenId: null });
  });

  it('AC-F9.5 roles use effective colors: translucent tokens hold text-muted and border', () => {
    const d = analyzeFixture('translucent');
    expect(d.semantic['text-muted']).toEqual({ light: 'color:#111827@60' });
    expect(d.semantic.border).toEqual({ light: 'color:#000000@10' });
    expect(holder(d, 'text-muted').effectiveHex).toBe('#70747d');
    // The opaque text keeps the text role.
    expect(d.semantic.text).toEqual({ light: 'color:#111827' });
  });

  it('AC-F9.5 judges muted text by its effective contrast, not its raw value', () => {
    const base = [...page, stat('rgb(17, 24, 39)', 5000, ['text'], 10)];
    // Black at 60% looks like #666666 on white (contrast 5.7): muted.
    const readable = designOf([...base, tstat('rgba(0, 0, 0, 0.6)', 1000, ['text'], '#666666')]);
    expect(readable.semantic['text-muted']).toEqual({ light: 'color:#000000@60' });
    // Black at 15% looks like #d9d9d9 (contrast 1.4): too faint to be muted text.
    const faint = designOf([...base, tstat('rgba(0, 0, 0, 0.15)', 1000, ['text'], '#d9d9d9')]);
    expect(faint.semantic['text-muted']).toBeUndefined();
  });

  it('AC-F9.6 gives overlay to the most-used translucent fill with alpha >= 0.3 covering >= 25%', () => {
    const d = analyzeFixture('translucent');
    expect(d.semantic.overlay).toEqual({ light: 'color:#000000@50' });
    const viewport = 1280 * 720;
    const scrim = (alpha, coverage, weight = 2000) =>
      tstat(`rgba(0, 0, 0, ${alpha})`, weight, ['background'], '#808080', '#ffffff', {
        maxWeight: coverage * viewport,
      });
    expect(designOf([...page, scrim(0.5, 0.25)]).semantic.overlay).toEqual({
      light: 'color:#000000@50',
    });
    expect(designOf([...page, scrim(0.3, 1)]).semantic.overlay).toEqual({
      light: 'color:#000000@30',
    });
    expect(designOf([...page, scrim(0.2, 1)]).semantic.overlay).toBeUndefined();
    expect(designOf([...page, scrim(0.5, 0.2)]).semantic.overlay).toBeUndefined();
    const two = designOf([...page, scrim(0.5, 1, 2000), scrim(0.8, 1, 9000)]);
    expect(two.semantic.overlay).toEqual({ light: 'color:#000000@80' });
  });

  it('AC-F9.7 exports write the 8-digit hex; DESIGN.md shows alpha, effective color and modifiers', () => {
    const d = analyzeFixture('translucent');
    const css = exportFile('css-vars', d, '2.0.0');
    expect(css).toContain('#0000001a');
    expect(css).toContain('#11182799');
    const md = exportFile('design-md', d, '2.0.0');
    expect(md).toContain('### Translucent');
    expect(md).toMatch(/black\/10[^\n]*#0000001a[^\n]*10%[^\n]*#e6e6e6/);
    expect(md).toContain('border-black/10');
    for (const format of ['dtcg', 'tailwind-v4', 'tailwind-v3']) {
      expect(exportFile(format, d, '2.0.0'), format).toContain('#0000001a');
    }
  });

  it('AC-F9.9 gives low confidence to translucent colors measured over a background image', () => {
    const d = analyzeFixture('translucent');
    const overImage = d.colors.find((c) => c.id === 'color:#ffffff@80');
    expect(overImage.confidence.level).toBe('low');
    expect(overImage.confidence.reasons).toContain('Measured over a background image');
  });

  it('AC-F9.9 keeps a well-used color over an image at low confidence', () => {
    const confidenceOf = (share) =>
      designOf([
        ...page,
        stat('rgb(17, 24, 39)', 5000, ['text'], 200),
        tstat('rgba(255, 255, 255, 0.8)', 3000, ['text'], '#ffffff', '#ffffff', {
          count: 200,
          overImageShare: share,
        }),
      ]).colors.find((c) => c.id === 'color:#ffffff@80').confidence;
    expect(confidenceOf(0).level).not.toBe('low');
    expect(confidenceOf(1).level).toBe('low');
  });
});
