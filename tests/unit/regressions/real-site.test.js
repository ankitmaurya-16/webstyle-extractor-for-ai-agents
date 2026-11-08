// Regressions found on a real site (LeetCode), rebuilt as small synthetic inputs.
import { describe, expect, it } from 'vitest';
import { deriveName, roleFromName } from '../../../src/detect/variable-rules.js';
import { visibleShadow } from '../../../src/analyze/layout.js';
import { buildFocusRing, buildRecipes } from '../../../src/analyze/recipes.js';
import { rolesFromVariables } from '../../../src/analyze/variables.js';
import { loadedFonts } from '../../../src/export/rules.js';

describe('variable names on design systems that rank tokens', () => {
  it('AC-F10.8 "primary" after another category word is a rank, not the brand role', () => {
    expect(roleFromName('--fill-primary')).toBeNull();
    expect(roleFromName('--label-primary')).toBeNull();
    expect(roleFromName('--text-primary')).toBe('text');
    expect(roleFromName('--primary')).toBe('primary');
    expect(roleFromName('--color-primary')).toBe('primary');
    expect(roleFromName('--brand-orange')).toBe('primary');
    expect(roleFromName('--sd-primary')).toBe('primary');
  });

  it('AC-F10.6 a prefix is kept when stripping it would leave only a rank word', () => {
    expect(deriveName('--text-primary')).toBe('text-primary');
    expect(deriveName('--text-secondary')).toBe('text-secondary');
    expect(deriveName('--font-primary')).toBe('font-primary');
    expect(deriveName('--color-primary')).toBe('primary');
    expect(deriveName('--color-brand-orange')).toBe('brand-orange');
    expect(deriveName('--space-4')).toBe('space-4');
  });

  it('AC-F10.8 brand and status roles never go to a translucent color', () => {
    const tokens = [
      { id: 'color:#ffffff@15', hex: '#ffffff24', alpha: 0.14, mergedFrom: [] },
      { id: 'color:#ffa116', hex: '#ffa116', alpha: 1, mergedFrom: [] },
    ];
    const candidates = [
      { name: '--brand', parsed: { type: 'color', hex: '#ffffff24' }, usage: 50 },
      { name: '--brand-orange', parsed: { type: 'color', hex: '#ffa116' }, usage: 3 },
    ];
    const roles = rolesFromVariables(tokens, candidates);
    expect(roles.primary?.token.id ?? null).not.toBe('color:#ffffff@15');
  });
});

describe('placeholder shadows', () => {
  it('AC-F4.4 invisible shadow layers are dropped before shadows become tokens', () => {
    expect(visibleShadow('0 0 #0000,0 0 #0000,0 0 #0000')).toBe('none');
    expect(
      visibleShadow(
        'rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.24) 0px 1px 3px 0px',
      ),
    ).toBe('rgba(0, 0, 0, 0.24) 0px 1px 3px 0px');
    expect(visibleShadow('0 0 0 2px #3b82f6')).toBe('0 0 0 2px #3b82f6');
    expect(visibleShadow('inset 0 1px 0 rgba(255,255,255,.1)')).toBe(
      'inset 0 1px 0 rgba(255,255,255,.1)',
    );
  });

  it("AC-F12.4 a placeholder ring such as Tailwind's 0 0 #0000 is not a focus ring", () => {
    const raws = [
      {
        stateSamples: [
          {
            kind: 'button',
            state: 'focus-visible',
            source: 'stylesheet',
            styles: { 'box-shadow': '0 0 #0000,0 0 #0000' },
          },
        ],
      },
    ];
    expect(buildFocusRing(raws, () => null).source).toBe('browser-default');
    raws[0].stateSamples.push({
      kind: 'button',
      state: 'focus',
      source: 'stylesheet',
      styles: { outline: '2px solid rgb(59, 130, 246)' },
    });
    expect(buildFocusRing(raws, () => null).outline).toContain('2px solid');
  });
});

describe('unstyled buttons', () => {
  it('AC-F5.2 icon and text buttons without fill, border or padding do not become the button recipe', () => {
    const sample = (key, count, styles) => ({
      kind: 'button',
      key: `button:${key}`,
      count,
      styles,
      hints: [],
    });
    const raw = {
      rootFontSizePx: 16,
      samples: [
        sample('ghost', 20, {
          'background-color': 'rgba(0, 0, 0, 0)',
          color: 'rgb(255, 255, 255)',
          border: 'none',
          padding: '0px',
        }),
        sample('solid', 3, {
          'background-color': 'rgb(255, 161, 22)',
          color: 'rgb(0, 0, 0)',
          border: 'none',
          padding: '6px 16px',
        }),
      ],
      stateSamples: [],
      representatives: [],
    };
    const lists = {
      colors: [],
      families: [],
      sizes: [],
      spacing: [],
      radii: [],
      shadows: [],
      borderWidths: [],
      opacities: [],
      gradients: [],
    };
    const recipes = buildRecipes({ light: raw }, lists, () => null, { light: null });
    const button = recipes.find((r) => r.kind === 'button');
    expect(button.sampleKey).toBe('button:solid');
  });
});

describe('web fonts in the agent rule', () => {
  it('AC-F19.6 the load rule names only faces the page text uses', () => {
    const design = {
      meta: {
        webFonts: [
          { family: 'TypoRound', weights: [400], loaded: true },
          { family: 'Inter', weights: [400, 600], loaded: true },
        ],
      },
      typography: { families: [{ stack: ['Inter', 'sans-serif'], excluded: false }] },
    };
    expect(loadedFonts(design).map((f) => f.family)).toEqual(['Inter']);
  });
});
