import { describe, expect, it } from 'vitest';
import { highlightMatch } from '../../../src/model/highlight.js';
import { analyzeFixture } from '../helpers.js';

const token = (category, fields) => ({
  id: `${category}:x`,
  name: 'x',
  excluded: false,
  ...fields,
});

describe('"Where is this used?" matching (F30)', () => {
  it('AC-F30.2 colors match their value and every merged value', () => {
    const d = analyzeFixture('classic');
    expect(highlightMatch(d, 'color:#ffffff')).toEqual({
      property: 'color',
      values: ['#ffffff', '#f9fafb'],
      anyColor: true,
    });
  });

  it('AC-F30.2 translucent colors match by raw 8-digit value', () => {
    const d = analyzeFixture('translucent');
    expect(highlightMatch(d, 'color:#000000@10')).toEqual({
      property: 'color',
      values: ['#0000001a', '#0000001f'],
      anyColor: true,
    });
  });

  it('AC-F30.2 sizes, shadows and other tokens match the property of their category', () => {
    const d = analyzeFixture('classic');
    expect(highlightMatch(d, 'space:16')).toEqual({ property: 'padding', values: ['16px'] });
    expect(highlightMatch(d, 'radius:8')).toEqual({ property: 'border-radius', values: ['8px'] });
    expect(highlightMatch(d, 'text:16/24/400')).toEqual({
      property: 'font-size',
      values: ['16px'],
    });
    expect(highlightMatch(d, 'family:georgia')).toEqual({
      property: 'font-family',
      values: ['georgia'],
    });
    const shadow = d.shadows[0];
    expect(highlightMatch(d, shadow.id)).toEqual({
      property: 'box-shadow',
      values: [shadow.value],
    });

    const design = {
      colors: [],
      layout: { gaps: [token('gap', { id: 'gap:24', px: 24 })] },
      borderWidths: [token('border', { id: 'border:2', px: 2 })],
      opacities: [token('opacity', { id: 'opacity:0.5', value: 0.5 })],
      zIndex: [token('z', { id: 'z:50', value: 50 })],
      motion: { durations: [token('duration', { id: 'duration:150', ms: 150 })] },
      gradients: [token('gradient', { id: 'gradient:1', css: 'linear-gradient(red, blue)' })],
      typography: { letterSpacings: [token('tracking', { id: 'tracking:0.05', em: 0.05 })] },
    };
    expect(highlightMatch(design, 'gap:24')).toEqual({ property: 'gap', values: ['24px'] });
    expect(highlightMatch(design, 'border:2')).toEqual({
      property: 'border-width',
      values: ['2px'],
    });
    expect(highlightMatch(design, 'opacity:0.5')).toEqual({ property: 'opacity', values: ['0.5'] });
    expect(highlightMatch(design, 'z:50')).toEqual({ property: 'z-index', values: ['50'] });
    expect(highlightMatch(design, 'duration:150')).toEqual({
      property: 'transition-duration',
      values: ['0.15s'],
    });
    expect(highlightMatch(design, 'gradient:1')).toEqual({
      property: 'background-image',
      values: ['linear-gradient(red, blue)'],
    });
    expect(highlightMatch(design, 'tracking:0.05')).toEqual({
      property: 'letter-spacing',
      values: ['0.8px'],
    });
  });

  it('AC-F30.2 recipes match their representative selector', () => {
    const d = structuredClone(analyzeFixture('classic'));
    const recipe = d.components[0];
    recipe.representativeSelector = 'main > button.btn';
    expect(highlightMatch(d, recipe.id)).toEqual({
      property: 'selector',
      values: ['main > button.btn'],
    });
    recipe.representativeSelector = null;
    expect(highlightMatch(d, recipe.id)).toBeNull();
  });

  it('returns null for unknown ids', () => {
    expect(highlightMatch(analyzeFixture('classic'), 'color:#abcdef')).toBeNull();
  });
});
