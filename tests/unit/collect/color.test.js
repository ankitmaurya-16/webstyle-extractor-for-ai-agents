import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DARK_CANVAS,
  LIGHT_CANVAS,
  canvasColorParser,
  composite,
  luminance,
  parseRgba,
  toHex,
} from '../../../src/collect/color.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page-side color helpers', () => {
  it('parses rgb, rgba, space syntax, percent alpha, hex and transparent', () => {
    expect(parseRgba('rgb(37, 99, 235)')).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseRgba('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseRgba('rgb(10 20 30 / 25%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseRgba('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseRgba('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
    expect(parseRgba('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseRgba('none')).toBeNull();
    expect(parseRgba('')).toBeNull();
    expect(parseRgba('#12345')).toBeNull();
  });

  it('hands other syntaxes to the fallback parser', () => {
    const fallback = vi.fn(() => ({ r: 1, g: 2, b: 3, a: 1 }));
    expect(parseRgba('oklch(0.5 0.1 200)', fallback)).toEqual({ r: 1, g: 2, b: 3, a: 1 });
    expect(fallback).toHaveBeenCalledWith('oklch(0.5 0.1 200)');
    expect(parseRgba('oklch(0.5 0.1 200)')).toBeNull();
  });

  it('formats hex with alpha only when translucent', () => {
    expect(toHex({ r: 37, g: 99, b: 235, a: 1 })).toBe('#2563eb');
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080');
    expect(toHex({ r: 300, g: -4, b: 12.6, a: 1 })).toBe('#ff000d');
  });

  it('composites a translucent color over an opaque backdrop channel by channel', () => {
    const out = composite({ r: 0, g: 0, b: 0, a: 0.5 }, LIGHT_CANVAS);
    expect(toHex(out)).toBe('#808080');
    expect(out.a).toBe(1);
    expect(toHex(composite({ r: 255, g: 255, b: 255, a: 0.1 }, DARK_CANVAS))).toBe('#2a2a2a');
    expect(composite({ r: 0, g: 0, b: 0, a: 0 }, { r: 0, g: 0, b: 0, a: 0 })).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it('computes WCAG relative luminance', () => {
    expect(luminance(LIGHT_CANVAS)).toBeCloseTo(1);
    expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(luminance(DARK_CANVAS)).toBeLessThan(0.2);
  });
});

describe('canvasColorParser', () => {
  /** A 2D context that accepts only the colors in `known`, like a real canvas ignores invalid ones. */
  function stubCanvas(known) {
    const ctx = {
      _fill: '#000000',
      get fillStyle() {
        return this._fill;
      },
      set fillStyle(value) {
        if (/^#[0-9a-f]{6}$/.test(value) || value in known) this._fill = value;
      },
      clearRect() {},
      fillRect() {},
      getImageData() {
        const rgba = known[this._fill] ?? [0, 0, 0, 255];
        return { data: rgba };
      },
    };
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return ctx;
        }
      },
    );
  }

  it('reads colors the regex does not cover through the canvas', () => {
    stubCanvas({
      'oklch(0.5 0.1 200)': [0, 120, 130, 255],
      'lab(50 0 0 / 0.5)': [119, 119, 119, 128],
    });
    const parse = canvasColorParser();
    expect(parse('oklch(0.5 0.1 200)')).toEqual({ r: 0, g: 120, b: 130, a: 1 });
    expect(parse('lab(50 0 0 / 0.5)')).toEqual({ r: 119, g: 119, b: 119, a: 128 / 255 });
  });

  it('AC-F12.4 returns null for values that are not colors, instead of opaque black', () => {
    // A border shorthand once parsed as black, so two different borders compared equal and a
    // changed state border was dropped.
    stubCanvas({});
    const parse = canvasColorParser();
    expect(parse('1px solid rgb(37, 99, 235)')).toBeNull();
    expect(parse('8px 16px')).toBeNull();
    expect(parseRgba('1px solid #2563eb', parse)).toBeNull();
  });

  it('returns null when no canvas is available', () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(canvasColorParser()('oklch(0.5 0.1 200)')).toBeNull();
  });
});
