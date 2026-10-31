// Gradients (F18). Pure.

import { formatHex8, parse } from 'culori';
import { ids } from '../model/ids.js';
import { normalizeColor } from './colors.js';
import { cmp } from './units.js';

const MAX_GRADIENTS = 6;
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * Hex of a stop color. The palette drops fully transparent colors, but a fade to transparent is
 * a real stop, so it is kept as #rrggbb00 here.
 */
function stopHex(value) {
  const color = normalizeColor(value);
  if (color) return color.hex;
  let parsed;
  try {
    parsed = parse(String(value).trim());
  } catch {
    return null;
  }
  if (!parsed || (parsed.alpha ?? 1) > 0) return null;
  return formatHex8({ ...parsed, alpha: 0 }).toLowerCase();
}

/** Splits a gradient's arguments; exported for the unit tests (AC-F18.1). */
export function parseGradient(css) {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/is.exec(String(css).trim());
  if (!m) return null;
  const args = [];
  let depth = 0;
  let current = '';
  for (const ch of m[3]) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) args.push(current.trim());
  const isStop = (a) =>
    !/^(to\s|from\s|at\s|circle|ellipse|closest|farthest|-?[\d.]+(deg|turn|rad|grad)\b)/i.test(a);
  const direction = args[0] && !isStop(args[0]) ? args[0] : null;
  const stops = [];
  for (const arg of direction ? args.slice(1) : args) {
    const fn =
      /^((?:rgba?|hsla?|oklch|oklab|lab|lch|color|hwb)\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s*(.*)$/i.exec(
        arg,
      );
    if (!fn) continue;
    const hex = stopHex(fn[1]);
    if (!hex) continue;
    stops.push({ hex, position: fn[2].trim() || null });
  }
  return { type: m[2].toLowerCase(), repeating: Boolean(m[1]), direction, stops };
}

/**
 * @param {object[]} samples GradientSamples
 * @param {(value: string) => object|null} findColor
 */
export function analyzeGradients(samples, findColor) {
  const map = new Map();
  for (const s of samples ?? []) {
    const parsed = parseGradient(s.css);
    if (!parsed || parsed.stops.length < 2) continue;
    const key = s.css.replace(/\s+/g, ' ').trim();
    const e = map.get(key) ?? { css: key, parsed, usage: 0, count: 0 };
    e.usage += s.usage;
    e.count += s.count;
    map.set(key, e);
  }
  const total = [...map.values()].reduce((a, e) => a + e.usage, 0) || 1;
  return [...map.values()]
    .sort((a, b) => b.usage - a.usage || cmp(a.css, b.css))
    .slice(0, MAX_GRADIENTS)
    .map((e, i) => ({
      id: ids.gradient(e.css),
      name: `gradient-${i + 1}`,
      css: e.css,
      type: e.parsed.type,
      repeating: e.parsed.repeating,
      direction: e.parsed.direction,
      stops: e.parsed.stops.map((stop) => ({
        colorTokenId: findColor(stop.hex)?.id ?? null,
        hex: stop.hex,
        position: stop.position,
      })),
      usageShare: round4(e.usage / total),
      count: e.count,
      excluded: false,
    }));
}
