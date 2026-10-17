import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { collapseBox } from '../../../src/analyze/recipes.js';
import { RECIPE_PROPERTIES } from '../../../src/model/types.js';
import { rawSnapshot, stat } from '../helpers.js';

const BLUE = 'rgb(37, 99, 235)';
const button = (bg, color, count, extra = {}) => ({
  kind: 'button',
  count,
  styles: {
    'background-color': bg,
    color,
    border: 'none',
    'border-radius': '6px',
    padding: '8px 16px 8px 16px',
    'font-family': 'Inter, sans-serif',
    'font-size': '14px',
    'font-weight': '600',
    'line-height': '20px',
    'box-shadow': 'none',
    ...extra,
  },
});

const base = (samples) =>
  rawSnapshot({
    colors: [
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat(BLUE, 100, ['background', 'interactive'], 5),
      stat('rgb(17, 24, 39)', 500, ['text']),
    ],
    radii: [stat('6px', 10, [], 10)],
    spacing: [stat('8px', 10, [], 10), stat('16px', 10, [], 10)],
    fontFamilies: [stat('Inter, sans-serif', 100)],
    textStyles: [stat('14px|20px|600|Inter, sans-serif', 100, ['button'])],
    samples,
  });

describe('component recipes', () => {
  it('AC-F5.2 makes the most common button primary when its background is primary', () => {
    const d = analyze(
      base([
        button(BLUE, 'rgb(255, 255, 255)', 5),
        button('rgb(255, 255, 255)', 'rgb(17, 24, 39)', 2),
      ]),
    );
    const buttons = d.components.filter((r) => r.kind === 'button');
    expect(buttons.map((b) => b.variant)).toEqual(['primary', 'secondary']);
  });

  it('AC-F5.2 keeps at most two button recipes', () => {
    const d = analyze(
      base([
        button(BLUE, 'rgb(255, 255, 255)', 5),
        button('rgb(255, 255, 255)', 'rgb(17, 24, 39)', 3),
        button('rgb(240, 240, 240)', 'rgb(17, 24, 39)', 2),
      ]),
    );
    expect(d.components.filter((r) => r.kind === 'button')).toHaveLength(2);
  });

  it('AC-F5.3 and AC-F5.4 build input and link recipes from the most common samples', () => {
    const input = { ...button('rgb(255, 255, 255)', 'rgb(17, 24, 39)', 3), kind: 'input' };
    const link = { ...button('rgba(0, 0, 0, 0)', BLUE, 4), kind: 'link' };
    const d = analyze(base([input, link]));
    expect(d.components.map((r) => `${r.kind}:${r.variant}`)).toEqual([
      'input:default',
      'link:default',
    ]);
  });

  it('AC-F5.5 lists every recipe property', () => {
    const d = analyze(base([button(BLUE, 'rgb(255, 255, 255)', 5)]));
    expect(Object.keys(d.components[0].styles)).toEqual(RECIPE_PROPERTIES);
  });

  it('AC-F5.6 stores values that match tokens as references and others raw', () => {
    const d = analyze(base([button(BLUE, 'rgb(255, 255, 255)', 5, { 'border-radius': '3px' })]));
    const s = d.components[0].styles;
    expect(s['background-color']).toMatchObject({ ref: 'color.blue-600', raw: '#2563eb' });
    expect(s.color).toMatchObject({ ref: 'color.white' });
    expect(s['border-radius']).toBe('3px');
    expect(s['font-family']).toMatchObject({ ref: 'font.sans' });
    expect(s.padding).toBe('8px 16px');
  });

  it('AC-F5.7 has no hover or focus fields', () => {
    const d = analyze(base([button(BLUE, 'rgb(255, 255, 255)', 5)]));
    expect(JSON.stringify(d.components)).not.toMatch(/hover|focus/);
  });

  it('collapses box shorthands', () => {
    expect(collapseBox('8px 8px 8px 8px')).toBe('8px');
    expect(collapseBox('8px 16px 8px 16px')).toBe('8px 16px');
    expect(collapseBox('1px 2px 3px 2px')).toBe('1px 2px 3px');
    expect(collapseBox('1px 2px 3px 4px')).toBe('1px 2px 3px 4px');
  });
});
