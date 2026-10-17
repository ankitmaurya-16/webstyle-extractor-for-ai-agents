// Pooling captures (F25) and upgrading v1 raw snapshots to the v2 shape. Pure.

import { emptyRaw } from './themes.js';

const LIST_FIELDS = [
  'colors',
  'fontFamilies',
  'fontSizes',
  'fontWeights',
  'lineHeights',
  'letterSpacings',
  'textTransforms',
  'spacing',
  'radii',
  'shadows',
  'borderWidths',
  'borderStyles',
  'opacities',
  'durations',
  'easings',
  'transitionProperties',
  'containers',
  'gridColumns',
  'gaps',
  'iconSizes',
  'iconStrokes',
];

/**
 * Fills every field a v1 RawSnapshot lacks, converting v1 text styles ("size|line|weight|family"
 * ValueStats) and colors (no backdrop) to the v2 shape (v2 spec 6.4 step 1).
 */
export function upgradeRaw(raw) {
  const base = emptyRaw(raw);
  const out = { ...base, ...raw };
  for (const field of LIST_FIELDS) out[field] = Array.isArray(raw[field]) ? raw[field] : [];
  out.colors = (raw.colors ?? []).map((c) => ({
    effectiveHex: null,
    backdropHex: null,
    overImageShare: 0,
    maxWeight: c.weight,
    ...c,
  }));
  out.textStyles = (raw.textStyles ?? []).map((s) => {
    if (typeof s.value !== 'string') return s;
    const [size, line, weight, ...family] = s.value.split('|');
    return {
      family: family.join('|'),
      sizePx: parseFloat(size) || 0,
      lineHeightPx: line === 'normal' ? null : parseFloat(line) || null,
      fontWeight: Number(weight) || 400,
      letterSpacingEm: 0,
      textTransform: 'none',
      tags: s.contexts ?? [],
      count: s.count,
      usage: s.weight,
    };
  });
  out.samples = (raw.samples ?? []).map((s, i) => ({ key: s.key ?? `${s.kind}:v1-${i}`, hints: [], ...s }));
  out.variableDefs =
    raw.variableDefs ?? Object.entries(raw.cssVariables ?? {}).map(([name, value]) => ({ name, value, scope: 'root', selector: ':root' }));
  return out;
}

/**
 * Pools several pages' captures of one theme. Each page contributes equally: every weighted
 * list is scaled so its total is the same per page (AC-F25.3).
 * @param {object[]} raws
 */
export function poolRaws(raws) {
  const list = raws.map(upgradeRaw);
  if (list.length === 1) return list[0];
  const first = list[0];
  const out = { ...first };
  const scale = (stats) => {
    const total = stats.reduce((n, s) => n + (s.weight || 0), 0);
    return total > 0 ? 1e6 / total : 1;
  };
  for (const field of LIST_FIELDS) {
    out[field] = list.flatMap((r) => {
      const f = scale(r[field]);
      return r[field].map((s) => ({ ...s, weight: s.weight * f, maxWeight: s.maxWeight === undefined ? undefined : s.maxWeight * f }));
    });
  }
  out.textStyles = list.flatMap((r) => {
    const total = r.textStyles.reduce((n, s) => n + s.usage, 0);
    const f = total > 0 ? 1e6 / total : 1;
    return r.textStyles.map((s) => ({ ...s, usage: s.usage * f }));
  });
  out.gradients = list.flatMap((r) => r.gradients ?? []);
  out.zIndices = list.flatMap((r) => r.zIndices ?? []);
  out.samples = list.flatMap((r) => r.samples ?? []);
  out.stateSamples = list.flatMap((r) => r.stateSamples ?? []);
  out.representatives = list.flatMap((r) => r.representatives ?? []);
  out.contrastSamples = list.flatMap((r) => r.contrastSamples ?? []);
  out.frameworkSignals = list.flatMap((r) => r.frameworkSignals ?? []);
  out.iconSignals = list.flatMap((r) => r.iconSignals ?? []);
  out.themeRootRules = list.flatMap((r) => r.themeRootRules ?? []);
  out.breakpoints = [...new Set(list.flatMap((r) => r.breakpoints ?? []))];
  out.fontFaces = uniteFonts(list.flatMap((r) => r.fontFaces ?? []));
  out.reducedMotion = list.some((r) => r.reducedMotion);
  out.truncated = list.some((r) => r.truncated);
  out.elementsSampled = list.reduce((n, r) => n + r.elementsSampled, 0);
  out.stylesheets = {
    readable: list.reduce((n, r) => n + (r.stylesheets?.readable ?? 0), 0),
    unreadable: list.reduce((n, r) => n + (r.stylesheets?.unreadable ?? 0), 0),
  };
  out.coverage = {
    frames: {
      read: list.reduce((n, r) => n + (r.coverage?.frames?.read ?? 0), 0),
      skipped: list.reduce((n, r) => n + (r.coverage?.frames?.skipped ?? 0), 0),
    },
    shadowRoots: list.reduce((n, r) => n + (r.coverage?.shadowRoots ?? 0), 0),
    autoScrolled: list.some((r) => r.coverage?.autoScrolled),
  };
  // Variables: unite; one name with different values keeps the most-used and records the
  // conflict (AC-F25.4).
  const { defs, usage, conflicts } = uniteVariables(list);
  out.variableDefs = defs;
  out.variableUsage = usage;
  out.variableConflicts = conflicts;
  out.themeSignals = {
    darkMedia: list.some((r) => r.themeSignals?.darkMedia),
    darkSelectors: [...new Set(list.flatMap((r) => r.themeSignals?.darkSelectors ?? []))].sort(),
    lightSelectors: [...new Set(list.flatMap((r) => r.themeSignals?.lightSelectors ?? []))].sort(),
    activeMode: first.themeSignals?.activeMode ?? first.colorScheme,
    colorSchemeProperty: first.themeSignals?.colorSchemeProperty ?? 'normal',
  };
  return out;
}

function uniteFonts(faces) {
  const map = new Map();
  for (const f of faces) {
    const e = map.get(f.family);
    if (!e) map.set(f.family, { ...f, weights: [...f.weights], styles: [...f.styles] });
    else {
      e.weights = [...new Set([...e.weights, ...f.weights])].sort((a, b) => a - b);
      e.styles = [...new Set([...e.styles, ...f.styles])].sort();
      e.loaded ||= f.loaded;
      if (e.provider === 'unknown') Object.assign(e, { provider: f.provider, providerHost: f.providerHost });
    }
  }
  return [...map.values()];
}

function uniteVariables(list) {
  const usage = {};
  for (const r of list) for (const [k, v] of Object.entries(r.variableUsage ?? {})) usage[k] = (usage[k] ?? 0) + v;
  const byKey = new Map();
  for (const r of list) {
    for (const d of r.variableDefs ?? []) {
      const key = `${d.scope}|${d.name}`;
      const values = byKey.get(key) ?? { def: d, values: new Map() };
      values.values.set(d.value, (values.values.get(d.value) ?? 0) + (r.variableUsage?.[d.name] ?? 0) + 1);
      byKey.set(key, values);
    }
  }
  const defs = [];
  const conflicts = [];
  for (const { def, values } of byKey.values()) {
    const sorted = [...values.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    defs.push({ ...def, value: sorted[0][0] });
    if (sorted.length > 1) conflicts.push({ name: def.name, scope: def.scope, kept: sorted[0][0], others: sorted.slice(1).map(([v]) => v) });
  }
  return { defs, usage, conflicts };
}
