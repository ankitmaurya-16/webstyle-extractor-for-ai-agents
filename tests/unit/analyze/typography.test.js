import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { parseFontStack } from '../../../src/analyze/units.js';
import { rawSnapshot, stat } from '../helpers.js';

const style = (size, line, weight, family, chars, tags = ['p']) =>
  stat([size, line, weight, family].join('|'), chars, tags);
const SANS = '"Inter", system-ui, sans-serif';
const SERIF = 'Georgia, serif';

function typo(textStyles, extra = {}) {
  const families = new Map();
  for (const s of textStyles) {
    const family = s.value.split('|')[3];
    families.set(family, (families.get(family) ?? 0) + s.weight);
  }
  return analyze(
    rawSnapshot({ textStyles, fontFamilies: [...families].map(([v, w]) => stat(v, w)), ...extra }),
  ).typography;
}

describe('typography', () => {
  it('AC-F3.1 keeps the full stack with quotes normalized and names the class', () => {
    expect(parseFontStack(`"Inter", 'Helvetica Neue', system-ui, sans-serif`)).toEqual([
      'Inter',
      'Helvetica Neue',
      'system-ui',
      'sans-serif',
    ]);
    const { families } = typo([
      style('16px', '24px', '400', SANS, 1000),
      style('14px', '20px', '400', '"JetBrains Mono", monospace', 200),
      style('36px', '40px', '700', SERIF, 50, ['h1']),
    ]);
    expect(families.map((f) => [f.name, f.stack])).toEqual([
      ['sans', ['Inter', 'system-ui', 'sans-serif']],
      ['mono', ['JetBrains Mono', 'monospace']],
      ['display', ['Georgia', 'serif']],
    ]);
  });

  it('AC-F3.1 names a serif family used on body text serif, not display', () => {
    const { families } = typo([style('17px', '28px', '400', SERIF, 1000)]);
    expect(families[0].name).toBe('serif');
  });

  it('AC-F3.2 converts rem and em to px using the root font size', () => {
    const { sizes } = typo([style('1.5rem', '2rem', '400', SANS, 1000)], { rootFontSizePx: 10 });
    expect(sizes[0]).toMatchObject({ sizePx: 15, lineHeightPx: 20 });
  });

  it('AC-F3.3 drops sizes under 0.5% of text weight', () => {
    const { sizes } = typo([
      style('16px', '24px', '400', SANS, 1000),
      style('9px', '12px', '400', SANS, 2),
    ]);
    expect(sizes.map((s) => s.sizePx)).toEqual([16]);
  });

  it('AC-F3.4 names the most-used body size base, smaller sm and xs, larger lg upward', () => {
    const { sizes } = typo([
      style('12px', '16px', '400', SANS, 100),
      style('14px', '20px', '400', SANS, 200),
      style('16px', '24px', '400', SANS, 1000),
      style('18px', '28px', '400', SANS, 100),
      style('20px', '28px', '600', SANS, 100),
      style('24px', '32px', '600', SANS, 100),
    ]);
    expect(sizes.map((s) => `${s.name}:${s.sizePx}`)).toEqual([
      'xs:12',
      'sm:14',
      'base:16',
      'lg:18',
      'xl:20',
      '2xl:24',
    ]);
  });

  it('AC-F3.5 shows the most common line height and weight per size', () => {
    const { sizes } = typo([
      style('16px', '24px', '400', SANS, 900),
      style('16px', '20px', '700', SANS, 100),
      style('16px', 'normal', '400', SANS, 50),
    ]);
    expect(sizes[0]).toMatchObject({ lineHeightPx: 24, weight: 400 });
    const normal = typo([style('16px', 'normal', '400', SANS, 900)]).sizes[0];
    expect(normal.lineHeightPx).toBeNull();
  });

  it('AC-F3.6 maps h1 to h6 to sizes when they exist and omits missing ones', () => {
    const h = (kind, size) => ({
      kind,
      count: 1,
      styles: {
        'font-size': size,
        'line-height': '40px',
        'font-weight': '700',
        'font-family': SANS,
      },
    });
    const { sizes } = typo(
      [style('16px', '24px', '400', SANS, 1000), style('36px', '40px', '700', SANS, 30, ['h1'])],
      {
        samples: [h('h1', '36px'), h('h3', '20px')],
      },
    );
    expect(sizes.find((s) => s.sizePx === 36).headings).toEqual(['h1']);
    // h3 exists on the page, so its size is kept even with little text weight.
    expect(sizes.find((s) => s.sizePx === 20).headings).toEqual(['h3']);
    expect(sizes.flatMap((s) => s.headings)).not.toContain('h2');
  });
});
