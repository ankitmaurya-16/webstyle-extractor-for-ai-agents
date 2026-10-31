import { describe, expect, it } from 'vitest';
import {
  borderValue,
  buildFocusRing,
  buildRecipes,
  collapseBox,
  recipeName,
  referenceStyles,
} from '../../../src/analyze/recipes.js';
import { exportDesignMd } from '../../../src/export/design-md.js';
import { analyzeFixture, analyzeRaw, loadRaw } from '../helpers.js';

const components = analyzeFixture('components');
const states = analyzeFixture('states');
const byKind = (d, kind) => d.components.filter((r) => r.kind === kind);
const recipe = (d, kind, variant) =>
  d.components.find((r) => r.kind === kind && r.variant === variant);
const light = (r, state = 'default') => r.byMode.light[state];

/** Token lists in the shape buildRecipes takes, with the tokens the tests reference. */
const tokens = (overrides = {}) => ({
  gradients: [],
  radii: [
    { id: 'radius:6', name: 'radius-md', px: 6 },
    { id: 'radius:9999', name: 'radius-full', px: 9999 },
  ],
  families: [{ id: 'family:inter', name: 'sans', stack: ['Inter', 'sans-serif'] }],
  sizes: [{ id: 'text:14', name: 'sm', sizePx: 14 }],
  shadows: [{ id: 'shadow:1', name: 'shadow-sm', value: 'rgba(0, 0, 0, 0.05) 0px 1px 2px 0px' }],
  borderWidths: [{ id: 'border:1', name: 'border-1', px: 1 }],
  spacing: [{ id: 'space:16', name: 'space-4', px: 16 }],
  opacities: [{ id: 'opacity:0.5', name: 'opacity-50', value: 0.5 }],
  ...overrides,
});
const COLORS = {
  'rgb(37, 99, 235)': { id: 'color:#2563eb', name: 'blue-600', family: 'blue' },
  'rgb(255, 255, 255)': { id: 'color:#ffffff', name: 'white', family: 'white' },
  'rgb(229, 231, 235)': { id: 'color:#e5e7eb', name: 'gray-200', family: 'gray' },
  'rgb(22, 163, 74)': { id: 'color:#16a34a', name: 'green-600', family: 'green' },
  'rgb(220, 38, 38)': { id: 'color:#dc2626', name: 'red-600', family: 'red' },
  'rgb(245, 158, 11)': { id: 'color:#f59e0b', name: 'amber-500', family: 'orange' },
};
const findColor = (value) => COLORS[value] ?? null;
const sample = (kind, key, count, styles, hints = []) => ({ kind, key, count, styles, hints });
const build = (raw, primary = 'color:#2563eb') =>
  buildRecipes(
    { light: { rootFontSizePx: 16, samples: [], stateSamples: [], representatives: [], ...raw } },
    tokens(),
    findColor,
    {
      light: primary,
    },
  );

describe('recipe values (F5)', () => {
  it('AC-F5.2 makes the most common button primary when its fill is the primary color, plus one secondary', () => {
    const buttons = byKind(components, 'button');
    expect(buttons.map((b) => b.variant)).toEqual(['primary']);
    expect(light(buttons[0])['background-color']).toMatchObject({ raw: '#2563eb' });
    expect(byKind(states, 'button').map((b) => b.variant)).toEqual(['primary', 'secondary']);
  });

  it('AC-F5.2 keeps at most two button recipes and names a non-primary first button default', () => {
    const out = build({
      samples: [
        sample('button', 'a', 5, {
          'background-color': 'rgb(229, 231, 235)',
          color: 'rgb(0, 0, 0)',
        }),
        sample('button', 'b', 3, {
          'background-color': 'rgb(255, 255, 255)',
          color: 'rgb(0, 0, 0)',
        }),
        sample('button', 'c', 2, { 'background-color': 'rgb(37, 99, 235)', color: 'rgb(0, 0, 0)' }),
      ],
    });
    expect(out.map((r) => r.variant)).toEqual(['default', 'secondary']);
  });

  it('AC-F5.6 stores values that match tokens as references and others raw', () => {
    const s = referenceStyles(
      {
        'background-color': 'rgb(37, 99, 235)',
        color: 'rgb(1, 2, 3)',
        'border-radius': '6px',
        padding: '8px 16px 8px 16px',
        'font-family': 'Inter, sans-serif',
        'font-size': '14px',
        'box-shadow': 'rgba(0, 0, 0, 0.05) 0px 1px 2px 0px',
        gap: '16px',
        opacity: '0.5',
        border: '1px solid rgb(37, 99, 235)',
        'line-height': '20px',
      },
      tokens(),
      findColor,
      16,
    );
    expect(s).toEqual({
      'background-color': { ref: 'color.blue-600', id: 'color:#2563eb', raw: '#2563eb' },
      color: '#010203',
      'border-radius': { ref: 'radius.radius-md', id: 'radius:6', raw: '6px' },
      padding: '8px 16px',
      'font-family': { ref: 'font.sans', id: 'family:inter', raw: 'Inter, sans-serif' },
      'font-size': { ref: 'text.sm', id: 'text:14', raw: '14px' },
      'box-shadow': {
        ref: 'shadow.shadow-sm',
        id: 'shadow:1',
        raw: 'rgba(0, 0, 0, 0.05) 0px 1px 2px 0px',
      },
      gap: { ref: 'space.space-4', id: 'space:16', raw: '16px' },
      opacity: { ref: 'opacity.opacity-50', id: 'opacity:0.5', raw: '0.5' },
      border: '1px solid #2563eb',
      'line-height': '20px',
    });
  });

  it('collapses box shorthands and normalizes borders', () => {
    expect(collapseBox('8px 8px 8px 8px')).toBe('8px');
    expect(collapseBox('8px 16px 8px 16px')).toBe('8px 16px');
    expect(collapseBox('1px 2px 3px 2px')).toBe('1px 2px 3px');
    expect(collapseBox('1px 2px 3px 4px')).toBe('1px 2px 3px 4px');
    expect(borderValue('2px solid rgba(0, 0, 0, 0)')).toBe('none');
    expect(borderValue('none')).toBe('none');
    expect(borderValue('1px dashed rgb(255, 0, 0)')).toBe('1px dashed #ff0000');
  });
});

describe('interaction states in recipes (F12)', () => {
  it('AC-F12.4 recipes carry only the changed properties per state', () => {
    const primary = recipe(states, 'button', 'primary');
    expect(Object.keys(primary.byMode.light).sort()).toEqual([
      'active',
      'default',
      'focus-visible',
      'hover',
    ]);
    expect(light(primary, 'hover')).toEqual({ 'background-color': '#1e40af' });
    expect(Object.keys(light(primary, 'active')).sort()).toEqual([
      'background-color',
      'box-shadow',
    ]);
    expect(primary.stateSource).toBe('stylesheet');
    expect(recipe(states, 'heading', 'h1').stateSource).toBe('none');
  });

  it('AC-F12.4 state values that match tokens become references', () => {
    const input = recipe(states, 'input', 'default');
    expect(light(input, 'focus').border).toBe('1px solid #2563eb');
    const link = recipe(states, 'link', 'default');
    expect(light(link, 'hover')).toEqual({ color: '#1e3a8a' });
  });

  it('AC-F12.6 the focus ring comes from :focus-visible, with outline, offset and the focus-ring role', () => {
    expect(states.focusRing).toMatchObject({
      outline: '2px solid #f59e0b',
      offsetPx: 2,
      boxShadow: null,
      colorTokenId: 'color:#f59e0b',
      source: 'stylesheet',
    });
    expect(states.semantic['focus-ring']).toEqual({ light: 'color:#f59e0b' });
  });

  it('AC-F12.6 prefers :focus-visible over :focus and reads a box-shadow ring', () => {
    const s = (kind, state, styles, source = 'stylesheet') => ({
      kind,
      variant: 'v',
      state,
      styles,
      source,
    });
    const ring = buildFocusRing(
      [
        {
          stateSamples: [
            s('input', 'focus', { outline: '1px solid rgb(0, 0, 0)' }),
            s('button', 'focus-visible', { 'box-shadow': '0 0 0 3px rgba(37, 99, 235, 0.5)' }),
          ],
        },
      ],
      () => null,
    );
    expect(ring).toMatchObject({
      outline: null,
      offsetPx: null,
      boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.5)',
      colorHex: '#2563eb80',
    });
    const fallback = buildFocusRing(
      [{ stateSamples: [s('link', 'focus', { outline: '2px solid rgb(0, 0, 255)' })] }],
      () => null,
    );
    expect(fallback).toMatchObject({
      outline: '2px solid #0000ff',
      offsetPx: 0,
      source: 'stylesheet',
    });
    const forced = buildFocusRing(
      [
        {
          stateSamples: [
            s('button', 'focus-visible', { outline: '2px solid red' }),
            s('button', 'focus-visible', { outline: '3px solid blue' }, 'forced'),
          ],
        },
      ],
      () => null,
    );
    expect(forced).toMatchObject({ outline: '3px solid #0000ff', source: 'forced' });
    // Cards and other kinds never decide the ring.
    expect(
      buildFocusRing(
        [{ stateSamples: [s('card', 'focus', { outline: '2px solid red' })] }],
        () => null,
      ).source,
    ).toBe('browser-default');
  });

  it('AC-F12.7 with no focus style the source is browser-default, the report flags it and DESIGN.md says so', () => {
    expect(components.focusRing.source).toBe('browser-default');
    expect(components.audit.missingFocusStyle).toBe(true);
    expect(states.audit.missingFocusStyle).toBe(false);
    const md = exportDesignMd(components, '2.0.0');
    expect(md).toContain('No focus style was found; the site relies on the browser default.');
  });

  it('AC-F12.9 DESIGN.md lists state differences and tells the agent to use :focus-visible', () => {
    const md = exportDesignMd(states, '2.0.0');
    expect(md).toMatch(/\| hover\s+\| background #1e40af/);
    expect(md).toMatch(/\| focus-visible \| outline 2px solid focus-ring/);
    expect(md).toContain('Every interactive element shows the focus ring on `:focus-visible`');
  });

  it('AC-F12.10 meta.partial includes states when sheets were unreadable and states were not forced', () => {
    expect(states.meta.partial).not.toContain('states');
    const raw = { ...loadRaw('states'), stylesheets: { readable: 1, unreadable: 1 } };
    expect(analyzeRaw(raw).meta.partial).toContain('states');
    expect(analyzeFixture('cross-origin').meta.partial).toContain('states');
  });
});

describe('more component kinds (F20)', () => {
  it('AC-F20.1 builds recipes for cards, badges, the nav bar, tabs, alerts and the table', () => {
    const kinds = [...new Set(components.components.map((r) => r.kind))];
    expect(kinds).toEqual([
      'button',
      'input',
      'link',
      'card',
      'badge',
      'alert',
      'navbar',
      'tabs',
      'table',
      'heading',
    ]);
    expect(light(recipe(components, 'card', 'default'))).toMatchObject({
      border: '1px solid #e5e7eb',
      'border-radius': { raw: '8px' },
      padding: '16px',
    });
    expect(light(recipe(components, 'navbar', 'default'))).toMatchObject({
      height: '56px',
      'background-color': { raw: '#111827' },
    });
  });

  it('AC-F20.1 a card with a hover rule is the interactive variant', () => {
    const interactive = recipe(components, 'card', 'interactive');
    expect(interactive.stateSource).toBe('stylesheet');
    expect(light(interactive, 'hover')).toEqual({
      'box-shadow': 'rgba(0, 0, 0, 0.15) 0px 10px 15px',
    });
  });

  it('AC-F20.2 pages without a kind produce no recipe for it', () => {
    for (const kind of ['card', 'badge', 'navbar', 'tabs', 'alert', 'table']) {
      expect(byKind(states, kind), kind).toEqual([]);
    }
    expect(build({ samples: [] })).toEqual([]);
  });

  it('AC-F20.3 groups badge and alert variants by background hue family', () => {
    expect(byKind(components, 'badge').map((r) => r.variant)).toEqual([
      'neutral',
      'success',
      'danger',
    ]);
    expect(byKind(components, 'alert').map((r) => r.variant)).toEqual([
      'success',
      'warning',
      'danger',
    ]);
    const out = build({
      samples: [
        sample('badge', 'p', 2, { 'background-color': 'rgb(37, 99, 235)' }),
        sample('badge', 'w', 2, { 'background-color': 'rgb(245, 158, 11)' }),
        // A fill too small to become a token still groups by its own hue.
        sample('badge', 'r', 2, {
          'background-color': 'rgb(185, 28, 28)',
          color: 'rgb(255, 255, 255)',
        }),
        sample('alert', 'n', 1, { 'background-color': 'rgb(229, 231, 235)' }),
      ],
    });
    expect(out.map((r) => `${r.kind}:${r.variant}`)).toEqual([
      'badge:primary',
      'badge:warning',
      'badge:danger',
      'alert:info',
    ]);
  });

  it('AC-F20.3 a badge needs repetition or a badge-like class', () => {
    const fill = { 'background-color': 'rgb(22, 163, 74)' };
    expect(build({ samples: [sample('badge', 'x', 1, fill)] })).toEqual([]);
    expect(
      build({ samples: [sample('badge', 'x', 1, fill, ['class'])] }).map((r) => r.variant),
    ).toEqual(['success']);
  });

  it('AC-F20.4 tabs record default and selected styles; nav bars record the active link', () => {
    const tabs = light(recipe(components, 'tabs', 'default'));
    expect(tabs).toMatchObject({
      'tab-color': { raw: '#6b7280' },
      'selected-color': { raw: '#2563eb' },
      'selected-border': '2px solid #2563eb',
      'selected-font-weight': '600',
    });
    const nav = light(recipe(components, 'navbar', 'default'));
    expect(nav).toMatchObject({
      'link-color': { raw: '#d1d5db' },
      'active-color': { raw: '#ffffff' },
      'active-font-weight': '700',
      'active-border': '2px solid #2563eb',
    });
  });

  it('AC-F20.5 tables record header, body padding, dividers and zebra striping', () => {
    expect(light(recipe(components, 'table', 'default'))).toMatchObject({
      'header-background-color': '#f3f4f6',
      'header-font-weight': '700',
      'cell-padding': '8px 12px',
      divider: '1px solid #e5e7eb',
      zebra: { raw: '#f9fafb' },
    });
  });

  it('AC-F20.6 keeps at most 3 variants per kind, by usage', () => {
    // components.html has four badge hues: neutral x4, success x3, danger x2, warning x1.
    expect(byKind(components, 'badge')).toHaveLength(3);
    expect(byKind(components, 'badge').map((r) => r.count)).toEqual([4, 3, 2]);
    const many = [
      'rgb(229, 231, 235)',
      'rgb(37, 99, 235)',
      'rgb(22, 163, 74)',
      'rgb(245, 158, 11)',
      'rgb(220, 38, 38)',
    ];
    const out = build({
      samples: many.map((bg, i) => sample('alert', `a${i}`, 10 - i, { 'background-color': bg })),
    });
    expect(out).toHaveLength(3);
  });

  it('AC-F20.7 recipe values reference tokens where they match, and names are generic labels', () => {
    expect(light(recipe(components, 'card', 'default'))['border-radius']).toMatchObject({
      ref: expect.stringMatching(/^radius\./),
    });
    expect(light(recipe(components, 'badge', 'neutral'))['background-color']).toMatchObject({
      ref: 'color.gray-200',
    });
    expect(recipeName('badge', 'success')).toBe('Badge, success');
    expect(recipeName('navbar', 'default')).toBe('Nav bar');
    expect(recipeName('heading', 'h2')).toBe('Heading 2');
    const names = components.components.map((r) => r.name).join(' ');
    for (const text of ['Draft', 'Live', 'Card title', 'Alert message', 'Tab one'])
      expect(names).not.toContain(text);
  });

  it('AC-F20.8 DESIGN.md has a recipe for every kind found', () => {
    const md = exportDesignMd(components, '2.0.0');
    for (const title of [
      'Card',
      'Card, interactive',
      'Badge, neutral',
      'Badge, success',
      'Alert, danger',
      'Nav bar',
      'Tabs',
      'Table',
    ]) {
      expect(md, title).toContain(`### ${title}`);
    }
  });
});
