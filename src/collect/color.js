// Small color helpers for the page side. Color math with culori stays in the analysis worker;
// this file only parses computed rgb() values and composites them, which is all blending needs.

/** @typedef {{r: number, g: number, b: number, a: number}} Rgba channels 0-255, alpha 0-1 */

const RGB = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;
const HEX = /^#([0-9a-f]{3,8})$/i;

/**
 * Parses rgb(), rgba(), hex and transparent. Other syntaxes (oklch, lab, color()) go to
 * `fallback`, which the collector backs with a 1 x 1 OffscreenCanvas.
 * @param {string} value
 * @param {(value: string) => Rgba|null} [fallback]
 * @returns {Rgba|null}
 */
export function parseRgba(value, fallback) {
  const v = String(value ?? '').trim();
  if (!v || v === 'none') return null;
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const m = RGB.exec(v);
  if (m) {
    let a = m[4] === undefined ? 1 : Number(m[4]);
    if (m[5] === '%') a /= 100;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: clamp(a, 0, 1) };
  }
  const h = HEX.exec(v);
  if (h) return parseHex(h[1]);
  return fallback ? fallback(v) : null;
}

function parseHex(hex) {
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
  if (full.length !== 6 && full.length !== 8) return null;
  const n = (i) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const h2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** Lowercase #rrggbb, or #rrggbbaa when translucent. */
export function toHex({ r, g, b, a }) {
  const base = `#${h2(r)}${h2(g)}${h2(b)}`;
  return a >= 1 ? base : `${base}${h2(Math.round(a * 255))}`;
}

/**
 * Composites `top` over `bottom` with standard source-over alpha. When `bottom` is opaque this is
 * the per-channel sRGB blend out = a * fg + (1 - a) * bg (AC-F9.2).
 * @returns {Rgba}
 */
export function composite(top, bottom) {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (k) => (top[k] * top.a + bottom[k] * bottom.a * (1 - top.a)) / a;
  return { r: ch('r'), g: ch('g'), b: ch('b'), a };
}

/** Relative luminance (WCAG) of an opaque color, 0 to 1. */
export function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const LIGHT_CANVAS = { r: 255, g: 255, b: 255, a: 1 };
export const DARK_CANVAS = { r: 18, g: 18, b: 18, a: 1 };

/** Canvas-backed parser for color syntaxes the regex does not cover. Results are cached. */
export function canvasColorParser() {
  const cache = new Map();
  let ctx = null;
  return (value) => {
    if (cache.has(value)) return cache.get(value);
    let result;
    try {
      ctx ??= new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = value;
      // fillStyle ignores invalid colors; a sentinel check keeps black-looking garbage out.
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      result = a === 0 ? { r: 0, g: 0, b: 0, a: 0 } : { r, g, b, a: a / 255 };
    } catch {
      result = null;
    }
    cache.set(value, result);
    return result;
  };
}
