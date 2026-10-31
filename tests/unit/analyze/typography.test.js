import { describe, expect, it } from 'vitest';
import { analyzeTypography } from '../../../src/analyze/typography.js';
import { parseFontStack } from '../../../src/analyze/units.js';
import { analyzeFixture, analyzeRaw, loadRaw, rawSnapshot, stat } from '../helpers.js';

const SANS = '"Inter", system-ui, sans-serif';
const MONO = '"JetBrains Mono", monospace';

/** A TextStyleSample with sensible defaults. */
const ts = (overrides) => ({
  family: SANS,
  sizePx: 16,
  lineHeightPx: 24,
  fontWeight: 400,
  letterSpacingEm: 0,
  textTransform: 'none',
  tags: ['p'],
  count: 1,
  usage: 100,
  ...overrides,
});

function typo(textStyles, extra = {}) {
  const families = new Map();
  for (const s of textStyles) families.set(s.family, (families.get(s.family) ?? 0) + s.usage);
  return analyzeTypography(
    rawSnapshot({ textStyles, fontFamilies: [...families].map(([v, w]) => stat(v, w)), ...extra }),
    extra.fontFaces ?? [],
  );
}

describe('typography (F3 kept behavior)', () => {
  it('keeps full stacks and names family classes', () => {
    expect(parseFontStack(`"Inter", 'Helvetica Neue', system-ui, sans-serif`)).toEqual([
      'Inter',
      'Helvetica Neue',
      'system-ui',
      'sans-serif',
    ]);
    const { families } = typo([
      ts({ usage: 1000 }),
      ts({ family: MONO, sizePx: 14, lineHeightPx: 20, tags: ['code'], usage: 200 }),
      ts({ family: 'Georgia, serif', sizePx: 36, fontWeight: 700, tags: ['h1'], usage: 50 }),
    ]);
    expect(families.map((f) => [f.name, f.stack])).toEqual([
      ['sans', ['Inter', 'system-ui', 'sans-serif']],
      ['mono', ['JetBrains Mono', 'monospace']],
      ['display', ['Georgia', 'serif']],
    ]);
  });
});

describe('text styles (F15)', () => {
  it('AC-F15.1 collects letter spacing in em, converting px through the font size', () => {
    const raw = loadRaw('typography');
    const spacing = Object.fromEntries(raw.letterSpacings.map((s) => [s.value, s.count]));
    // normal is 0; h1 and h2 use -0.025em; .overline 0.1em and .tracked-px 2px on 20px (0.1em).
    expect(spacing).toMatchObject({ 0: expect.any(Number), '-0.025': 2, 0.1: 2, 0.15: 1 });
    const trackedPx = raw.textStyles.find((s) => s.sizePx === 20);
    expect(trackedPx.letterSpacingEm).toBe(0.1);
  });

  it('AC-F15.1 collects text-transform', () => {
    const raw = loadRaw('typography');
    expect(raw.textTransforms.map((s) => s.value).sort()).toEqual([
      'capitalize',
      'none',
      'uppercase',
    ]);
    expect(raw.textTransforms.find((s) => s.value === 'uppercase').count).toBe(2);
  });

  it('AC-F15.2 weights text-style combinations by characters and tags their contexts', () => {
    const raw = loadRaw('typography');
    const body = raw.textStyles.find(
      (s) => s.sizePx === 16 && s.letterSpacingEm === 0 && s.textTransform === 'none',
    );
    // Usage is the character count, far above the number of elements.
    expect(body.count).toBe(4);
    expect(body.usage).toBeGreaterThan(500);
    expect(body.tags).toEqual(['p']);
    const tagsOf = (size, weight) =>
      raw.textStyles.find((s) => s.sizePx === size && s.fontWeight === weight).tags;
    expect(tagsOf(40, 700)).toEqual(['h1']);
    expect(tagsOf(14, 500)).toEqual(['label']);
    expect(tagsOf(14, 600)).toEqual(['button']);
    expect(raw.textStyles.find((s) => s.family.includes('JetBrains')).tags).toEqual(['code']);
    // Same size, different transform: a separate combination.
    const sixteen = raw.textStyles.filter((s) => s.sizePx === 16);
    expect(sixteen.map((s) => `${s.letterSpacingEm}|${s.textTransform}`).sort()).toEqual([
      '0.15|none',
      '0|capitalize',
      '0|none',
    ]);
  });

  it('AC-F15.3 names letter-spacing tokens after Tailwind within 0.005 em', () => {
    const { letterSpacings } = analyzeFixture('typography').typography;
    expect(letterSpacings.map((t) => [t.name, t.em])).toEqual([
      ['tracking-tighter', -0.05],
      ['tracking-tight', -0.025],
      ['tracking-normal', 0],
      ['tracking-wide', 0.025],
      ['tracking-wider', 0.05],
      ['tracking-widest', 0.1],
      ['tracking-custom-1', 0.15],
    ]);
  });

  it('AC-F15.3 uses the 0.005 em tolerance and numbers custom values by usage', () => {
    const { letterSpacings } = analyzeTypography(
      rawSnapshot({
        letterSpacings: [
          stat('0.029', 100, ['text'], 4),
          stat('0.031', 50, ['text'], 2),
          stat('0.3', 80, ['text'], 3),
          stat('-0.2', 40, ['text'], 1),
        ],
      }),
    );
    expect(letterSpacings.map((t) => [t.em, t.name])).toEqual([
      [-0.2, 'tracking-custom-3'],
      [0.029, 'tracking-wide'],
      [0.031, 'tracking-custom-2'],
      [0.3, 'tracking-custom-1'],
    ]);
    expect(letterSpacings.find((t) => t.em === 0.3).count).toBe(3);
  });

  it('AC-F15.4 names text styles by tag, display, overline, body, body-sm and caption', () => {
    const { textStyles } = analyzeFixture('typography').typography;
    const byName = Object.fromEntries(textStyles.map((s) => [s.name, s]));
    expect(textStyles.map((s) => s.name)).toEqual([
      'h1',
      'h2',
      'h3',
      'button',
      'label',
      'code',
      'display',
      'overline',
      'body',
      'body-sm',
      'caption',
    ]);
    expect(byName.h1).toMatchObject({
      sizePx: 40,
      lineHeightPx: 48,
      fontWeight: 700,
      letterSpacingEm: -0.025,
    });
    expect(byName.button).toMatchObject({
      sizePx: 14,
      textTransform: 'uppercase',
      letterSpacingEm: 0.05,
    });
    expect(byName.code.familyId).toBe('family:jetbrains-mono');
    expect(byName.display).toMatchObject({ sizePx: 60, letterSpacingEm: -0.05 });
    expect(byName.overline).toMatchObject({
      sizePx: 12,
      textTransform: 'uppercase',
      letterSpacingEm: 0.1,
    });
    expect(byName.body).toMatchObject({ sizePx: 16, lineHeightPx: 24, usedFor: ['p'] });
    expect(byName['body-sm'].sizePx).toBe(14);
    expect(byName.caption.sizePx).toBe(12);
  });

  it('AC-F15.4 keeps at most 12 text styles', () => {
    const styles = [
      ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag, i) =>
        ts({ sizePx: 40 - i * 4, fontWeight: 700, tags: [tag], usage: 20 }),
      ),
      ts({ sizePx: 14, fontWeight: 600, tags: ['button'], usage: 20 }),
      ts({ sizePx: 14, fontWeight: 500, tags: ['label'], usage: 20 }),
      ts({ family: MONO, sizePx: 14, tags: ['code'], usage: 20 }),
      ts({ sizePx: 64, fontWeight: 800, usage: 10 }),
      ts({ sizePx: 12, textTransform: 'uppercase', letterSpacingEm: 0.1, usage: 10 }),
      ts({ sizePx: 16, usage: 1000 }),
      ts({ sizePx: 14, usage: 100 }),
      ts({ sizePx: 12, usage: 50 }),
    ];
    const { textStyles } = typo(styles);
    expect(textStyles).toHaveLength(12);
    expect(textStyles.map((s) => s.name)).toEqual([
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'button',
      'label',
      'code',
      'display',
      'overline',
      'body',
    ]);
  });

  it('AC-F15.4 adds display only when the largest non-heading style is 1.5 times base', () => {
    const small = typo([ts({ usage: 1000 }), ts({ sizePx: 22, usage: 20 })]).textStyles;
    expect(small.map((s) => s.name)).not.toContain('display');
    const big = typo([ts({ usage: 1000 }), ts({ sizePx: 24, usage: 20 })]).textStyles;
    expect(big.find((s) => s.name === 'display').sizePx).toBe(24);
  });

  it('AC-F15.4 needs uppercase and positive tracking for overline', () => {
    const plain = typo([
      ts({ usage: 1000 }),
      ts({ sizePx: 12, textTransform: 'uppercase', usage: 30 }),
    ]);
    expect(plain.textStyles.map((s) => s.name)).not.toContain('overline');
  });

  it('TypeSizeTokenV2 records the most common letter spacing of each size', () => {
    const { sizes } = analyzeFixture('typography').typography;
    const at = (px) => sizes.find((s) => s.sizePx === px);
    expect(at(40)).toMatchObject({ letterSpacingEm: -0.025, headings: ['h1'] });
    expect(at(60).letterSpacingEm).toBe(-0.05);
    expect(at(16)).toMatchObject({ name: 'base', letterSpacingEm: 0 });
  });
});

describe('web fonts (F19)', () => {
  it('AC-F19.1 reads font faces with family, weights, styles and loaded status', () => {
    const faces = loadRaw('typography').fontFaces;
    expect(faces.map((f) => f.family)).toEqual([
      'Brand Sans',
      'Hosted Serif',
      'Kit Display',
      'Other Grotesk',
    ]);
    expect(faces.find((f) => f.family === 'Brand Sans')).toMatchObject({
      loaded: true,
      weights: [400, 700],
      styles: ['normal'],
    });
    // Faces no element uses are never requested, so they stay unloaded.
    expect(faces.filter((f) => !f.loaded).map((f) => f.family)).toEqual([
      'Hosted Serif',
      'Kit Display',
      'Other Grotesk',
    ]);
  });

  it('AC-F19.2 identifies the provider from host names only', () => {
    const faces = Object.fromEntries(loadRaw('typography').fontFaces.map((f) => [f.family, f]));
    expect(faces['Hosted Serif']).toMatchObject({
      provider: 'google-fonts',
      providerHost: 'fonts.gstatic.com',
    });
    expect(faces['Kit Display']).toMatchObject({
      provider: 'adobe-fonts',
      providerHost: 'use.typekit.net',
    });
    expect(faces['Other Grotesk']).toMatchObject({
      provider: 'other',
      providerHost: 'cdn.fonts-example.net',
    });
    expect(faces['Brand Sans'].provider).toBe('self-hosted');
    for (const f of Object.values(faces)) expect(f.providerHost ?? '').not.toMatch(/[/:]{2}|\//);
  });

  it('AC-F19.2 stores no font URL or file name in the raw snapshot or the design', () => {
    const raw = loadRaw('typography');
    const design = analyzeRaw(raw);
    for (const text of [JSON.stringify(raw), JSON.stringify(design)]) {
      expect(text).not.toMatch(/\.woff2?|\.ttf|\.otf|https?:\/\/(fonts\.|use\.typekit|cdn\.fonts)/);
    }
  });

  it('AC-F19.3 aggregates weights and styles per family', () => {
    const faces = Object.fromEntries(loadRaw('typography').fontFaces.map((f) => [f.family, f]));
    // Two @font-face rules each: 400 and 700; normal and italic.
    expect(faces['Brand Sans'].weights).toEqual([400, 700]);
    expect(faces['Hosted Serif'].styles).toEqual(['italic', 'normal']);
    // A weight range in one rule expands to the weights inside it.
    expect(faces['Other Grotesk'].weights).toEqual([300, 500]);
  });

  it('AC-F19.4 links family tokens to their loaded web font; others are system fonts', () => {
    const { families } = analyzeFixture('typography').typography;
    const sans = families.find((f) => f.stack[0] === 'Brand Sans');
    expect(sans.webFont).toMatchObject({ family: 'Brand Sans', provider: 'self-hosted' });
    // JetBrains Mono has no @font-face here, so it is a system font.
    expect(families.find((f) => f.stack[0] === 'JetBrains Mono').webFont).toBeNull();
  });

  it('AC-F19.4 does not link a family whose face never loaded', () => {
    const face = {
      family: 'Inter',
      weights: [400],
      styles: ['normal'],
      provider: 'google-fonts',
      providerHost: 'fonts.gstatic.com',
    };
    const loaded = typo([ts({})], { fontFaces: [{ ...face, loaded: true }] }).families[0];
    const unloaded = typo([ts({})], { fontFaces: [{ ...face, loaded: false }] }).families[0];
    expect(loaded.webFont.family).toBe('Inter');
    expect(unloaded.webFont).toBeNull();
  });
});
