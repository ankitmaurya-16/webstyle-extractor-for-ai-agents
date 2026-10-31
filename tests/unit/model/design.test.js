import { describe, expect, it } from 'vitest';
import {
  anyRolesOf,
  ascending,
  categories,
  cssValue,
  findToken,
  forEachRecipeValue,
  modesOf,
  orderedColors,
  primaryModeOf,
  resolveValue,
  roleToken,
  rolesOf,
  semanticPairs,
  semanticRows,
  stripPrefix,
  visible,
} from '../../../src/model/design.js';
import { CATEGORIES } from '../../../src/model/types.js';
import { analyzeFixture } from '../helpers.js';

const media = () => analyzeFixture('dark-media');

describe('design read helpers', () => {
  it('lists every token category and finds tokens by id', () => {
    const d = analyzeFixture('classic');
    expect(Object.keys(categories(d)).sort()).toEqual([...CATEGORIES].sort());
    expect(Object.keys(categories({})).every((k) => Array.isArray(categories({})[k]))).toBe(true);
    const found = findToken(d, 'radius:8');
    expect(found.category).toBe('radius');
    expect(found.token.px).toBe(8);
    expect(found.list).toBe(d.radii);
    expect(findToken(d, 'radius:1234')).toBeNull();
  });

  it('reads roles per theme', () => {
    const d = media();
    expect(roleToken(d, 'primary', 'dark').hex).toBe('#8b5cf6');
    expect(roleToken(d, 'overlay', 'light')).toBeNull();
    expect(rolesOf(d, 'color:#111827', 'light')).toEqual(['text']);
    expect(rolesOf(d, 'color:#111827', 'dark')).toEqual(['surface']);
    expect(anyRolesOf(d, 'color:#111827')).toEqual(['surface', 'text']);
    const excluded = structuredClone(d);
    excluded.colors.find((c) => c.id === 'color:#8b5cf6').excluded = true;
    expect(roleToken(excluded, 'primary', 'dark')).toBeNull();
  });

  it('reads modes and semantic pairs and rows', () => {
    const d = media();
    expect(modesOf(d)).toEqual(['light', 'dark']);
    expect(primaryModeOf(d)).toBe('light');
    expect(modesOf({ meta: { colorScheme: 'dark' } })).toEqual(['dark']);
    expect(semanticPairs(d, 'dark').map(([role, t]) => [role, t.hex])).toEqual([
      ['background', '#0b0f19'],
      ['surface', '#111827'],
      ['text', '#e5e7eb'],
      ['primary', '#8b5cf6'],
    ]);
    const rows = semanticRows(d);
    expect(rows.map((r) => r.role)).toEqual(['background', 'surface', 'text', 'primary']);
    expect(rows[0].byMode.light.hex).toBe('#ffffff');
    expect(rows[0].byMode.dark.hex).toBe('#0b0f19');
  });

  it('resolves recipe values, falling back to raw values for excluded tokens', () => {
    const d = analyzeFixture('classic');
    const ref = { ref: 'color.brand', id: 'color:#2563eb', raw: '#2563eb' };
    expect(resolveValue(d, ref).token.id).toBe('color:#2563eb');
    expect(resolveValue(d, '600')).toEqual({ token: null, category: null, raw: '600' });
    expect(cssValue(d, ref)).toBe('#2563eb');
    expect(cssValue(d, { ref: 'radius.radius-lg', id: 'radius:8', raw: '8px' })).toBe('8px');
    expect(cssValue(d, { ref: 'text.base', id: 'text:16/24/400', raw: '1rem' })).toBe('16px');
    expect(cssValue(d, { ref: 'color.gone', id: 'color:#abcdef', raw: '#abcdef' })).toBe('#abcdef');
    const excluded = structuredClone(d);
    excluded.colors.find((c) => c.id === 'color:#2563eb').excluded = true;
    expect(resolveValue(excluded, ref)).toEqual({ token: null, category: null, raw: '#2563eb' });
  });

  it('orders colors opaque first, by family and step, then translucent ones', () => {
    const d = analyzeFixture('translucent');
    expect(orderedColors(d).map((c) => c.name)).toEqual([
      'white',
      'gray-900',
      'blue-600',
      'white/80',
      'black/10',
      'black/50',
      'gray-900/60',
      'blue-600/10',
    ]);
    const hidden = structuredClone(d);
    hidden.colors[0].excluded = true;
    expect(orderedColors(hidden).map((c) => c.name)).not.toContain('white');
    expect(visible(hidden.colors)).toHaveLength(d.colors.length - 1);
  });

  it('sorts, strips prefixes and walks recipe values', () => {
    const list = [{ px: 8 }, { px: 2, excluded: true }, { px: 4 }];
    expect(ascending(list, 'px').map((t) => t.px)).toEqual([4, 8]);
    expect(list[0].px).toBe(8);
    expect(stripPrefix('radius-md', 'radius')).toBe('md');
    expect(stripPrefix('radius-', 'radius')).toBe('radius-');
    expect(stripPrefix('md', 'radius')).toBe('md');
    const recipe = {
      byMode: {
        light: { default: { color: 'a' }, hover: { color: 'b' } },
        dark: { default: { color: 'c' } },
      },
    };
    const seen = [];
    forEachRecipeValue(recipe, (value, prop) => seen.push(`${prop}=${value}`));
    expect(seen).toEqual(['color=a', 'color=b', 'color=c']);
  });
});
