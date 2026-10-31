import { describe, expect, it } from 'vitest';
import { parse, wcagContrast } from 'culori';
import { exportShadcn } from '../../../src/export/index.js';
import {
  chartColors,
  hslTriplet,
  oklchString,
  radiusRem,
  shadcnValues,
} from '../../../src/export/shadcn.js';
import { FIXTURE_NAMES } from '../helpers.js';
import { VERSION, fixtureDesigns, richDesign } from './designs.js';

const designs = { ...fixtureDesigns(), rich: richDesign() };
const ALL = [...FIXTURE_NAMES, 'rich'];
const VARIABLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'radius',
];
const block = (css, selector) => css.split(`\n${selector} {\n`)[1]?.split('\n}')[0] ?? null;
const rootBlock = (css) => css.split(':root {\n')[1].split('\n}')[0];

describe('shadcn-theme.css (F31)', () => {
  it.each(ALL)('AC-F31.1 every 9.6 variable is written or has a TODO comment on %s', (name) => {
    const css = exportShadcn(designs[name], VERSION);
    for (const selector of [':root', '.dark']) {
      const body = selector === ':root' ? rootBlock(css) : block(css, selector);
      if (body === null) continue;
      for (const v of VARIABLES) {
        if (v === 'radius' && selector === '.dark') continue;
        const written = new RegExp(`^ {2}--${v}: [^;]+;$`, 'm').test(body);
        const todo = new RegExp(`^ {2}/\\* --${v}: TODO, [a-z].+ \\*/$`, 'm').test(body);
        expect(written || todo, `${selector} --${v}`).toBe(true);
      }
    }
  });

  it.each(ALL)('AC-F31.2 every color written is an extracted color on %s', (name) => {
    const design = designs[name];
    const known = new Set(design.colors.filter((c) => !c.excluded).map((c) => oklchString(c.hex)));
    const css = exportShadcn(design, VERSION);
    const values = [...css.matchAll(/^ {2}--[a-z0-9-]+: (oklch\([^)]+\));$/gm)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(5);
    for (const v of values) expect(known, v).toContain(v);
  });

  it('AC-F31.2 foregrounds come from the recipe text, else the highest-contrast color', () => {
    const rich = designs.rich;
    expect(shadcnValues(rich, 'light')['primary-foreground']).toBe('#ffffff');
    // Without recipes, the extracted color with the highest contrast on primary is chosen.
    const bare = { ...structuredClone(rich), components: [] };
    const values = shadcnValues(bare, 'light');
    const primary = values.primary;
    const candidates = bare.colors.filter((c) => c.alpha >= 1 && c.modes.includes('light'));
    const best = candidates.sort(
      (a, b) => wcagContrast(b.hex, primary) - wcagContrast(a.hex, primary),
    )[0];
    expect(values['primary-foreground']).toBe(best.hex);
    expect(wcagContrast(values['primary-foreground'], primary)).toBeGreaterThanOrEqual(4.5);
    expect(values['card-foreground']).toBe(values.foreground);
  });

  it('AC-F31.2 a foreground with no extracted color at 4.5:1 gets a TODO instead of a value', () => {
    const d = structuredClone(designs.rich);
    d.components = [];
    // Keep only primary and colors close to it, so nothing reaches 4.5:1 against it.
    d.colors = d.colors.filter((c) => ['#2563eb', '#60a5fa'].includes(c.hex));
    expect(parse('#2563eb')).toBeDefined();
    expect(wcagContrast('#2563eb', '#60a5fa')).toBeLessThan(4.5);
    const css = exportShadcn(d, VERSION);
    expect(rootBlock(css)).toContain(
      '/* --primary-foreground: TODO, no extracted color reaches 4.5:1 on primary */',
    );
    expect(rootBlock(css)).toContain(
      '/* --background: TODO, no matching color found on the page */',
    );
    expect(css).not.toContain('--color-primary-foreground');
  });

  it('AC-F31.3 the .dark block appears only when a dark theme exists', () => {
    expect(exportShadcn(designs.rich, VERSION)).toContain('\n.dark {\n');
    for (const name of FIXTURE_NAMES)
      expect(exportShadcn(designs[name], VERSION), name).not.toContain('.dark');
    // A dark-only site writes its theme in :root, since there is no second theme.
    expect(rootBlock(exportShadcn(designs.dark, VERSION))).toContain(
      `--background: ${oklchString('#0b0f19')};`,
    );
  });

  it('AC-F31.4 the oklch format writes oklch() with 3 decimals and the @theme inline block', () => {
    const css = exportShadcn(designs.rich, VERSION);
    const values = [...css.matchAll(/^ {2}--(?!radius)[a-z0-9-]+: ([^;]+);$/gm)]
      .map((m) => m[1])
      .filter((v) => !v.startsWith('var(') && !v.startsWith('calc('));
    for (const v of values)
      expect(v).toMatch(
        /^oklch\(-?\d+(\.\d{1,3})? \d+(\.\d{1,3})? \d+(\.\d{1,3})?( \/ \d(\.\d{1,3})?)?\)$/,
      );
    expect(css).toMatch(/@theme inline \{\n {2}--color-background: var\(--background\);/);
    expect(css).toContain('  --radius-lg: var(--radius);');
    expect(oklchString('#ffffff')).toBe('oklch(1 0 0)');
    expect(oklchString('#0000001a')).toBe('oklch(0 0 0 / 0.102)');
  });

  it('AC-F31.4 the hsl format writes bare H S% L% triplets without @theme inline', () => {
    const css = exportShadcn(designs.rich, VERSION, { shadcnFormat: 'hsl' });
    expect(css).not.toContain('@theme inline');
    expect(css).not.toContain('oklch(');
    const values = [...css.matchAll(/^ {2}--(?!radius)[a-z0-9-]+: ([^;]+);$/gm)].map((m) => m[1]);
    expect(values.length).toBeGreaterThan(10);
    for (const v of values) expect(v).toMatch(/^\d+(\.\d)? \d+(\.\d)?% \d+(\.\d)?%( \/ [\d.]+)?$/);
    expect(css).toContain('\n.dark {\n');
    expect(hslTriplet('#2563eb')).toBe('221.2 83.2% 53.3%');
    expect(hslTriplet('#ffffff')).toBe('0 0% 100%');
    // A translucent color keeps its alpha instead of turning opaque.
    expect(hslTriplet('#0000001a')).toBe('0 0% 0% / 0.102');
  });

  it('AC-F31.5 chart colors are the top saturated colors, preferring distinct hue families', () => {
    for (const name of ALL) {
      const d = designs[name];
      const charts = chartColors(d);
      expect(charts.length).toBeLessThanOrEqual(5);
      const tokens = charts.map((hex) => d.colors.find((c) => c.hex === hex));
      for (const t of tokens) expect(t.oklch.c, `${name} ${t.hex}`).toBeGreaterThanOrEqual(0.08);
      const saturated = d.colors.filter((c) => !c.excluded && c.alpha >= 1 && c.oklch.c >= 0.08);
      const families = new Set(saturated.map((c) => c.family));
      // Distinct families come first; repeats only fill the remaining slots.
      const firstFamilies = tokens.slice(0, Math.min(5, families.size)).map((t) => t.family);
      expect(new Set(firstFamilies).size, name).toBe(firstFamilies.length);
      expect(charts.length).toBe(Math.min(5, saturated.length));
      const css = exportShadcn(d, VERSION);
      charts.forEach((hex, i) => expect(css).toContain(`--chart-${i + 1}: ${oklchString(hex)};`));
      expect(css).not.toContain(`--chart-${charts.length + 1}:`);
    }
  });

  it('AC-F31.6 --radius is the most-used radius in rem', () => {
    const classic = designs.classic;
    const top = classic.radii
      .filter((r) => r.px < 9999)
      .sort((a, b) => b.usageShare - a.usageShare)[0];
    expect(top.px).toBe(6);
    expect(radiusRem(classic)).toBe('0.375rem');
    expect(exportShadcn(classic, VERSION)).toContain('  --radius: 0.375rem;');
    const none = { ...structuredClone(classic), radii: [] };
    expect(exportShadcn(none, VERSION)).toContain(
      '/* --radius: TODO, no border radius found on the page */',
    );
    expect(exportShadcn(none, VERSION)).not.toContain('--radius-lg');
  });

  it.each(['classic', 'rich'])('AC-F31.7 snapshots cover both formats on %s', async (name) => {
    await expect(exportShadcn(designs[name], VERSION)).toMatchFileSnapshot(
      `./__snapshots__/${name}/design/shadcn-theme.css`,
    );
    await expect(exportShadcn(designs[name], VERSION, { shadcnFormat: 'hsl' })).toMatchFileSnapshot(
      `./__snapshots__/${name}/design/shadcn-theme.hsl.css`,
    );
  });
});
