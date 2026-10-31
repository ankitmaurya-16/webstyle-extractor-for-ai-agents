import { describe, expect, it } from 'vitest';
import { categoryOf, fnv1a, ids } from '../../../src/model/ids.js';
import { analyzeFixture } from '../helpers.js';

describe('stable token ids (v2 spec 6.3)', () => {
  it('builds <category>:<canonical value> ids', () => {
    expect(ids.color('#2563eb')).toBe('color:#2563eb');
    expect(ids.color('#0000001a', 0.1)).toBe('color:#000000@10');
    expect(ids.color('#2563eb33', 0.2)).toBe('color:#2563eb@20');
    expect(ids.space(16)).toBe('space:16');
    expect(ids.space(12.345)).toBe('space:12.35');
    expect(ids.radius(8)).toBe('radius:8');
    expect(ids.border(1)).toBe('border:1');
    expect(ids.container(1280)).toBe('container:1280');
    expect(ids.gap(24)).toBe('gap:24');
    expect(ids.text(16, 24, 400)).toBe('text:16/24/400');
    expect(ids.text(16, null, 400)).toBe('text:16/normal/400');
    expect(ids.family('Open Sans')).toBe('family:open-sans');
    expect(ids.duration(150.4)).toBe('duration:150');
    expect(ids.easing('cubic-bezier(0.4, 0, 0.2, 1)')).toBe('easing:cubic-bezier(0.4,0,0.2,1)');
    expect(ids.z(50)).toBe('z:50');
    expect(ids.opacity(0.5)).toBe('opacity:0.5');
    expect(ids.component('button', 'primary')).toBe('component:button:primary');
  });

  it('hashes shadows and gradients with FNV-1a over the normalized CSS', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    const css = '0 1px 2px rgba(0, 0, 0, 0.05)';
    expect(ids.shadow(css)).toBe(`shadow:${fnv1a(css)}`);
    expect(ids.shadow(`  0 1px   2px\nrgba(0, 0, 0, 0.05) `)).toBe(ids.shadow(css));
    expect(ids.gradient('linear-gradient(#fff,  #000)')).toBe(
      ids.gradient('linear-gradient(#fff, #000)'),
    );
    expect(ids.shadow(css)).not.toBe(ids.shadow('0 1px 3px rgba(0, 0, 0, 0.05)'));
  });

  it('reads the category of an id', () => {
    expect(categoryOf('color:#000000@10')).toBe('color');
    expect(categoryOf('component:button:primary')).toBe('component');
  });

  it('gives one id per token in every category of a fixture', () => {
    for (const name of ['classic', 'translucent', 'dark-media']) {
      const d = analyzeFixture(name);
      const all = [
        ...d.colors,
        ...d.gradients,
        ...Object.values(d.typography).flat(),
        ...d.spacing.tokens,
        ...d.radii,
        ...d.shadows,
        ...d.breakpoints,
        ...d.components,
      ];
      const seen = all.map((t) => t.id);
      expect(new Set(seen).size, name).toBe(seen.length);
    }
  });
});
