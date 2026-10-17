// Color stages: normalize, translucency, cluster, roles and naming (F2, F9). Rules live in
// docs/data-model.md and docs/v2-spec.md F9.

import { converter, differenceEuclidean, formatHex, formatHex8, parse, wcagContrast } from 'culori';
import { HUE_FAMILIES, STEPS } from '../model/types.js';
import { ids } from '../model/ids.js';
import { cmp } from './units.js';

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const oklabDistance = differenceEuclidean('oklab');

export const MERGE_DISTANCE = 0.02;
export const MIN_SHARE = 0.005;
export const SATURATED_CHROMA = 0.08;
export const MUTED_MIN_CONTRAST = 3;
export const ALPHA_STEP = 0.05;
export const OVERLAY_MIN_ALPHA = 0.3;
export const OVERLAY_MIN_COVERAGE = 0.25;
// Tuned on the fixtures. Chroma alone misjudges both ends: dark blue-tinted grays such as
// #111827 reach chroma 0.034, while pastel tints such as #dcfce7 stay under 0.045. Relative
// chroma, c / (L * (1 - L)), separates them.
export const GRAY_CHROMA = 0.02;
export const GRAY_RELATIVE_CHROMA = 0.25;
const CONTEXTS = ['text', 'background', 'border', 'outline', 'gradient'];

const HUE_RANGES = [
  ['red', 0, 40],
  ['orange', 40, 75],
  ['yellow', 75, 115],
  ['green', 115, 165],
  ['teal', 165, 215],
  ['blue', 215, 265],
  ['indigo', 265, 290],
  ['purple', 290, 320],
  ['pink', 320, 345],
  ['red', 345, 360.0001],
];
const STEP_BANDS = [
  [100, 0.93],
  [200, 0.86],
  [300, 0.78],
  [400, 0.7],
  [500, 0.62],
  [600, 0.54],
  [700, 0.45],
  [800, 0.35],
  [900, -Infinity],
];

const clamp01 = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Parses a CSS color to lowercase hex. Fully transparent and unparseable colors return null.
 * @param {string} value
 * @returns {{hex: string, alpha: number}|null}
 */
export function normalizeColor(value) {
  let parsed;
  try {
    parsed = parse(String(value).trim());
  } catch {
    return null;
  }
  if (!parsed) return null;
  const alpha = parsed.alpha ?? 1;
  if (alpha <= 0) return null;
  const rgb = toRgb(parsed);
  const clamped = { mode: 'rgb', r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b), alpha: Math.round(alpha * 255) / 255 };
  const hex = alpha >= 1 ? formatHex(clamped) : formatHex8(clamped);
  return { hex: hex.toLowerCase(), alpha: alpha >= 1 ? 1 : Math.round(alpha * 1000) / 1000 };
}

export function oklchOf(hex) {
  const c = toOklch(parse(hex.slice(0, 7)));
  const h = c.h === undefined || Number.isNaN(c.h) || c.c < 1e-4 ? null : round(c.h, 2);
  return { l: round(c.l, 4), c: round(c.c, 4), h };
}

/** Rounds alpha to the nearest 0.05 (AC-F9.3). */
export const alphaBucket = (a) => Math.max(ALPHA_STEP, Math.min(0.95, Math.round(a / ALPHA_STEP) * ALPHA_STEP));

const emptyWeights = () => ({ text: 0, background: 0, border: 0, outline: 0, gradient: 0 });

function emptyMode() {
  return {
    weights: emptyWeights(),
    count: 0,
    interactiveCount: 0,
    interactiveBackgroundCount: 0,
    maxBackground: 0,
    viewportArea: 0,
  };
}

/**
 * Normalize stage. Parses every ColorStat of every mode, drops fully transparent values and
 * combines identical colors while keeping weight per context and per mode.
 * @param {Array<{mode: 'light'|'dark', stats: object[], viewportArea: number}>} inputs
 */
export function normalizeColors(inputs) {
  const byHex = new Map();
  let skipped = 0;
  for (const { mode, stats, viewportArea } of inputs) {
    for (const stat of stats) {
      const color = normalizeColor(stat.value);
      if (!color) {
        if (parse(String(stat.value)) === undefined) skipped += 1;
        continue;
      }
      let entry = byHex.get(color.hex);
      if (!entry) {
        entry = {
          hex: color.hex,
          alpha: color.alpha,
          modes: {},
          contexts: new Set(),
          effective: new Map(),
          imageWeight: 0,
          totalWeight: 0,
        };
        byHex.set(color.hex, entry);
      }
      const m = (entry.modes[mode] ??= emptyMode());
      m.viewportArea = Math.max(m.viewportArea, viewportArea ?? 0);
      const context = CONTEXTS.find((c) => stat.contexts.includes(c)) ?? 'text';
      m.weights[context] += stat.weight;
      m.count += stat.count;
      if (stat.contexts.includes('interactive')) {
        m.interactiveCount += stat.count;
        if (context === 'background') m.interactiveBackgroundCount += stat.count;
      }
      if (context === 'background') m.maxBackground = Math.max(m.maxBackground, stat.maxWeight ?? stat.weight);
      for (const c of stat.contexts) entry.contexts.add(c);
      const eff = stat.effectiveHex ?? color.hex.slice(0, 7);
      const key = `${eff}|${stat.backdropHex ?? eff}`;
      entry.effective.set(key, (entry.effective.get(key) ?? 0) + stat.weight + 1e-6);
      entry.imageWeight += (stat.overImageShare ?? 0) * stat.weight;
      entry.totalWeight += stat.weight;
    }
  }
  return { colors: [...byHex.values()], skipped };
}

/** Total weight per context across all colors and modes. */
function contextTotals(colors) {
  const totals = emptyWeights();
  for (const c of colors) for (const m of Object.values(c.modes)) for (const k of CONTEXTS) totals[k] += m.weights[k];
  return totals;
}

/**
 * Usage share: the mean of a color's share of text, fill (including gradient stops) and border
 * weight, over the contexts the page uses. Shares across all colors sum to 1.
 */
export function computeShares(colors) {
  const t = contextTotals(colors);
  const totals = { text: t.text, background: t.background + t.gradient, border: t.border + t.outline };
  const used = Object.keys(totals).filter((k) => totals[k] > 0);
  for (const c of colors) {
    const w = emptyWeights();
    for (const m of Object.values(c.modes)) for (const k of CONTEXTS) w[k] += m.weights[k];
    const mine = { text: w.text, background: w.background + w.gradient, border: w.border + w.outline };
    c.share = used.length ? used.reduce((sum, k) => sum + mine[k] / totals[k], 0) / used.length : 0;
  }
  return colors;
}

function mergeModes(into, from) {
  for (const [mode, m] of Object.entries(from.modes)) {
    const target = (into.modes[mode] ??= emptyMode());
    for (const k of CONTEXTS) target.weights[k] += m.weights[k];
    target.count += m.count;
    target.interactiveCount += m.interactiveCount;
    target.interactiveBackgroundCount += m.interactiveBackgroundCount;
    target.maxBackground = Math.max(target.maxBackground, m.maxBackground);
    target.viewportArea = Math.max(target.viewportArea, m.viewportArea);
  }
  for (const c of from.contexts) into.contexts.add(c);
  for (const [k, v] of from.effective) into.effective.set(k, (into.effective.get(k) ?? 0) + v);
  into.imageWeight += from.imageWeight;
  into.totalWeight += from.totalWeight;
}

/**
 * Cluster stage. Opaque colors closer than OKLab 0.02 merge (most-used wins, AC-F2.2).
 * Translucent colors group by base RGB within OKLab 0.02 and alpha rounded to 0.05 (AC-F9.3).
 */
export function clusterColors(colors) {
  const sorted = [...colors].sort((a, b) => b.share - a.share || cmp(a.hex, b.hex));
  const clusters = [];
  for (const color of sorted) {
    const translucent = color.alpha < 1;
    const bucket = translucent ? alphaBucket(color.alpha) : 1;
    const parsed = parse(color.hex.slice(0, 7));
    const target = clusters.find(
      (c) => c.translucent === translucent && c.alphaBucket === bucket && oklabDistance(c.parsed, parsed) < MERGE_DISTANCE,
    );
    if (target) {
      mergeModes(target, color);
      target.share += color.share;
      target.mergedFrom.push(color.hex);
    } else {
      clusters.push({
        ...color,
        ownShare: color.share,
        modes: structuredClone(color.modes),
        contexts: new Set(color.contexts),
        effective: new Map(color.effective),
        translucent,
        alphaBucket: bucket,
        parsed,
        mergedFrom: [],
      });
    }
  }
  for (const c of clusters) {
    c.oklch = oklchOf(c.hex);
    c.mergedFrom.sort();
    const [effKey] = [...c.effective.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0] ?? [`${c.hex}|${c.hex}`];
    [c.effectiveHex, c.backdropHex] = effKey.split('|');
    c.effectiveOklch = oklchOf(c.effectiveHex);
    c.overImageShare = c.totalWeight > 0 ? c.imageWeight / c.totalWeight : 0;
    c.family = familyOf({ oklch: c.oklch });
  }
  return clusters;
}

const isSaturated = (c) => (c.translucent ? c.effectiveOklch : c.oklch).c >= SATURATED_CHROMA;
const hueDistance = (a, b) => {
  if (a === null || b === null) return 0;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Roles stage for one mode. Roles and contrast use effective colors, so translucent tokens can
 * hold text-muted, border and overlay (AC-F9.5, AC-F9.6). Returns { role: cluster }.
 * @param {object[]} clusters
 * @param {'light'|'dark'} mode
 */
export function assignRoles(clusters, mode) {
  const inMode = clusters.filter((c) => c.modes[mode]);
  const w = (c, k) => c.modes[mode]?.weights[k] ?? 0;
  const roles = {};
  const by = (k) => (a, b) => w(b, k) - w(a, k) || b.share - a.share || cmp(a.hex, b.hex);
  const opaque = inMode.filter((c) => !c.translucent);

  const backgrounds = opaque.filter((c) => w(c, 'background') > 0).sort(by('background'));
  if (backgrounds[0]) roles.background = backgrounds[0];
  if (backgrounds[1] && w(backgrounds[1], 'background') >= 0.05 * w(backgrounds[0], 'background')) {
    roles.surface = backgrounds[1];
  }

  const opaqueTexts = opaque.filter((c) => w(c, 'text') > 0).sort(by('text'));
  const allTexts = inMode.filter((c) => w(c, 'text') > 0).sort(by('text'));
  const text = opaqueTexts[0] ?? allTexts[0];
  if (text) {
    roles.text = text;
    const reference = roles.background?.effectiveHex ?? (mode === 'dark' ? '#121212' : '#ffffff');
    const textContrast = wcagContrast(text.effectiveHex, reference);
    const muted = allTexts.find((c) => {
      if (c === text) return false;
      const contrast = wcagContrast(c.effectiveHex, reference);
      return !isSaturated(c) && contrast < textContrast && contrast >= MUTED_MIN_CONTRAST;
    });
    if (muted) roles['text-muted'] = muted;
  }

  const borders = inMode.filter((c) => w(c, 'border') > 0).sort(by('border'));
  if (borders[0]) roles.border = borders[0];

  const interactive = opaque
    .filter((c) => (c.modes[mode]?.interactiveCount ?? 0) > 0 && isSaturated(c))
    .sort(
      (a, b) =>
        b.modes[mode].interactiveCount - a.modes[mode].interactiveCount ||
        b.modes[mode].interactiveBackgroundCount - a.modes[mode].interactiveBackgroundCount ||
        b.share - a.share ||
        cmp(a.hex, b.hex),
    );
  const primary = interactive[0];
  if (primary) {
    roles.primary = primary;
    const accent = interactive.slice(1).find((c) => hueDistance(c.oklch.h, primary.oklch.h) >= 30);
    if (accent) roles.accent = accent;
  }

  // Status colors: saturated, used on at least 2 elements, not primary, and not on gradient
  // usage alone (AC-F18.2).
  const statusCandidates = opaque
    .filter((c) => {
      const m = c.modes[mode];
      const nonGradient = m.weights.text + m.weights.background + m.weights.border + m.weights.outline;
      return c !== primary && isSaturated(c) && m.count >= 2 && nonGradient > 0;
    })
    .sort((a, b) => b.share - a.share || cmp(a.hex, b.hex));
  const used = new Set();
  for (const [role, families] of [
    ['success', ['green']],
    ['warning', ['yellow', 'orange']],
    ['danger', ['red']],
  ]) {
    const pick = statusCandidates.find((c) => families.includes(c.family) && !used.has(c));
    if (pick) {
      roles[role] = pick;
      used.add(pick);
    }
  }

  // Overlay: the most-used translucent fill with alpha of at least 0.3 covering at least 25% of
  // the viewport (AC-F9.6).
  const overlay = inMode
    .filter((c) => {
      const m = c.modes[mode];
      return (
        c.translucent &&
        c.alphaBucket >= OVERLAY_MIN_ALPHA &&
        m.weights.background > 0 &&
        m.viewportArea > 0 &&
        m.maxBackground >= OVERLAY_MIN_COVERAGE * m.viewportArea
      );
    })
    .sort(by('background'))[0];
  if (overlay) roles.overlay = overlay;
  return roles;
}

/** @returns {import('../model/types.js').HueFamily|'white'|'black'} */
export function familyOf(color) {
  const { l, c, h } = color.oklch;
  if (l >= 0.99 && c < 0.01) return 'white';
  if (l <= 0.01) return 'black';
  if (c < GRAY_CHROMA || h === null || c / (l * (1 - l)) < GRAY_RELATIVE_CHROMA) return 'gray';
  for (const [family, from, to] of HUE_RANGES) if (h >= from && h < to) return family;
  return 'red';
}

export function stepOf(lightness) {
  for (const [step, min] of STEP_BANDS) if (lightness >= min) return step;
  return 900;
}

/**
 * Naming stage. Opaque colors get family-step names with AC-F2.4 collision handling.
 * Translucent colors are named `<base>/<alpha%>` after the matching opaque token, white, black
 * or the family-step name of their RGB; no opaque token is created for them (AC-F9.4).
 * Returns ColorTokenV2-shaped objects (without confidence and site names) in export order.
 */
export function nameColors(clusters) {
  const opaque = clusters.filter((c) => !c.translucent);
  const byFamily = new Map();
  for (const c of opaque) {
    const list = byFamily.get(c.family) ?? [];
    list.push(c);
    byFamily.set(c.family, list);
  }
  for (const [family, list] of byFamily) {
    list.sort((a, b) => b.share - a.share || cmp(a.hex, b.hex));
    const occupied = new Map();
    let extra = 0;
    for (const c of list) {
      if (family === 'white' || family === 'black') {
        c.step = null;
        c.name = family;
        continue;
      }
      const natural = stepOf(c.oklch.l);
      let step = natural;
      if (occupied.has(step)) {
        const holder = occupied.get(step);
        const direction = c.oklch.l > holder.oklch.l ? -1 : 1;
        step = null;
        for (let i = STEPS.indexOf(natural) + direction; i >= 0 && i < STEPS.length; i += direction) {
          if (!occupied.has(STEPS[i])) {
            step = STEPS[i];
            break;
          }
        }
      }
      if (step === null) {
        extra += 1;
        c.step = null;
        c.name = `${family}-extra-${extra}`;
      } else {
        occupied.set(step, c);
        c.step = step;
        c.name = `${family}-${step}`;
      }
    }
  }

  for (const c of clusters.filter((x) => x.translucent)) {
    const base = opaque.find((o) => oklabDistance(o.parsed, c.parsed) < MERGE_DISTANCE);
    c.baseCluster = base ?? null;
    c.step = null;
    let baseName;
    if (base) baseName = base.name;
    else if (c.family === 'white' || c.family === 'black') baseName = c.family;
    else baseName = `${c.family}-${stepOf(c.oklch.l)}`;
    c.name = `${baseName}/${Math.round(c.alphaBucket * 100)}`;
  }

  const familyRank = (f) => ['white', 'black', ...HUE_FAMILIES].indexOf(f);
  const ordered = [...clusters].sort(
    (a, b) =>
      Number(a.translucent) - Number(b.translucent) ||
      familyRank(a.family) - familyRank(b.family) ||
      (a.step ?? 1000) - (b.step ?? 1000) ||
      cmp(a.name, b.name),
  );
  const taken = new Set();
  const unique = (name) => {
    let candidate = name;
    for (let i = 2; taken.has(candidate); i += 1) candidate = `${name}-${i}`;
    taken.add(candidate);
    return candidate;
  };
  for (const c of ordered) {
    c.id = ids.color(c.hex, c.translucent ? c.alphaBucket : 1);
    c.name = unique(c.name);
  }
  return ordered;
}

/** Finds the token a raw page color ended up in, through merges. */
export function colorLookup(tokens) {
  const map = new Map();
  for (const t of tokens) {
    map.set(t.hex, t);
    for (const hex of t.mergedFrom) if (!map.has(hex)) map.set(hex, t);
  }
  return (value) => {
    const color = normalizeColor(value);
    if (!color) return null;
    const direct = map.get(color.hex);
    if (direct) return direct;
    // Translucent values outside the cluster's exact list still match their bucket.
    if (color.alpha < 1) {
      const parsed = parse(color.hex.slice(0, 7));
      return (
        tokens.find(
          (t) => t.alpha < 1 && Math.abs(t.alpha - alphaBucket(color.alpha)) < 0.001 && oklabDistance(parse(t.hex.slice(0, 7)), parsed) < MERGE_DISTANCE,
        ) ?? null
      );
    }
    return null;
  };
}

export { wcagContrast, oklabDistance };
