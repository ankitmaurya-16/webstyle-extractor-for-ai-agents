import { describe, expect, it } from 'vitest';
import {
  applySiteNames,
  bareColor,
  lengthCategory,
  parseVariableValue,
  pickVariable,
  rolesFromVariables,
  setPreferredName,
  valueMatches,
  variableCandidates,
} from '../../../src/analyze/variables.js';
import { resolveVars } from '../../../src/collect/stylesheets.js';
import {
  EXCLUDED_PREFIXES,
  deriveName,
  isExcludedVariable,
  kebab,
  roleFromName,
} from '../../../src/detect/variable-rules.js';
import { applyEdit } from '../../../src/edit/apply-edit.js';
import { exportFile } from '../../../src/export/index.js';
import { analyzeFixture, analyzeRaw, loadRaw, rawSnapshot, stat } from '../helpers.js';

const def = (name, value, scope = 'root', selector = ':root') => ({ name, value, scope, selector });
const candidate = (name, value, usage = 0, scope = 'root') => ({
  name,
  scope,
  usage,
  parsed: parseVariableValue(value),
});
const colorToken = (hex, name, extra = {}) => ({
  id: `color:${hex}`,
  name,
  hex,
  alpha: 1,
  mergedFrom: [],
  ...extra,
});
const byId = (d, id) => d.colors.find((c) => c.id === id);
const noSemantic = { useSiteVariableNames: true, semanticIds: new Set() };

describe('collecting variables (F10)', () => {
  it('AC-F10.1 resolves var() chains with fallbacks and stops cycles', () => {
    const vars = {
      '--brand': '#2563eb',
      '--action': 'var(--brand)',
      '--button': 'var(--action)',
      '--a': 'var(--b)',
      '--b': 'var(--a)',
      '--self': 'var(--self, red)',
    };
    const lookup = (name) => vars[name];
    expect(resolveVars('var(--button)', lookup)).toBe('#2563eb');
    expect(resolveVars('var(--missing, var(--brand))', lookup)).toBe('#2563eb');
    expect(resolveVars('0 0 0 1px var(--action)', lookup)).toBe('0 0 0 1px #2563eb');
    expect(resolveVars('var(--a)', lookup)).toBe('');
    expect(resolveVars('var(--self)', lookup)).toBe('red');
  });

  it('AC-F10.1 uses the fallback of a reference to a cyclic variable', () => {
    const vars = { '--a': 'var(--b)', '--b': 'var(--a)' };
    expect(resolveVars('var(--a, #111827)', (name) => vars[name])).toBe('#111827');
  });

  it('AC-F10.1 collects root and theme-scope definitions from readable sheets', () => {
    const raw = loadRaw('variables');
    const value = (name) => raw.variableDefs.find((d) => d.name === name)?.value;
    // The chain --color-action -> --brand-primary is resolved.
    expect(value('--color-action')).toBe('#2563eb');
    expect(value('--background')).toBe('0 0% 100%');
    // The cyclic pair resolves to nothing and is not kept.
    expect(value('--loop-a')).toBeUndefined();
    expect(value('--loop-b')).toBeUndefined();
    expect(raw.variableDefs.every((d) => d.scope === 'root')).toBe(true);
    const scopes = (name) =>
      loadRaw(name)
        .variableDefs.filter((d) => d.name === '--primary')
        .map((d) => [d.scope, d.selector, d.value]);
    expect(scopes('dark-media')).toEqual([
      ['root', ':root', '#2563eb'],
      ['dark-media', ':root', '#8b5cf6'],
    ]);
    expect(scopes('dark-class')).toEqual([
      ['root', ':root', '#2563eb'],
      ['dark-selector', '.dark', '#38bdf8'],
    ]);
    expect(scopes('dark-attribute')).toEqual([
      ['root', ':root', '#2563eb'],
      ['dark-selector', '[data-theme="dark"]', '#f97316'],
    ]);
  });

  it('AC-F10.2 counts var() references per variable', () => {
    const raw = loadRaw('variables');
    expect(raw.variableUsage).toMatchObject({
      '--space-4': 5,
      '--color-action': 2,
      '--brand-primary': 1,
      '--radius-md': 2,
      '--accent-rgb': 2,
      '--tw-ring-color': 3,
    });
    const { light } = variableCandidates(raw.variableDefs, raw.variableUsage, 16);
    expect(light.find((c) => c.name === '--space-4').usage).toBe(5);
    expect(variableCandidates([def('--unused', '#123456')], {}, 16).light[0].usage).toBe(0);
  });

  it('AC-F10.3 parses bare HSL and bare RGB channel triplets as colors', () => {
    expect(bareColor('222.2 47.4% 11.2%')).toBe('hsl(222.2 47.4% 11.2%)');
    expect(bareColor('0 0% 100% / 50%')).toBe('hsl(0 0% 100% / 50%)');
    expect(bareColor('217deg 91% 60%')).toBe('hsl(217 91% 60%)');
    expect(bareColor('37 99 235')).toBe('rgb(37 99 235)');
    expect(bareColor('37 99 235 / 0.5')).toBe('rgb(37 99 235 / 0.5)');
    expect(bareColor('300 99 235')).toBeNull();
    expect(bareColor('16px 24px')).toBeNull();
    expect(parseVariableValue('0 0% 100%')).toEqual({ type: 'color', hex: '#ffffff', alpha: 1 });
    expect(parseVariableValue('222.2 47.4% 11.2%')).toMatchObject({
      type: 'color',
      hex: '#0f172a',
    });
    expect(parseVariableValue('37 99 235')).toMatchObject({ type: 'color', hex: '#2563eb' });
    expect(parseVariableValue('0 0 0 / 0.1')).toMatchObject({
      type: 'color',
      hex: '#0000001a',
      alpha: 0.1,
    });
    // The fixture's triplets name the colors the page shows.
    const d = analyzeFixture('variables');
    expect(byId(d, 'color:#ffffff').siteVariable).toBe('--background');
    expect(byId(d, 'color:#0f172a').siteVariable).toBe('--foreground');
    expect(byId(d, 'color:#db2777').siteVariable).toBe('--accent-rgb');
  });

  it('parses other variable types', () => {
    expect(parseVariableValue('16px')).toEqual({ type: 'length', px: 16 });
    expect(parseVariableValue('1.5rem')).toEqual({ type: 'length', px: 24 });
    expect(parseVariableValue('150ms')).toEqual({ type: 'duration', ms: 150 });
    expect(parseVariableValue('0.2s')).toEqual({ type: 'duration', ms: 200 });
    expect(parseVariableValue('cubic-bezier(0.4, 0, 0.2, 1)')).toEqual({
      type: 'easing',
      css: 'cubic-bezier(0.4, 0, 0.2, 1)',
    });
    expect(parseVariableValue('50')).toEqual({ type: 'number', value: 50 });
    expect(parseVariableValue('"Inter", system-ui, sans-serif')).toMatchObject({
      type: 'font',
      first: 'inter',
    });
    expect(parseVariableValue('0 1px 2px rgb(0 0 0 / 0.05)')).toMatchObject({ type: 'shadow' });
    expect(parseVariableValue('')).toBeNull();
    expect(parseVariableValue('auto')).toBeNull();
  });
});

describe('naming tokens after site variables (F10)', () => {
  it('AC-F10.4 never names tokens after excluded framework prefixes', () => {
    expect(EXCLUDED_PREFIXES).toEqual(['--tw-', '--un-']);
    expect(isExcludedVariable('--tw-ring-color')).toBe(true);
    expect(isExcludedVariable('--un-text-opacity')).toBe(true);
    expect(isExcludedVariable('--brand-tw')).toBe(false);
    const { light } = variableCandidates(
      [def('--tw-ring-color', '#2563eb'), def('--un-bg', '#ffffff'), def('--brand', '#2563eb')],
      { '--tw-ring-color': 99 },
      16,
    );
    expect(light.map((c) => c.name)).toEqual(['--brand']);
    // In the fixture --tw-ring-color is referenced more than --color-action, yet never wins.
    const d = analyzeFixture('variables');
    expect(byId(d, 'color:#2563eb').siteVariable).toBe('--color-action');
    expect(byId(d, 'color:#e5e7eb').siteVariable).toBe('--border-subtle');
    const all = Object.values(d)
      .flatMap((v) => (Array.isArray(v) ? v : []))
      .concat(d.spacing.tokens, d.typography.families, d.typography.sizes);
    expect(all.filter((t) => /^--(tw|un)-/.test(t?.siteVariable ?? ''))).toEqual([]);
  });

  it('AC-F10.5 takes the matching variable with the most references', () => {
    const token = colorToken('#2563eb', 'blue-600');
    const list = [
      candidate('--brand-primary', '#2563eb', 1),
      candidate('--color-action', '#2563eb', 2),
      candidate('--other', '#1d4ed8', 9),
    ];
    expect(pickVariable('color', token, list, false).name).toBe('--color-action');
  });

  it('AC-F10.5 breaks ties with role-word names for semantic tokens, then the shortest name', () => {
    const token = colorToken('#2563eb', 'blue-600');
    const list = [candidate('--blue', '#2563eb', 3), candidate('--brand-main', '#2563eb', 3)];
    expect(pickVariable('color', token, list, true).name).toBe('--brand-main');
    expect(pickVariable('color', token, list, false).name).toBe('--blue');
    const sizes = [candidate('--space-md', '16px', 1), candidate('--gap', '16px', 1)];
    expect(pickVariable('space', { id: 'space:16', px: 16 }, sizes, false).name).toBe('--gap');
    expect(pickVariable('color', token, [candidate('--x', '#ffffff', 5)], false)).toBeNull();
  });

  it('AC-F10.5 matches by type: colors within OKLab 0.005 with alpha, sizes exact px', () => {
    const parsed = (v) => parseVariableValue(v);
    const blue = colorToken('#2563eb', 'blue-600');
    expect(valueMatches('color', blue, parsed('#2563ea'))).toBe(true);
    expect(valueMatches('color', blue, parsed('#3063eb'))).toBe(false);
    expect(valueMatches('color', blue, parsed('rgb(37 99 235 / 0.5)'))).toBe(false);
    const translucent = colorToken('#0000001a', 'black/10', { alpha: 0.1 });
    expect(valueMatches('color', translucent, parsed('rgb(0 0 0 / 0.1)'))).toBe(true);
    expect(valueMatches('space', { px: 16 }, parsed('1rem'), '--space-4')).toBe(true);
    expect(valueMatches('space', { px: 16 }, parsed('16.5px'), '--space-4')).toBe(false);
    // A length variable names only the category its name points to.
    expect(lengthCategory('--radius-md')).toBe('radius');
    expect(valueMatches('space', { px: 8 }, parsed('8px'), '--radius-md')).toBe(false);
    expect(valueMatches('radius', { px: 8 }, parsed('8px'), '--radius-md')).toBe(true);
    expect(valueMatches('duration', { ms: 150 }, parsed('0.15s'))).toBe(true);
    expect(
      valueMatches('font', { stack: ['Inter', 'sans-serif'] }, parsed('Inter, sans-serif')),
    ).toBe(true);
  });

  it('AC-F10.6 strips -- and category prefixes and converts to lowercase kebab-case', () => {
    expect(deriveName('--color-brand-primary')).toBe('brand-primary');
    expect(deriveName('--colors-ink')).toBe('ink');
    expect(deriveName('--clr-accent')).toBe('accent');
    expect(deriveName('--wp--preset--color--vivid-red')).toBe('vivid-red');
    expect(deriveName('--radius-md')).toBe('md');
    expect(deriveName('--shadow-card')).toBe('card');
    expect(deriveName('--font-heading')).toBe('heading');
    expect(deriveName('--duration-fast')).toBe('fast');
    expect(deriveName('--ease-out')).toBe('out');
    expect(deriveName('--zindex-modal')).toBe('modal');
    expect(deriveName('--bp-tablet')).toBe('tablet');
    expect(deriveName('--surfaceRaised')).toBe('surface-raised');
    expect(deriveName('--Brand_Primary')).toBe('brand-primary');
    expect(deriveName('--brand-primary')).toBe('brand-primary');
    expect(kebab('fooBar__Baz')).toBe('foo-bar-baz');
  });

  it('AC-F10.6 keeps the full variable name when derived names collide in a category', () => {
    const tokens = [colorToken('#2563eb', 'blue-600'), colorToken('#1d4ed8', 'blue-700')];
    applySiteNames(
      { color: tokens },
      [candidate('--color-primary', '#2563eb', 2), candidate('--primary', '#1d4ed8', 2)],
      noSemantic,
    );
    expect(tokens.map((t) => t.name)).toEqual(['color-primary', 'primary']);
    // A derived name equal to another token's generated name also collides.
    const pair = [colorToken('#ffffff', 'white'), colorToken('#f9fafb', 'gray-100')];
    applySiteNames({ color: pair }, [candidate('--color-white', '#f9fafb', 1)], noSemantic);
    expect(pair.map((t) => t.name)).toEqual(['white', 'color-white']);
    // The same derived name in another category is no collision.
    const lists = {
      color: [colorToken('#2563eb', 'blue-600')],
      radius: [{ id: 'radius:8', name: 'radius-md', px: 8 }],
    };
    applySiteNames(
      lists,
      [candidate('--color-md', '#2563eb', 1), candidate('--radius-md', '8px', 1)],
      noSemantic,
    );
    expect([lists.color[0].name, lists.radius[0].name]).toEqual(['md', 'md']);
  });

  it('AC-F10.6 names only one token per variable when a themed variable matches both themes', () => {
    // --bg is #ffffff in the light scope and #0b0f19 in the dark scope; light is primary.
    const tokens = [colorToken('#ffffff', 'white'), colorToken('#0b0f19', 'gray-900')];
    applySiteNames(
      { color: tokens },
      [candidate('--bg', '#ffffff', 1), candidate('--bg', '#0b0f19', 1, 'dark-media')],
      noSemantic,
    );
    expect(tokens.map((t) => [t.name, t.siteVariable])).toEqual([
      ['bg', '--bg'],
      ['gray-900', null],
    ]);
    const d = analyzeFixture('dark-media');
    const names = d.colors.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(d.colors.filter((c) => c.siteVariable === '--bg').map((c) => c.id)).toEqual([
      'color:#ffffff',
    ]);
  });

  it('AC-F10.7 uses the site name with the generated name as an alias, and the reverse when off', () => {
    const on = analyzeFixture('variables');
    expect(byId(on, 'color:#f3f4f6')).toMatchObject({
      name: 'surface-raised',
      aliases: ['gray-100'],
      siteVariable: '--surface-raised',
      siteName: 'surface-raised',
      generatedName: 'gray-100',
    });
    expect(on.radii.find((r) => r.id === 'radius:8')).toMatchObject({
      name: 'md',
      aliases: ['radius-sm'],
    });
    const off = analyzeFixture('variables', { useSiteVariableNames: false });
    expect(byId(off, 'color:#f3f4f6')).toMatchObject({
      name: 'gray-100',
      aliases: ['surface-raised'],
      siteVariable: '--surface-raised',
    });
    // Tokens without a site variable have no alias either way.
    const t = { name: 'gray-500', generatedName: 'gray-500', siteName: null };
    setPreferredName(t, true);
    expect(t).toMatchObject({ name: 'gray-500', aliases: [] });
  });

  it('AC-F10.7 the useSiteName edit overrides the global setting per token', () => {
    const on = analyzeFixture('variables');
    const generated = applyEdit(on, { kind: 'useSiteName', tokenId: 'color:#f3f4f6', use: false });
    expect(byId(generated.design, 'color:#f3f4f6')).toMatchObject({
      name: 'gray-100',
      aliases: ['surface-raised'],
    });
    const off = analyzeFixture('variables', { useSiteVariableNames: false });
    const site = applyEdit(off, { kind: 'useSiteName', tokenId: 'color:#f3f4f6', use: true });
    expect(byId(site.design, 'color:#f3f4f6').name).toBe('surface-raised');
    // A token with no site variable cannot switch.
    const plain = analyzeFixture('classic');
    expect(applyEdit(plain, { kind: 'useSiteName', tokenId: 'color:#e5e7eb', use: true })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('AC-F10.8 reads semantic roles from role words in variable names', () => {
    const cases = {
      '--background': 'background',
      '--bg': 'background',
      '--page': 'background',
      '--surface-raised': 'surface',
      '--card': 'surface',
      '--bg-raised': 'surface',
      '--foreground': 'text',
      '--text': 'text',
      '--text-primary': 'text',
      '--muted-foreground': 'text-muted',
      '--text-secondary': 'text-muted',
      '--border': 'border',
      '--divider': 'border',
      '--brand-primary': 'primary',
      '--primary': 'primary',
      '--accent': 'accent',
      '--ring': 'focus-ring',
      '--focus': 'focus-ring',
      '--destructive': 'danger',
      '--error': 'danger',
      '--success': 'success',
      '--positive': 'success',
      '--warning': 'warning',
      '--caution': 'warning',
      '--overlay': 'overlay',
      '--scrim': 'overlay',
      '--primary-foreground': null,
      '--blue-500': null,
      '--color': null,
    };
    for (const [name, role] of Object.entries(cases)) expect(roleFromName(name), name).toBe(role);
  });

  it('AC-F10.8 a leading border word wins over subtle', () => {
    expect(roleFromName('--border-subtle')).toBe('border');
    expect(roleFromName('--bg-subtle')).toBe('surface');
    expect(analyzeFixture('variables').semantic['text-muted']).toBeUndefined();
  });

  it('AC-F10.8 role words assign roles with high confidence, overriding usage rules', () => {
    const tokens = [colorToken('#ffffff', 'white'), colorToken('#f3f4f6', 'gray-100')];
    const roles = rolesFromVariables(tokens, [candidate('--page-bg', '#f3f4f6', 1)]);
    expect(roles.background.token.hex).toBe('#f3f4f6');
    // On a page where usage makes white the background, --background names the gray.
    const d = analyzeRaw(
      rawSnapshot({
        colors: [
          stat('rgb(255, 255, 255)', 1000, ['background'], 5),
          stat('rgb(243, 244, 246)', 400, ['background'], 5),
          stat('rgb(17, 24, 39)', 500, ['text'], 5),
        ],
        variableDefs: [def('--background', '#f3f4f6')],
        variableUsage: { '--background': 3 },
      }),
    );
    expect(d.semantic.background).toEqual({ light: 'color:#f3f4f6' });
    expect(d.roleConfidence.background.light.reasons).toContain('Named --background on the site');
    const fixture = analyzeFixture('variables');
    expect(fixture.semantic).toMatchObject({
      background: { light: 'color:#ffffff' },
      surface: { light: 'color:#f3f4f6' },
      text: { light: 'color:#0f172a' },
      primary: { light: 'color:#2563eb' },
      accent: { light: 'color:#db2777' },
    });
    expect(fixture.roleConfidence.text.light.level).toBe('high');
    expect(fixture.roleConfidence.background.light.level).toBe('high');
  });

  it('AC-F10.9 DESIGN.md shows site variables and variables.css writes them verbatim', () => {
    const d = analyzeFixture('variables');
    const md = exportFile('design-md', d, '2.0.0');
    expect(md).toMatch(/\| surface-raised\s+\| #f3f4f6 \|[^\n]*\| --surface-raised \|/);
    expect(md).toMatch(/\| action\s+\| #2563eb \|[^\n]*\| --color-action\s+\|/);
    const css = exportFile('css-vars', d, '2.0.0');
    for (const line of [
      '--background: #ffffff;',
      '--surface-raised: #f3f4f6;',
      '--color-action: #2563eb;',
      '--space-4: 16px;',
      '--radius-md: 8px;',
    ]) {
      expect(css).toContain(line);
    }
  });

  it('AC-F10.10 matches variables found only through the computed root style', () => {
    const d = analyzeRaw(
      rawSnapshot({
        stylesheets: { readable: 0, unreadable: 1 },
        colors: [
          stat('rgb(255, 255, 255)', 1000, ['background'], 3),
          stat('rgb(37, 99, 235)', 100, ['background', 'interactive'], 3),
        ],
        variableDefs: [def('--brand', '#2563eb', 'root', ':root (computed)')],
        variableUsage: {},
      }),
    );
    expect(byId(d, 'color:#2563eb')).toMatchObject({ name: 'brand', siteVariable: '--brand' });
    expect(d.meta.partial).toContain('cssVariables');
    // A v1 snapshot's cssVariables map also counts as computed-root variables.
    const v1 = analyzeRaw(
      rawSnapshot({
        stylesheets: { readable: 0, unreadable: 1 },
        colors: [stat('rgb(37, 99, 235)', 100, ['background'], 3)],
        cssVariables: { '--brand': '#2563eb' },
      }),
    );
    expect(byId(v1, 'color:#2563eb').siteVariable).toBe('--brand');
  });
});
