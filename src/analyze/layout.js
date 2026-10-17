// Layout stage: spacing scale and base unit, radii, shadows and breakpoints (F4).

import { cmp, round2, toPx } from './units.js';

const MIN_SHARE = 0.005;
const BASE_COVERAGE = 0.6;
// Every multiple of 8 is a multiple of 4, so "more weight" alone would always pick 4. The base is
// 8 only when no value that is used enough to become a token sits on an odd multiple of 4.
const SNAP_PX = 1;
const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
const SHADOW_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
const BREAKPOINT_NAMES = ['sm', 'md', 'lg', 'xl', '2xl'];
const MAX_SHADOWS = 6;
export const FULL_RADIUS_PX = 9999;

const round4 = (n) => Math.round(n * 10000) / 10000;
const isMultiple = (value, unit) => Math.abs(value / unit - Math.round(value / unit)) < 1e-6;

/** Combines ValueStats that resolve to the same px value. */
function toPxStats(stats, rootPx) {
  const map = new Map();
  for (const s of stats ?? []) {
    const n = toPx(s.value, rootPx);
    if (n === null || !(n > 0)) continue;
    const key = round2(n);
    map.set(key, (map.get(key) ?? 0) + (s.count || s.weight || 1));
  }
  return map;
}

/**
 * @param {Map<number, number>} weights px value to weight
 * @returns {4|8|null}
 */
export function detectBaseUnit(weights) {
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let on4 = 0;
  let on8 = 0;
  let oddFourUsed = false;
  for (const [value, w] of weights) {
    if (isMultiple(value, 4)) on4 += w;
    if (isMultiple(value, 8)) on8 += w;
    else if (isMultiple(value, 4) && w / total >= MIN_SHARE) oddFourUsed = true;
  }
  const share4 = on4 / total;
  const share8 = on8 / total;
  if (share8 >= BASE_COVERAGE && !oddFourUsed) return 8;
  if (share4 >= BASE_COVERAGE) return 4;
  return null;
}

export function analyzeSpacing(raw) {
  const weights = toPxStats(raw.spacing, raw.rootFontSizePx);
  const baseUnitPx = detectBaseUnit(weights);
  const total = [...weights.values()].reduce((a, b) => a + b, 0) || 1;

  const merged = new Map();
  for (const [value, w] of weights) {
    let key = value;
    if (baseUnitPx) {
      const multiple = Math.round(value / baseUnitPx) * baseUnitPx;
      if (multiple === 0 || Math.abs(multiple - value) > SNAP_PX) continue;
      key = multiple;
    }
    merged.set(key, (merged.get(key) ?? 0) + w);
  }

  const tokens = [...merged.entries()]
    .filter(([, w]) => w / total >= MIN_SHARE)
    .sort((a, b) => a[0] - b[0])
    .map(([value, w], i) => ({
      id: `s${i + 1}`,
      name: baseUnitPx
        ? `space-${value / baseUnitPx}`
        : `space-${String(value).replace('.', '-')}px`,
      px: value,
      usageShare: round4(w / total),
      excluded: false,
    }));
  return { baseUnitPx, tokens };
}

export function analyzeRadii(raw) {
  const map = new Map();
  let full = 0;
  for (const s of raw.radii ?? []) {
    const value = String(s.value).trim();
    const weight = s.count || 1;
    if (value === '50%') {
      full += weight;
      continue;
    }
    const n = toPx(value, raw.rootFontSizePx);
    if (n === null || !(n > 0)) continue;
    if (n >= FULL_RADIUS_PX) {
      full += weight;
      continue;
    }
    const key = round2(n);
    map.set(key, (map.get(key) ?? 0) + weight);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0) + full || 1;
  const kept = [...map.entries()]
    .filter(([, w]) => w / total >= MIN_SHARE)
    .sort((a, b) => a[0] - b[0]);
  const tokens = kept.map(([value, w], i) => ({
    id: '',
    name: `radius-${RADIUS_NAMES[i] ?? `${i - RADIUS_NAMES.length + 5}xl`}`,
    px: value,
    usageShare: round4(w / total),
    excluded: false,
  }));
  if (full > 0 && full / total >= MIN_SHARE) {
    tokens.push({
      id: '',
      name: 'radius-full',
      px: FULL_RADIUS_PX,
      usageShare: round4(full / total),
      excluded: false,
    });
  }
  tokens.forEach((t, i) => (t.id = `r${i + 1}`));
  return tokens;
}

/** Largest blur radius across the layers of a computed box-shadow. */
export function shadowBlur(value) {
  let max = 0;
  for (const layer of splitLayers(value)) {
    const lengths = layer
      .replace(/(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/gi, ' ')
      .split(/\s+/)
      .filter((part) => /^-?\d*\.?\d+(px)?$/.test(part))
      .map(Number.parseFloat);
    if (lengths.length >= 3) max = Math.max(max, lengths[2]);
  }
  return max;
}

function splitLayers(value) {
  const layers = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      layers.push(current);
      current = '';
    } else current += ch;
  }
  layers.push(current);
  return layers.map((l) => l.trim()).filter(Boolean);
}

export function analyzeShadows(raw) {
  const map = new Map();
  for (const s of raw.shadows ?? []) {
    if (!s.value || s.value === 'none') continue;
    map.set(s.value, (map.get(s.value) ?? 0) + (s.count || 1));
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  const top = [...map.entries()]
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .slice(0, MAX_SHADOWS)
    .map(([value, w]) => ({ value, w, blur: shadowBlur(value) }))
    .sort((a, b) => a.blur - b.blur || cmp(a.value, b.value));
  const names = top.length >= MAX_SHADOWS ? SHADOW_NAMES : SHADOW_NAMES.slice(1);
  return top.map((s, i) => ({
    id: `h${i + 1}`,
    name: `shadow-${names[i]}`,
    value: s.value,
    blurPx: s.blur,
    usageShare: round4(s.w / total),
    excluded: false,
  }));
}

export function analyzeBreakpoints(raw) {
  const values = (raw.breakpoints ?? []).filter((v) => v >= 320 && v <= 3840);
  const unique = [...new Set(values)].slice(0, BREAKPOINT_NAMES.length).sort((a, b) => a - b);
  return unique.map((value, i) => ({
    id: `b${i + 1}`,
    name: BREAKPOINT_NAMES[i],
    px: value,
    usageShare: 0,
    excluded: false,
  }));
}
