// Layout tokens (F4, F16, F17): spacing and its base unit, radii, border widths, containers,
// grid columns, gaps, opacity, z-index, shadows and breakpoints. Pure.

import { ids } from '../model/ids.js';
import { cmp, round2, toPx } from './units.js';

const MIN_SHARE = 0.005;
const BASE_COVERAGE = 0.6;
const SNAP_PX = 1;
const RADIUS_NAMES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
const SHADOW_NAMES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
const BREAKPOINT_NAMES = ['sm', 'md', 'lg', 'xl', '2xl'];
const CONTAINER_NAMES = ['sm', 'md', 'lg', 'xl', '2xl'];
const MAX_SHADOWS = 6;
const MAX_CONTAINERS = 5;
const MAX_Z = 8;
const LAYER_NAMES = {
  'sticky-header': 'header',
  dialog: 'dialog',
  menu: 'menu',
  toast: 'toast',
  tooltip: 'tooltip',
  overlay: 'overlay',
};
export const FULL_RADIUS_PX = 9999;

const round4 = (n) => Math.round(n * 10000) / 10000;
const isMultiple = (value, unit) => Math.abs(value / unit - Math.round(value / unit)) < 1e-6;
const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);

/** Combines ValueStats that resolve to the same px value; weight is the use count. */
function toPxStats(stats, rootPx, useWeight = false) {
  const map = new Map();
  for (const s of stats ?? []) {
    const n = toPx(s.value, rootPx);
    if (n === null || !(n > 0)) continue;
    const key = round2(n);
    map.set(key, (map.get(key) ?? 0) + (useWeight ? s.weight : s.count || s.weight || 1));
  }
  return map;
}

/**
 * Base unit: 8 only when it covers 60% of the weight and no value used enough to become a token
 * sits on an odd multiple of 4; otherwise 4 when it covers 60%; otherwise none (AC-F4.1).
 * @param {Map<number, number>} weights
 * @returns {4|8|null}
 */
export function detectBaseUnit(weights) {
  const total = sum(weights);
  if (total === 0) return null;
  let on4 = 0;
  let on8 = 0;
  let oddFourUsed = false;
  for (const [value, w] of weights) {
    if (isMultiple(value, 4)) on4 += w;
    if (isMultiple(value, 8)) on8 += w;
    else if (isMultiple(value, 4) && w / total >= MIN_SHARE) oddFourUsed = true;
  }
  if (on8 / total >= BASE_COVERAGE && !oddFourUsed) return 8;
  if (on4 / total >= BASE_COVERAGE) return 4;
  return null;
}

export function analyzeSpacing(raw) {
  const weights = toPxStats(raw.spacing, raw.rootFontSizePx);
  const baseUnitPx = detectBaseUnit(weights);
  const total = sum(weights) || 1;
  const merged = new Map();
  const offScale = new Map();
  for (const [value, w] of weights) {
    let key = value;
    if (baseUnitPx) {
      const multiple = Math.round(value / baseUnitPx) * baseUnitPx;
      if (multiple === 0 || Math.abs(multiple - value) > SNAP_PX) {
        offScale.set(value, (offScale.get(value) ?? 0) + w);
        continue;
      }
      key = multiple;
    }
    merged.set(key, (merged.get(key) ?? 0) + w);
  }
  const tokens = [...merged.entries()]
    .filter(([, w]) => w / total >= MIN_SHARE)
    .sort((a, b) => a[0] - b[0])
    .map(([px, w]) => ({
      id: ids.space(px),
      name: baseUnitPx ? `space-${px / baseUnitPx}` : `space-${String(px).replace('.', '-')}px`,
      px,
      usageShare: round4(w / total),
      count: w,
      excluded: false,
    }));
  const offScaleValues = [...offScale.entries()]
    .map(([px, w]) => ({ px, usageShare: round4(w / total) }))
    .sort((a, b) => b.usageShare - a.usageShare || a.px - b.px);
  return { baseUnitPx, tokens, offScale: offScaleValues, distinctBefore: weights.size };
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
  const total = sum(map) + full || 1;
  const kept = [...map.entries()].filter(([, w]) => w / total >= MIN_SHARE).sort((a, b) => a[0] - b[0]);
  const tokens = kept.map(([px, w], i) => ({
    id: ids.radius(px),
    name: `radius-${RADIUS_NAMES[i] ?? `${i - RADIUS_NAMES.length + 5}xl`}`,
    px,
    usageShare: round4(w / total),
    count: w,
    excluded: false,
  }));
  if (full > 0 && full / total >= MIN_SHARE) {
    tokens.push({ id: ids.radius(FULL_RADIUS_PX), name: 'radius-full', px: FULL_RADIUS_PX, usageShare: round4(full / total), count: full, excluded: false });
  }
  return { tokens, distinct: map.size + (full > 0 ? 1 : 0) };
}

/** Border widths named border-<px> (F17), plus the dominant border style. */
export function analyzeBorderWidths(raw) {
  const map = toPxStats(raw.borderWidths, raw.rootFontSizePx);
  const total = sum(map) || 1;
  const tokens = [...map.entries()]
    .filter(([, w]) => w / total >= MIN_SHARE)
    .sort((a, b) => a[0] - b[0])
    .map(([px, w]) => ({ id: ids.border(px), name: `border-${String(px).replace('.', '-')}`, px, usageShare: round4(w / total), count: w, excluded: false }));
  const style = [...(raw.borderStyles ?? [])].sort((a, b) => b.count - a.count)[0]?.value ?? null;
  return { tokens, style };
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

export function splitLayers(value) {
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

/**
 * Shadows by usage, up to 6, named by blur (AC-F4.4). `byMode` holds each theme's shadow stats.
 * @param {Record<string, object[]>} byMode
 */
export function analyzeShadows(byMode) {
  const map = new Map();
  for (const [mode, stats] of Object.entries(byMode)) {
    for (const s of stats ?? []) {
      if (!s.value || s.value === 'none') continue;
      const e = map.get(s.value) ?? { count: 0, modes: new Set() };
      e.count += s.count || 1;
      e.modes.add(mode);
      map.set(s.value, e);
    }
  }
  const total = [...map.values()].reduce((a, e) => a + e.count, 0) || 1;
  const top = [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count || cmp(a[0], b[0]))
    .slice(0, MAX_SHADOWS)
    .map(([value, e]) => ({ value, e, blur: shadowBlur(value) }))
    .sort((a, b) => a.blur - b.blur || cmp(a.value, b.value));
  const names = top.length >= MAX_SHADOWS ? SHADOW_NAMES : SHADOW_NAMES.slice(1);
  const tokens = top.map((s, i) => ({
    id: ids.shadow(s.value),
    name: `shadow-${names[i]}`,
    value: s.value,
    blurPx: s.blur,
    modes: [...s.e.modes].sort(),
    usageShare: round4(s.e.count / total),
    count: s.e.count,
    excluded: false,
  }));
  return { tokens, distinct: map.size };
}

export function analyzeBreakpoints(raw) {
  const values = (raw.breakpoints ?? []).filter((v) => v >= 320 && v <= 3840);
  const unique = [...new Set(values)].slice(0, BREAKPOINT_NAMES.length).sort((a, b) => a - b);
  return unique.map((px, i) => ({ id: ids.breakpoint(px), name: BREAKPOINT_NAMES[i], px, usageShare: 0, count: 1, excluded: false }));
}

/** Centered containers by area, up to 5, plus prose (AC-F16.1, AC-F16.2). */
export function analyzeContainers(raw) {
  const map = new Map();
  let prose = null;
  for (const s of raw.containers ?? []) {
    const px = toPx(s.value, raw.rootFontSizePx);
    if (!px) continue;
    const key = round2(px);
    map.set(key, (map.get(key) ?? 0) + s.weight);
    if (s.contexts?.includes('prose') && (!prose || s.weight > prose.weight)) prose = { px: key, weight: s.weight };
  }
  const total = sum(map) || 1;
  const top = [...map.entries()]
    .filter(([px]) => !prose || px !== prose.px)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_CONTAINERS)
    .sort((a, b) => a[0] - b[0]);
  const tokens = top.map(([px, w], i) => ({
    id: ids.container(px),
    name: `container-${CONTAINER_NAMES[i]}`,
    px,
    usageShare: round4(w / total),
    count: 1,
    excluded: false,
  }));
  if (prose) {
    tokens.push({ id: ids.container(prose.px), name: 'prose', px: prose.px, usageShare: round4(prose.weight / total), count: 1, excluded: false });
  }
  return tokens;
}

/** Grid column counts with usage (AC-F16.3). */
export function analyzeGridColumns(raw) {
  const map = new Map();
  for (const s of raw.gridColumns ?? []) {
    const n = Number(s.value);
    if (!(n >= 1)) continue;
    map.set(n, (map.get(n) ?? 0) + (s.count || 1));
  }
  const total = sum(map) || 1;
  return [...map.entries()]
    .filter(([, w]) => w / total >= 0.02)
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, 6)
    .map(([value, w]) => ({ id: ids.grid(value), name: `grid-${value}`, value, usageShare: round4(w / total), count: w, excluded: false }));
}

/** Gaps; a gap equal to a spacing token references it (AC-F16.4). */
export function analyzeGaps(raw, spacingTokens) {
  const map = toPxStats(raw.gaps, raw.rootFontSizePx);
  const total = sum(map) || 1;
  return [...map.entries()]
    .filter(([, w]) => w / total >= MIN_SHARE)
    .sort((a, b) => a[0] - b[0])
    .map(([px, w]) => {
      const space = spacingTokens.find((t) => t.px === px);
      return {
        id: ids.gap(px),
        name: space ? space.name : `gap-${String(px).replace('.', '-')}`,
        px,
        spaceId: space ? space.id : null,
        usageShare: round4(w / total),
        count: w,
        excluded: false,
      };
    });
}

/** Opacity values rounded to 0.05; disabled opacity becomes opacity-disabled (AC-F17.3). */
export function analyzeOpacities(raw) {
  const map = new Map();
  for (const s of raw.opacities ?? []) {
    const v = Math.round(Number(s.value) * 20) / 20;
    if (!(v > 0 && v < 1)) continue;
    const e = map.get(v) ?? { count: 0, disabled: 0 };
    e.count += s.count || 1;
    if (s.contexts?.includes('disabled')) e.disabled += s.count || 1;
    map.set(v, e);
  }
  const total = [...map.values()].reduce((a, e) => a + e.count, 0) || 1;
  let disabledTaken = false;
  return [...map.entries()]
    .sort((a, b) => b[1].disabled - a[1].disabled || b[1].count - a[1].count)
    .map(([value, e]) => {
      let name = `opacity-${Math.round(value * 100)}`;
      if (!disabledTaken && e.disabled > 0 && e.disabled >= e.count / 2) {
        name = 'opacity-disabled';
        disabledTaken = true;
      }
      return { id: ids.opacity(value), name, value, usageShare: round4(e.count / total), count: e.count, excluded: false };
    })
    .filter((t) => t.usageShare >= 0.02 || t.name === 'opacity-disabled')
    .sort((a, b) => a.value - b.value);
}

/** Z-index tokens sorted by value, named after their dominant layer (AC-F17.2). */
export function analyzeZIndex(raw) {
  const map = new Map();
  for (const z of raw.zIndices ?? []) {
    const e = map.get(z.value) ?? { count: 0, hints: new Map() };
    e.count += z.count;
    for (const h of z.hints) e.hints.set(h, (e.hints.get(h) ?? 0) + z.count);
    map.set(z.value, e);
  }
  const total = [...map.values()].reduce((a, e) => a + e.count, 0) || 1;
  const kept = [...map.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]).slice(0, MAX_Z);
  const used = new Set();
  return kept
    .sort((a, b) => a[0] - b[0])
    .map(([value, e]) => {
      const dominant = [...e.hints.entries()].sort((a, b) => b[1] - a[1])[0];
      let layer = dominant && dominant[1] >= e.count / 2 ? dominant[0] : null;
      let name = layer ? `z-${LAYER_NAMES[layer]}` : `z-${value}`;
      if (used.has(name)) {
        name = `z-${value}`;
        layer = null;
      }
      used.add(name);
      return { id: ids.z(value), name, value, layer, usageShare: round4(e.count / total), count: e.count, excluded: false };
    });
}
