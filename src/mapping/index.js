// Map to my tokens (F38): parse a user's token file and match extracted tokens to it. Pure.

import { differenceEuclidean, parse } from 'culori';
import { categories, visible } from '../model/design.js';
import { resolveVars } from '../collect/stylesheets.js';
import { normalizeShadow, parseVariableValue } from '../analyze/variables.js';
import { normalizeEasing } from '../analyze/motion.js';
import { dtcgShadow } from '../export/dtcg.js';

const distance = differenceEuclidean('oklab');
export const COLOR_EXACT = 0.005;
export const COLOR_CLOSE = 0.02;

export class MappingParseError extends Error {
  constructor(file) {
    super(`Couldn't read tokens from ${file}`);
    this.code = 'MAPPING_PARSE_FAILED';
  }
}

/**
 * Parses DTCG JSON, CSS custom properties or Tailwind v4 @theme blocks into
 * [{ name, parsed }] with types inferred from values (AC-F38.1).
 * @param {string} text
 * @param {string} fileName
 */
export function parseTokenFile(text, fileName = 'tokens') {
  const trimmed = String(text ?? '').trim();
  let tokens;
  if (trimmed.startsWith('{')) {
    let json;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new MappingParseError(fileName);
    }
    tokens = parseDtcg(json);
  } else {
    tokens = parseCssVariables(trimmed);
  }
  if (tokens.length === 0) throw new MappingParseError(fileName);
  return tokens;
}

/** DTCG: nested groups, $value, inherited $type, aliases resolved before matching (AC-F38.2). */
export function parseDtcg(json) {
  const raw = new Map();
  const walk = (node, path, inheritedType) => {
    if (!node || typeof node !== 'object') return;
    const type = node.$type ?? inheritedType;
    if ('$value' in node) {
      raw.set(path.join('.'), { type, value: node.$value });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (!key.startsWith('$')) walk(child, [...path, key], type);
    }
  };
  walk(json, [], undefined);
  const resolve = (value, seen = new Set()) => {
    if (typeof value === 'string') {
      const m = /^\{([^}]+)\}$/.exec(value.trim());
      if (m) {
        if (seen.has(m[1])) return null;
        const target = raw.get(m[1]);
        return target ? resolve(target.value, new Set(seen).add(m[1])) : null;
      }
    }
    return value;
  };
  const out = [];
  for (const [name, { type, value }] of raw) {
    const v = resolve(value);
    if (v === null || v === undefined) continue;
    const parsed = dtcgValue(type, v);
    if (parsed) out.push({ name, parsed });
  }
  return out;
}

function dtcgValue(type, v) {
  if (type === 'color' || (typeof v === 'object' && v && 'colorSpace' in v)) {
    if (typeof v === 'string') return parseVariableValue(v);
    if (v.hex) return parseVariableValue(v.hex);
    if (Array.isArray(v.components)) {
      const [r, g, b] = v.components.map((n) => Math.round(n * 255));
      return parseVariableValue(
        `rgb(${r} ${g} ${b}${v.alpha !== undefined && v.alpha < 1 ? ` / ${v.alpha}` : ''})`,
      );
    }
    return null;
  }
  if (type === 'dimension' || (typeof v === 'object' && v && 'unit' in v && 'value' in v)) {
    if (typeof v === 'string') return parseVariableValue(v);
    if (v.unit === 'px') return { type: 'length', px: v.value };
    if (v.unit === 'rem') return { type: 'length', px: v.value * 16 };
    if (v.unit === 'ms') return { type: 'duration', ms: v.value };
    if (v.unit === 's') return { type: 'duration', ms: v.value * 1000 };
    return null;
  }
  if (type === 'duration')
    return typeof v === 'string'
      ? parseVariableValue(v)
      : { type: 'duration', ms: v.unit === 's' ? v.value * 1000 : v.value };
  if (type === 'fontFamily') {
    const first = Array.isArray(v) ? v[0] : String(v).split(',')[0];
    return { type: 'font', first: String(first).replace(/["']/g, '').trim().toLowerCase() };
  }
  if (type === 'shadow' && typeof v === 'string')
    return { type: 'shadow', css: normalizeShadow(v) };
  if (type === 'shadow' && typeof v === 'object' && v) return { type: 'shadow', layers: v };
  if (type === 'cubicBezier' && Array.isArray(v))
    return { type: 'easing', css: `cubic-bezier(${v.join(', ')})` };
  if (typeof v === 'number') return { type: 'number', value: v };
  if (typeof v === 'string') return parseVariableValue(v);
  return null;
}

/** CSS custom properties (first declaration per name) and Tailwind v4 @theme blocks. */
export function parseCssVariables(text) {
  const decls = new Map();
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // The last declaration in a block may omit its semicolon.
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+?)\s*(?:;|(?=\}))/g)) {
    if (!decls.has(m[1])) decls.set(m[1], m[2].trim());
  }
  const out = [];
  for (const [name, value] of decls) {
    const resolved = resolveVars(value, (n) => decls.get(n));
    const parsed = parseVariableValue(resolved);
    if (parsed) out.push({ name, parsed });
  }
  return out;
}

const SIZE_CATEGORIES = ['space', 'radius', 'border', 'container', 'gap', 'breakpoint', 'text'];

/** Distance and status of one extracted token against one user token (AC-F38.3). */
function compare(category, token, parsed) {
  if (category === 'color') {
    if (parsed.type !== 'color') return null;
    const dist =
      distance(parse(token.hex.slice(0, 7)), parse(parsed.hex.slice(0, 7))) +
      Math.abs((token.alpha ?? 1) - (parsed.alpha ?? 1));
    if (dist < COLOR_EXACT) return { status: 'exact', delta: Math.round(dist * 1000) / 1000 };
    if (dist < COLOR_CLOSE) return { status: 'close', delta: Math.round(dist * 1000) / 1000 };
    return null;
  }
  if (SIZE_CATEGORIES.includes(category)) {
    if (parsed.type !== 'length') return null;
    const px = category === 'text' ? token.sizePx : token.px;
    const delta = Math.abs(px - parsed.px);
    if (delta < 0.01) return { status: 'exact', delta: 0 };
    if (delta <= 1) return { status: 'close', delta: Math.round(delta * 100) / 100 };
    return null;
  }
  if (category === 'duration') {
    if (parsed.type !== 'duration') return null;
    const delta = Math.abs(token.ms - parsed.ms);
    if (delta < 0.5) return { status: 'exact', delta: 0 };
    if (delta <= 10) return { status: 'close', delta };
    return null;
  }
  if (category === 'shadow') {
    if (parsed.type !== 'shadow') return null;
    const key = shadowKey(parsed.layers ?? parsed.css);
    return key !== null && key === shadowKey(token.value) ? { status: 'exact', delta: 0 } : null;
  }
  if (category === 'easing') {
    return parsed.type === 'easing' && normalizeEasing(parsed.css).css === token.css
      ? { status: 'exact', delta: 0 }
      : null;
  }
  if (category === 'font') {
    return parsed.type === 'font' && parsed.first === (token.stack[0] ?? '').toLowerCase()
      ? { status: 'exact', delta: 0 }
      : null;
  }
  return null;
}

/**
 * A shadow in one canonical form, so `0 1px 2px #0000000d` and Chrome's computed
 * `rgba(0, 0, 0, 0.05) 0px 1px 2px 0px` compare equal, as do DTCG shadow objects.
 * @param {string|object|object[]} value
 */
export function shadowKey(value) {
  const layers = typeof value === 'string' ? dtcgShadow(value) : value;
  if (!layers || typeof layers !== 'object') return null;
  const keys = (Array.isArray(layers) ? layers : [layers]).map(layerKey);
  return keys.includes(null) ? null : keys.join(', ');
}

function layerKey(layer) {
  const len = (d) => {
    if (typeof d === 'number') return d;
    if (typeof d === 'string') return parseVariableValue(d)?.px ?? Number.parseFloat(d);
    if (d && typeof d === 'object') return d.unit === 'rem' ? d.value * 16 : d.value;
    return 0;
  };
  const hex = colorHex(layer?.color);
  if (!hex) return null;
  const parts = [layer.offsetX, layer.offsetY, layer.blur, layer.spread].map(
    (d) => Math.round(len(d ?? 0) * 100) / 100,
  );
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return `${layer.inset ? 'inset ' : ''}${parts.join(' ')} ${hex}`;
}

function colorHex(c) {
  if (typeof c === 'string')
    return parseVariableValue(c)?.type === 'color' ? parseVariableValue(c).hex : null;
  if (c && typeof c === 'object' && Array.isArray(c.components)) {
    const [r, g, b] = c.components.map((n) => Math.round(n * 255));
    const alpha = c.alpha !== undefined && c.alpha < 1 ? ` / ${c.alpha}` : '';
    return colorHex(`rgb(${r} ${g} ${b}${alpha})`);
  }
  return null;
}

/** Words in a user token name that point at an extracted category, for breaking ties. */
const CATEGORY_HINTS = {
  space: /spac|padding|margin/,
  gap: /gap|spac/,
  radius: /radius|rounded/,
  border: /border/,
  container: /container|max-w|width/,
  breakpoint: /breakpoint|screen|bp/,
  text: /text|font-size|size/,
};
const hintScore = (category, name) => (CATEGORY_HINTS[category]?.test(name.toLowerCase()) ? 1 : 0);

const better = (category, r, name, best) => {
  if (!best) return true;
  if (r.delta !== best.delta) return r.delta < best.delta;
  const hint = hintScore(category, name) - hintScore(category, best.userToken);
  if (hint !== 0) return hint > 0;
  return name.length < best.userToken.length;
};

const MAPPED = [
  'color',
  'font',
  'text',
  'space',
  'container',
  'gap',
  'radius',
  'border',
  'shadow',
  'duration',
  'easing',
  'breakpoint',
];

/**
 * @returns {{sourceName: string, importedAt: number, useMyNames: boolean, entries: object[]}}
 */
export function mapTokens(design, fileText, fileName, now = Date.now()) {
  const userTokens = parseTokenFile(fileText, fileName);
  const entries = [];
  const lists = categories(design);
  for (const category of MAPPED) {
    for (const token of visible(lists[category])) {
      let best = null;
      for (const u of userTokens) {
        const r = compare(category, token, u.parsed);
        if (!r) continue;
        if (better(category, r, u.name, best)) best = { ...r, userToken: u.name };
      }
      entries.push(
        best
          ? {
              tokenId: token.id,
              category,
              userToken: best.userToken,
              status: best.status,
              delta: best.delta,
            }
          : { tokenId: token.id, category, userToken: null, status: 'none', delta: null },
      );
    }
  }
  return { sourceName: fileName, importedAt: now, useMyNames: false, entries };
}

export function mappingCounts(mapping) {
  const counts = { exact: 0, close: 0, none: 0 };
  for (const e of mapping?.entries ?? []) counts[e.status] += 1;
  return counts;
}
