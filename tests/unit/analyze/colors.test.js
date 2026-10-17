import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { familyOf, normalizeColor, oklchOf, stepOf } from '../../../src/analyze/colors.js';
import { rawSnapshot, stat } from '../helpers.js';

const colorsOf = (colors, extra = {}) => analyze(rawSnapshot({ colors, ...extra })).colors;
const byHex = (tokens, hex) => tokens.find((t) => t.hex === hex);

describe('colors', () => {
  it('AC-F2.1 ignores fully transparent colors and keeps partial alpha as 8-digit hex', () => {
    expect(normalizeColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(normalizeColor('transparent')).toBeNull();
    expect(normalizeColor('rgba(0, 0, 0, 0.5)')).toEqual({ hex: '#00000080', alpha: 0.5 });
    expect(normalizeColor('rgb(37, 99, 235)')).toEqual({ hex: '#2563eb', alpha: 1 });
    expect(normalizeColor('oklch(0.6 0.2 25)')?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(normalizeColor('not-a-color')).toBeNull();
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 100, ['background']),
      stat('rgba(0, 0, 0, 0.5)', 50, ['background']),
    ]);
    expect(tokens.map((t) => t.hex)).toContain('#00000080');
  });

  it('AC-F2.2 merges colors closer than OKLab 0.02; the most-used wins', () => {
    const tokens = colorsOf([
      stat('rgb(5, 150, 105)', 10, ['background']),
      stat('rgb(5, 150, 104)', 3, ['background']),
      stat('rgb(255, 255, 255)', 50, ['background']),
    ]);
    const green = byHex(tokens, '#059669');
    expect(green.mergedFrom).toEqual(['#059668']);
    expect(byHex(tokens, '#059668')).toBeUndefined();
  });

  it('AC-F2.2 keeps colors further apart than 0.02 separate', () => {
    const tokens = colorsOf([
      stat('rgb(37, 99, 235)', 10, ['background']),
      stat('rgb(29, 78, 216)', 10, ['background']),
    ]);
    expect(tokens).toHaveLength(2);
  });

  it('AC-F2.3 assigns hue family and step by OKLCH, white and black by name', () => {
    expect(familyOf({ oklch: oklchOf('#ffffff') })).toBe('white');
    expect(familyOf({ oklch: oklchOf('#000000') })).toBe('black');
    expect(familyOf({ oklch: oklchOf('#6b7280') })).toBe('gray');
    expect(familyOf({ oklch: oklchOf('#111827') })).toBe('gray');
    expect(familyOf({ oklch: oklchOf('#2563eb') })).toBe('blue');
    expect(familyOf({ oklch: oklchOf('#dc2626') })).toBe('red');
    expect(familyOf({ oklch: oklchOf('#16a34a') })).toBe('green');
    expect(familyOf({ oklch: oklchOf('#dcfce7') })).toBe('green');
    expect(familyOf({ oklch: oklchOf('#7c3aed') })).toBe('purple');
    expect(stepOf(0.95)).toBe(100);
    expect(stepOf(0.9)).toBe(200);
    expect(stepOf(0.8)).toBe(300);
    expect(stepOf(0.72)).toBe(400);
    expect(stepOf(0.65)).toBe(500);
    expect(stepOf(0.58)).toBe(600);
    expect(stepOf(0.5)).toBe(700);
    expect(stepOf(0.4)).toBe(800);
    expect(stepOf(0.2)).toBe(900);
    const tokens = colorsOf([
      stat('rgb(255,255,255)', 10, ['background']),
      stat('rgb(37, 99, 235)', 10, ['background']),
    ]);
    expect(tokens.map((t) => t.name)).toEqual(['white', 'blue-600']);
  });

  it('AC-F2.4 moves the less-used color of a step collision in its lightness direction', () => {
    // Both grays fall in the 900 band; the lighter, less-used one moves toward 100.
    const tokens = colorsOf([
      stat('rgb(10, 10, 10)', 100, ['text']),
      stat('rgb(40, 40, 40)', 20, ['text']),
      stat('rgb(255, 255, 255)', 100, ['background']),
    ]);
    expect(byHex(tokens, '#0a0a0a').name).toBe('gray-900');
    expect(byHex(tokens, '#282828').name).toBe('gray-800');
  });

  it('AC-F2.4 names a color extra when no free step exists in its direction', () => {
    const tokens = colorsOf([
      stat('rgb(40, 40, 40)', 100, ['text']),
      stat('rgb(10, 10, 10)', 50, ['text']),
      stat('rgb(255, 255, 255)', 100, ['background']),
    ]);
    expect(byHex(tokens, '#282828').name).toBe('gray-900');
    expect(byHex(tokens, '#0a0a0a').name).toBe('gray-extra-1');
    expect(byHex(tokens, '#0a0a0a').step).toBeNull();
  });

  it('AC-F2.5 generates no shades: only extracted values sit on steps', () => {
    const tokens = colorsOf([stat('rgb(37, 99, 235)', 10, ['background'])]);
    expect(tokens).toHaveLength(1);
  });

  it('AC-F2.6 assigns background, surface, text, text-muted and border by usage, one token each', () => {
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(249, 250, 251)', 200, ['background']),
      stat('rgb(17, 24, 39)', 500, ['text']),
      stat('rgb(107, 114, 128)', 100, ['text']),
      stat('rgb(229, 231, 235)', 50, ['border']),
    ]);
    const role = (r) => tokens.filter((t) => t.roles.includes(r)).map((t) => t.hex);
    expect(role('background')).toEqual(['#ffffff']);
    expect(role('text')).toEqual(['#111827']);
    expect(role('text-muted')).toEqual(['#6b7280']);
    expect(role('border')).toEqual(['#e5e7eb']);
  });

  it('AC-F2.6 skips surface when it is under 5% of the background weight', () => {
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(200, 200, 200)', 10, ['background']),
    ]);
    expect(tokens.some((t) => t.roles.includes('surface'))).toBe(false);
  });

  it('AC-F2.6 detects accent, success, warning and danger only when present', () => {
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(37, 99, 235)', 100, ['background', 'interactive'], 5),
      stat('rgb(219, 39, 119)', 50, ['background', 'interactive'], 3),
      stat('rgb(22, 163, 74)', 40, ['text'], 2),
      stat('rgb(234, 179, 8)', 40, ['text'], 2),
      stat('rgb(220, 38, 38)', 40, ['text'], 2),
    ]);
    const holder = (r) => tokens.find((t) => t.roles.includes(r))?.hex;
    expect(holder('primary')).toBe('#2563eb');
    expect(holder('accent')).toBe('#db2777');
    expect(holder('success')).toBe('#16a34a');
    expect(holder('warning')).toBe('#eab308');
    expect(holder('danger')).toBe('#dc2626');
    const plain = colorsOf([stat('rgb(255, 255, 255)', 1000, ['background'])]);
    expect(plain.flatMap((t) => t.roles)).toEqual(['background']);
  });

  it('AC-F2.7 picks primary from interactive colors with chroma of at least 0.08', () => {
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(55, 65, 81)', 100, ['background', 'interactive'], 9),
      stat('rgb(37, 99, 235)', 10, ['background', 'interactive'], 2),
    ]);
    expect(tokens.find((t) => t.roles.includes('primary'))?.hex).toBe('#2563eb');
  });

  it('AC-F2.7 sets no primary when no interactive color is saturated', () => {
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 1000, ['background']),
      stat('rgb(55, 65, 81)', 100, ['background', 'interactive'], 9),
    ]);
    expect(tokens.some((t) => t.roles.includes('primary'))).toBe(false);
  });

  it('AC-F2.8 drops colors under 0.5% unless they hold a role', () => {
    const tokens = colorsOf([
      stat('rgb(255, 255, 255)', 10000, ['background']),
      stat('rgb(200, 30, 30)', 1, ['background']),
      stat('rgb(37, 99, 235)', 1, ['background', 'interactive'], 2),
    ]);
    expect(byHex(tokens, '#c81e1e')).toBeUndefined();
    expect(byHex(tokens, '#2563eb').roles).toContain('primary');
  });

  it('assigns stable ids in export order', () => {
    const tokens = colorsOf([
      stat('rgb(37, 99, 235)', 10, ['background']),
      stat('rgb(255, 255, 255)', 10, ['background']),
    ]);
    expect(tokens.map((t) => t.id)).toEqual(['c1', 'c2']);
    expect(tokens[0].name).toBe('white');
  });
});
