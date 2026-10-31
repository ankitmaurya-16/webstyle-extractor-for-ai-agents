import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { buildOverrideRaw, emptyRaw, themeMechanism } from '../../../src/analyze/themes.js';
import { canEmulateTheme } from '../../../src/advanced/plan.js';
import { exportFile } from '../../../src/export/index.js';
import { analyzeFixture, analyzeRaw, captureOf, capturesFor, loadRaw } from '../helpers.js';

const signals = (extra) => ({
  darkMedia: false,
  darkSelectors: [],
  lightSelectors: [],
  activeMode: 'light',
  colorSchemeProperty: 'normal',
  ...extra,
});
const hexes = (raw) => raw.colors.map((c) => c.value);

describe('theme mechanism (F13)', () => {
  it('AC-F13.1 detects media, class, attribute or none with its selector', () => {
    expect(themeMechanism(signals({ darkMedia: true }))).toEqual({
      mechanism: 'media',
      selector: '@media (prefers-color-scheme: dark)',
    });
    expect(themeMechanism(signals({ darkSelectors: ['.dark'] }))).toEqual({
      mechanism: 'class',
      selector: '.dark',
    });
    expect(themeMechanism(signals({ darkSelectors: ['.theme-dark'] })).mechanism).toBe('class');
    expect(themeMechanism(signals({ darkSelectors: ['[data-mode="dark"]'] }))).toEqual({
      mechanism: 'attribute',
      selector: '[data-mode="dark"]',
    });
    expect(themeMechanism(signals())).toEqual({ mechanism: 'none', selector: null });
    expect(themeMechanism(undefined)).toEqual({ mechanism: 'none', selector: null });
    // A class decides on the site even when a media query also exists (v2 spec 11.6).
    expect(themeMechanism(signals({ darkMedia: true, darkSelectors: ['.dark'] })).mechanism).toBe(
      'class',
    );
  });

  it('AC-F13.1 has a passing fixture for each mechanism', () => {
    const meta = (name) => {
      const { themeMechanism: mechanism, themeSelector } = analyzeFixture(name).meta;
      return [mechanism, themeSelector];
    };
    expect(meta('dark-media')).toEqual(['media', '@media (prefers-color-scheme: dark)']);
    expect(meta('dark-class')).toEqual(['class', '.dark']);
    expect(meta('dark-attribute')).toEqual(['attribute', '[data-theme="dark"]']);
    expect(meta('classic')).toEqual(['none', null]);
  });
});

describe('Path A: the other theme from stylesheet overrides (F13)', () => {
  it('AC-F13.2 swaps colors through variables overridden in the other theme', () => {
    const raw = loadRaw('dark-media');
    const dark = buildOverrideRaw(raw);
    expect(dark.colorScheme).toBe('dark');
    expect(dark.themeSignals.activeMode).toBe('dark');
    // --bg, --surface, --text and --primary each take their dark value with the same weights.
    expect(new Set(hexes(dark))).toEqual(new Set(['#0b0f19', '#111827', '#e5e7eb', '#8b5cf6']));
    const light = raw.colors.find(
      (c) => c.value === 'rgb(255, 255, 255)' && c.contexts[0] === 'background',
    );
    const swapped = dark.colors.find((c) => c.value === '#0b0f19');
    expect(swapped.weight).toBe(light.weight);
    expect(swapped.effectiveHex).toBe('#0b0f19');
    // Colors without a variable (the white button text) stay unknown in the other theme.
    expect(
      dark.colors.some((c) => c.contexts.includes('interactive') && c.value === '#ffffff'),
    ).toBe(false);
    // Only colors: everything else is left empty rather than copied from the active theme.
    expect(dark.spacing).toEqual([]);
    expect(dark.textStyles).toEqual([]);
  });

  it('AC-F13.2 adds root-level rules of the other theme (html, body, :root colors)', () => {
    const raw = loadRaw('dark-class');
    expect(raw.themeRootRules).toEqual([
      {
        property: 'color',
        scope: 'dark-selector',
        selector: '.dark body',
        value: 'rgb(226, 232, 240)',
      },
    ]);
    const dark = buildOverrideRaw(raw);
    const text = dark.colors.find((c) => c.value === '#e2e8f0');
    expect(text.contexts).toEqual(['text']);
    expect(text.weight).toBeGreaterThan(0);
    expect(new Set(hexes(dark))).toEqual(new Set(['#020617', '#1e293b', '#38bdf8', '#e2e8f0']));
    expect(new Set(hexes(buildOverrideRaw(loadRaw('dark-attribute'))))).toEqual(
      new Set(['#18181b', '#27272a', '#f97316', '#d4d4d8']),
    );
  });

  it('AC-F13.2 builds the other theme without changing the captured page data', () => {
    const raw = loadRaw('dark-class');
    const before = JSON.stringify(raw);
    buildOverrideRaw(raw);
    analyze(capturesFor(raw));
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('AC-F13.2 resolves var() root rules and builds the light theme of a dark page', () => {
    const raw = {
      ...emptyRaw({
        url: 'https://example.com/',
        colorScheme: 'dark',
        viewport: { width: 1280, height: 720 },
      }),
      themeSignals: signals({ activeMode: 'dark', lightSelectors: ['.light'], darkMedia: true }),
      colors: [
        { value: 'rgb(11, 15, 25)', weight: 1000, count: 1, contexts: ['background'] },
        { value: 'rgb(229, 231, 235)', weight: 100, count: 3, contexts: ['text'] },
      ],
      variableDefs: [
        { name: '--bg', value: '#ffffff', scope: 'root', selector: ':root' },
        { name: '--bg', value: '#0b0f19', scope: 'dark-media', selector: ':root' },
        { name: '--ink', value: '#111827', scope: 'light-selector', selector: '.light' },
      ],
      themeRootRules: [
        {
          scope: 'light-selector',
          selector: '.light body',
          property: 'color',
          value: 'var(--ink)',
        },
      ],
    };
    const light = buildOverrideRaw(raw);
    expect(light.colorScheme).toBe('light');
    expect(light.colors.map((c) => [c.value, c.contexts[0]])).toEqual([
      ['#ffffff', 'background'],
      ['#111827', 'text'],
    ]);
  });

  it('AC-F13.2 returns null when the stylesheets define no other theme', () => {
    expect(buildOverrideRaw(loadRaw('classic'))).toBeNull();
    expect(buildOverrideRaw(loadRaw('translucent'))).toBeNull();
    expect(capturesFor(loadRaw('classic'))).toHaveLength(1);
  });

  it('AC-F13.3 an emulated capture of the other theme wins over stylesheet overrides', () => {
    // Path B itself (Emulation.setEmulatedMedia, cleared in finally) runs in e2e and plan tests.
    const light = loadRaw('dark-media');
    const emulated = { ...loadRaw('dark'), url: light.url };
    const captures = [
      ...capturesFor(light),
      captureOf(emulated, { mode: 'dark', method: 'emulated', kind: 'theme' }),
    ];
    const d = analyze(captures);
    expect(d.meta.modes).toEqual(['light', 'dark']);
    expect(d.meta.partial).not.toContain('dark');
    expect(d.semantic.background.dark).toBe('color:#0b0f19');
    expect(d.semantic['text-muted']?.dark).toBe('color:#9ca3af');
  });

  it('AC-F13.4 class and attribute sites are never emulated; Path A builds their dark theme', () => {
    for (const name of ['dark-class', 'dark-attribute']) {
      const raw = loadRaw(name);
      expect(canEmulateTheme(raw), name).toBe(false);
      const captures = capturesFor(raw);
      expect(
        captures.map((c) => [c.mode, c.method]),
        name,
      ).toEqual([
        ['light', 'computed'],
        ['dark', 'stylesheet-override'],
      ]);
    }
    expect(canEmulateTheme(loadRaw('dark-media'))).toBe(true);
    expect(canEmulateTheme(loadRaw('classic'))).toBe(false);
  });

  it('AC-F13.5 assigns semantic roles per mode and stores them as ModeRefs', () => {
    expect(analyzeFixture('dark-media').semantic).toEqual({
      background: { light: 'color:#ffffff', dark: 'color:#0b0f19' },
      surface: { light: 'color:#f3f4f6', dark: 'color:#111827' },
      text: { light: 'color:#111827', dark: 'color:#e5e7eb' },
      primary: { light: 'color:#2563eb', dark: 'color:#8b5cf6' },
    });
    expect(analyzeFixture('dark-class').semantic).toMatchObject({
      background: { light: 'color:#ffffff', dark: 'color:#020617' },
      surface: { light: 'color:#f3f4f6', dark: 'color:#1e293b' },
      text: { light: 'color:#111827', dark: 'color:#e2e8f0' },
      primary: { light: 'color:#2563eb', dark: 'color:#38bdf8' },
    });
    expect(analyzeFixture('dark-attribute').semantic).toMatchObject({
      background: { light: 'color:#ffffff', dark: 'color:#18181b' },
      text: { light: 'color:#111827', dark: 'color:#d4d4d8' },
      primary: { light: 'color:#2563eb', dark: 'color:#f97316' },
    });
  });

  it('AC-F13.5 tokens seen in only one theme carry that mode', () => {
    const d = analyzeFixture('dark-media');
    const modes = (id) => d.colors.find((c) => c.id === id).modes;
    expect(modes('color:#2563eb')).toEqual(['light']);
    expect(modes('color:#8b5cf6')).toEqual(['dark']);
    // #111827 is the light text and the dark surface.
    expect(modes('color:#111827')).toEqual(['dark', 'light']);
  });

  it('AC-F13.6 lists captured themes and marks dark partial when it came from overrides', () => {
    for (const name of ['dark-media', 'dark-class', 'dark-attribute']) {
      const d = analyzeFixture(name);
      expect(d.meta.modes, name).toEqual(['light', 'dark']);
      expect(d.meta.partial, name).toContain('dark');
      expect(d.meta.pages, name).toHaveLength(1);
    }
    const dark = analyzeFixture('dark-media').colors.find((c) => c.id === 'color:#8b5cf6');
    expect(dark.confidence.reasons).toContain('From stylesheet overrides only');
  });

  it('AC-F13.7 exports write paired tokens with the site mechanism', () => {
    const media = analyzeFixture('dark-media');
    const css = exportFile('css-vars', media, '2.0.0');
    const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark) {'));
    expect(darkBlock).toMatch(/^@media \(prefers-color-scheme: dark\) \{\s*:root \{/);
    expect(darkBlock).toContain('--color-primary: var(--color-purple-600);');
    expect(css).toContain('--color-purple-600: #8b5cf6;');
    const cls = analyzeFixture('dark-class');
    const v4 = exportFile('tailwind-v4', cls, '2.0.0');
    expect(v4).toContain('@custom-variant dark');
    expect(v4).toContain('.dark');
    expect(exportFile('tailwind-v3', cls, '2.0.0')).toMatch(/darkMode: \['selector', '\.dark'\]/);
    expect(exportFile('design-md', cls, '2.0.0')).toMatch(/\| Role\s+\| Light[^\n]*\| Dark/);
  });

  it('AC-F13.9 a site with no dark support produces one mode', () => {
    for (const name of ['classic', 'translucent', 'variables']) {
      const d = analyzeFixture(name);
      expect(d.meta.modes, name).toEqual(['light']);
      expect(d.meta.themeMechanism, name).toBe('none');
      expect(d.meta.partial, name).not.toContain('dark');
      for (const ref of Object.values(d.semantic)) expect(Object.keys(ref)).toEqual(['light']);
    }
    // A dark-only page is one mode too.
    expect(analyzeRaw(loadRaw('dark')).meta.modes).toEqual(['dark']);
  });
});
