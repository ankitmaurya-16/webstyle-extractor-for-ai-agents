import { describe, expect, it } from 'vitest';
import { analyzeGradients, parseGradient } from '../../../src/analyze/gradients.js';
import { analyzeFixture, analyzeRaw, loadRaw, rawSnapshot, stat } from '../helpers.js';

const color = (value, weight, contexts, count = 1) => ({ ...stat(value, weight, contexts, count) });
const gradient = (css, usage, count = 1) => ({ css, type: 'linear', stops: [], count, usage });

describe('gradients (F18)', () => {
  it('AC-F18.1 parses linear, radial and conic gradients into type, direction and stops', () => {
    expect(parseGradient('linear-gradient(to right, #2563eb, rgb(124, 58, 237) 80%)')).toEqual({
      type: 'linear',
      repeating: false,
      direction: 'to right',
      stops: [
        { hex: '#2563eb', position: null },
        { hex: '#7c3aed', position: '80%' },
      ],
    });
    expect(
      parseGradient('radial-gradient(circle at center, #f59e0b 0%, #ef4444 100%)'),
    ).toMatchObject({
      type: 'radial',
      direction: 'circle at center',
      stops: [
        { hex: '#f59e0b', position: '0%' },
        { hex: '#ef4444', position: '100%' },
      ],
    });
    expect(parseGradient('conic-gradient(from 90deg, #10b981, #3b82f6, #10b981)')).toMatchObject({
      type: 'conic',
      direction: 'from 90deg',
      stops: [{ hex: '#10b981' }, { hex: '#3b82f6' }, { hex: '#10b981' }],
    });
    // No direction: the first argument is already a stop.
    expect(parseGradient('linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0))')).toMatchObject({
      direction: null,
      stops: [{ hex: '#00000066' }, { hex: '#00000000' }],
    });
    // A fade to transparent keeps its transparent stop.
    expect(parseGradient('linear-gradient(red, transparent)').stops).toEqual([
      { hex: '#ff0000', position: null },
      { hex: '#00000000', position: null },
    ]);
    expect(parseGradient('url(a.png)')).toBeNull();
  });

  it('AC-F18.1 parses the repeating forms, including two-position stops', () => {
    const parsed = parseGradient(
      'repeating-linear-gradient(45deg, rgb(229, 231, 235) 0px, rgb(255, 255, 255) 10px 20px)',
    );
    expect(parsed).toMatchObject({ type: 'linear', repeating: true, direction: '45deg' });
    expect(parsed.stops).toEqual([
      { hex: '#e5e7eb', position: '0px' },
      { hex: '#ffffff', position: '10px 20px' },
    ]);
    expect(
      parseGradient('repeating-radial-gradient(circle, #fde68a 0 8px, #fef3c7 8px 16px)'),
    ).toMatchObject({
      type: 'radial',
      repeating: true,
    });
    expect(
      parseGradient('repeating-conic-gradient(#111827 0deg 15deg, #f9fafb 15deg 30deg)'),
    ).toMatchObject({
      type: 'conic',
      repeating: true,
      direction: null,
    });
  });

  it('AC-F18.1 records every type and each layer of a multi-layer background from the page', () => {
    const raw = loadRaw('gradients');
    const kinds = raw.gradients.map((g) => `${g.repeating ? 'repeating-' : ''}${g.type}`);
    expect(new Set(kinds)).toEqual(
      new Set([
        'linear',
        'radial',
        'conic',
        'repeating-linear',
        'repeating-radial',
        'repeating-conic',
      ]),
    );
    // .layered holds two gradients in one background-image; both are recorded.
    expect(raw.gradients.map((g) => g.css)).toEqual(
      expect.arrayContaining([
        'linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0))',
        'radial-gradient(at center top, rgb(34, 211, 238), rgb(14, 116, 144))',
      ]),
    );
    for (const g of raw.gradients)
      expect(parseGradient(g.css)?.stops.length, g.css).toBeGreaterThanOrEqual(2);
  });

  it('AC-F18.2 stop colors join the palette with the gradient context', () => {
    const d = analyzeFixture('gradients');
    const purple = d.colors.find((c) => c.hex === '#7c3aed');
    expect(purple.contexts).toEqual(['gradient']);
    // The collector adds stops at a quarter of the element area, split across the stops.
    const raw = loadRaw('gradients');
    const stopWeight = raw.colors.find((c) => c.value === 'rgb(124, 58, 237)').weight;
    const heroArea = raw.gradients.find((g) => g.css.startsWith('linear-gradient(to right')).usage;
    expect(stopWeight).toBeCloseTo(heroArea / 4 / 3, 0);
  });

  it('AC-F18.2 colors used only in gradients never take a semantic role', () => {
    const d = analyzeFixture('gradients');
    const byId = Object.fromEntries(d.colors.map((c) => [c.id, c]));
    for (const [role, ref] of Object.entries(d.semantic)) {
      for (const id of Object.values(ref)) {
        expect(byId[id].contexts, `${role} ${byId[id].hex}`).not.toEqual(['gradient']);
      }
    }
    expect(d.semantic.primary.light).toBe('color:#2563eb');
  });

  it('AC-F18.2 a heavy gradient-only color does not become the accent', () => {
    const d = analyzeRaw(
      rawSnapshot({
        colors: [
          color('rgb(255, 255, 255)', 100000, ['background'], 10),
          color('rgb(17, 24, 39)', 2000, ['text'], 20),
          color('rgb(37, 99, 235)', 500, ['background', 'interactive'], 4),
          color('rgb(124, 58, 237)', 50000, ['gradient'], 2),
        ],
      }),
    );
    const roles = Object.values(d.semantic).map((ref) => ref.light);
    expect(roles).not.toContain('color:#7c3aed');
  });

  it('AC-F18.3 keeps at most 6 gradients by usage, named by site variable or gradient-<n>', () => {
    const { gradients } = analyzeFixture('gradients');
    expect(gradients).toHaveLength(6);
    expect(gradients.map((g) => g.name)).toEqual([
      'hero',
      'gradient-2',
      'gradient-3',
      'gradient-4',
      'gradient-5',
      'gradient-6',
    ]);
    expect(gradients[0]).toMatchObject({
      siteVariable: '--gradient-hero',
      generatedName: 'gradient-1',
    });
    const shares = gradients.map((g) => g.usageShare);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });

  it('AC-F18.3 deduplicates gradients by normalized CSS', () => {
    const tokens = analyzeGradients(
      [
        gradient('linear-gradient(#ffffff,  #000000)', 10),
        gradient('linear-gradient(#ffffff, #000000)', 5, 2),
        gradient('linear-gradient(#ffffff)', 50),
      ],
      () => null,
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      css: 'linear-gradient(#ffffff, #000000)',
      count: 3,
      usageShare: 1,
    });
  });

  it('AC-F18.3 names a gradient after a site variable written with hex stops', () => {
    const css = 'linear-gradient(to right, rgb(37, 99, 235), rgb(124, 58, 237))';
    const d = analyzeRaw(
      rawSnapshot({
        gradients: [{ css, type: 'linear', stops: [], count: 1, usage: 1000 }],
        variableDefs: [
          {
            name: '--gradient-hero',
            value: 'linear-gradient(to right, #2563eb, #7c3aed)',
            scope: 'root',
            selector: ':root',
          },
        ],
        variableUsage: { '--gradient-hero': 1 },
      }),
    );
    expect(d.gradients[0].name).toBe('hero');
  });

  it('AC-F18.4 gradient stops reference the color tokens they match', () => {
    const { gradients, colors } = analyzeFixture('gradients');
    const ids = new Set(colors.map((c) => c.id));
    const hero = gradients.find((g) => g.name === 'hero');
    expect(hero.stops.map((s) => s.colorTokenId)).toEqual(['color:#2563eb', 'color:#7c3aed']);
    for (const g of gradients) {
      for (const stop of g.stops)
        if (stop.colorTokenId) expect(ids.has(stop.colorTokenId)).toBe(true);
    }
    // A stop whose color is not a kept token keeps its hex and no reference.
    const tokens = analyzeGradients([gradient('linear-gradient(#123456, #654321)', 1)], (hex) =>
      hex === '#123456' ? { id: 'color:#123456' } : null,
    );
    expect(tokens[0].stops).toEqual([
      { colorTokenId: 'color:#123456', hex: '#123456', position: null },
      { colorTokenId: null, hex: '#654321', position: null },
    ]);
  });

  it('records gradient text as a usage note', () => {
    expect(analyzeFixture('gradients').meta.gradientText).toBe(1);
  });
});
