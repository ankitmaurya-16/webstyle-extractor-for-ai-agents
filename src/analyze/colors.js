// Color stages: normalize, cluster, roles and naming. Rules live in docs/data-model.md.

import { converter, differenceEuclidean, formatHex, formatHex8, parse, wcagContrast } from 'culori';
import { HUE_FAMILIES, STEPS } from '../model/types.js';
import { cmp } from './units.js';

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const oklabDistance = differenceEuclidean('oklab');

export const MERGE_DISTANCE = 0.02;
export const MIN_SHARE = 0.005;
export const SATURATED_CHROMA = 0.08;
export const MUTED_MIN_CONTRAST = 3;
// Tuned on the fixtures. Chroma alone misjudges both ends: dark blue-tinted grays such as
// #111827 reach chroma 0.034, while pastel tints such as #dcfce7 stay under 0.045. Relative
// chroma, c / (L * (1 - L)), separates them.
export const GRAY_CHROMA = 0.02;
export const GRAY_RELATIVE_CHROMA = 0.25;
const CONTEXTS = ['text', 'background', 'border'];

/** Hue ranges from the naming table; red wraps around 0. */
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

/** Lower bounds of each step's lightness band, lightest first. */
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
  const clamped = {
    mode: 'rgb',
    r: clamp01(rgb.r),
    g: clamp01(rgb.g),
    b: clamp01(rgb.b),
    alpha: Math.round(alpha * 255) / 255,
  };
  const hex = alpha >= 1 ? formatHex(clamped) : formatHex8(clamped);
  return { hex: hex.toLowerCase(), alpha: alpha >= 1 ? 1 : Math.round(alpha * 1000) / 1000 };
}

const clamp01 = (n) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

export function oklchOf(hex) {
  const c = toOklch(parse(hex));
  const h = c.h === undefined || Number.isNaN(c.h) || c.c < 1e-4 ? null : round(c.h, 2);
  return { l: round(c.l, 4), c: round(c.c, 4), h };
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Normalize stage: parses every color ValueStat, drops transparent ones and combines identical
 * hex values while keeping weight per context.
 * @param {import('../model/types.js').ValueStat[]} stats
 */
export function normalizeColors(stats) {
  const byHex = new Map();
  let skipped = 0;
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
        weights: { text: 0, background: 0, border: 0 },
        count: 0,
        interactiveCount: 0,
        interactiveBackgroundCount: 0,
        contexts: new Set(),
      };
      byHex.set(color.hex, entry);
    }
    const primaryContext = CONTEXTS.find((c) => stat.contexts.includes(c)) ?? 'text';
    entry.weights[primaryContext] += stat.weight;
    entry.count += stat.count;
    if (stat.contexts.includes('interactive')) {
      entry.interactiveCount += stat.count;
      if (primaryContext === 'background') entry.interactiveBackgroundCount += stat.count;
    }
    for (const c of stat.contexts) entry.contexts.add(c);
  }
  return { colors: [...byHex.values()], skipped };
}

/**
 * A color's share of usage: the mean of its share of text, background and border weight, over
 * the contexts the page uses. Shares across all colors sum to 1.
 */
export function computeShares(colors) {
  const totals = { text: 0, background: 0, border: 0 };
  for (const c of colors) for (const k of CONTEXTS) totals[k] += c.weights[k];
  const used = CONTEXTS.filter((k) => totals[k] > 0);
  for (const c of colors) {
    c.share = used.length
      ? used.reduce((sum, k) => sum + c.weights[k] / totals[k], 0) / used.length
      : 0;
  }
  return colors;
}

/**
 * Cluster stage: merges colors within OKLab distance 0.02. The most-used color of a cluster
 * keeps its hex; the rest are recorded in mergedFrom.
 */
export function clusterColors(colors) {
  const sorted = [...colors].sort((a, b) => b.share - a.share || cmp(a.hex, b.hex));
  const clusters = [];
  for (const color of sorted) {
    const parsed = parse(color.hex);
    const target = clusters.find(
      (c) =>
        Math.abs(c.alpha - color.alpha) <= MERGE_DISTANCE &&
        oklabDistance(c.parsed, parsed) < MERGE_DISTANCE,
    );
    if (target) {
      for (const k of CONTEXTS) target.weights[k] += color.weights[k];
      target.count += color.count;
      target.interactiveCount += color.interactiveCount;
      target.interactiveBackgroundCount += color.interactiveBackgroundCount;
      target.share += color.share;
      for (const c of color.contexts) target.contexts.add(c);
      target.mergedFrom.push(color.hex);
    } else {
      clusters.push({ ...color, parsed, mergedFrom: [], contexts: new Set(color.contexts) });
    }
  }
  for (const c of clusters) {
    c.oklch = oklchOf(c.hex);
    c.mergedFrom.sort();
  }
  return clusters;
}

const isSaturated = (c) => c.oklch.c >= SATURATED_CHROMA;

const hueDistance = (a, b) => {
  if (a === null || b === null) return 0;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Roles stage: assigns semantic roles by usage, then drops colors under 0.5% that hold no role.
 * Mutates clusters by setting `roles`; returns the kept clusters.
 */
export function assignRoles(clusters) {
  for (const c of clusters) {
    c.roles = [];
    c.family = familyOf(c);
  }
  const give = (color, role) => color && color.roles.push(role);
  const by = (key) => (a, b) =>
    b.weights[key] - a.weights[key] || b.share - a.share || cmp(a.hex, b.hex);

  const backgrounds = clusters.filter((c) => c.weights.background > 0).sort(by('background'));
  const background = backgrounds[0];
  give(background, 'background');
  const surface = backgrounds[1];
  if (background && surface && surface.weights.background >= 0.05 * background.weights.background) {
    give(surface, 'surface');
  }

  const texts = clusters.filter((c) => c.weights.text > 0).sort(by('text'));
  const text = texts[0];
  give(text, 'text');
  if (text) {
    const reference = background?.hex ?? '#ffffff';
    const textContrast = wcagContrast(text.hex, reference);
    // Muted text is quiet but readable. Saturated text is a status or link color, and a color
    // with almost no contrast (white button labels on a light page) is not body text at all.
    const muted = texts.slice(1).find((c) => {
      const contrast = wcagContrast(c.hex, reference);
      return !isSaturated(c) && contrast < textContrast && contrast >= MUTED_MIN_CONTRAST;
    });
    give(muted, 'text-muted');
  }

  const borders = clusters.filter((c) => c.weights.border > 0).sort(by('border'));
  give(borders[0], 'border');

  const interactive = clusters
    .filter((c) => c.interactiveCount > 0 && isSaturated(c))
    .sort(
      (a, b) =>
        b.interactiveCount - a.interactiveCount ||
        // On a tie a button fill beats a link color.
        b.interactiveBackgroundCount - a.interactiveBackgroundCount ||
        b.share - a.share ||
        cmp(a.hex, b.hex),
    );
  const primary = interactive[0];
  give(primary, 'primary');
  if (primary) {
    const accent = interactive.slice(1).find((c) => hueDistance(c.oklch.h, primary.oklch.h) >= 30);
    give(accent, 'accent');
  }

  const status = [
    ['success', ['green']],
    ['warning', ['yellow', 'orange']],
    ['danger', ['red']],
  ];
  const statusCandidates = clusters
    .filter((c) => c !== primary && isSaturated(c) && c.count >= 2)
    .sort((a, b) => b.share - a.share || cmp(a.hex, b.hex));
  for (const [role, families] of status) {
    const pick = statusCandidates.find(
      (c) =>
        families.includes(c.family) &&
        !c.roles.some((r) => r === 'success' || r === 'warning' || r === 'danger'),
    );
    give(pick, role);
  }

  return clusters.filter((c) => c.share >= MIN_SHARE || c.roles.length > 0);
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

/** @returns {import('../model/types.js').Step} */
export function stepOf(lightness) {
  for (const [step, min] of STEP_BANDS) if (lightness >= min) return step;
  return 900;
}

/**
 * Naming stage: gives each color a family, a step and a name, resolving step collisions as
 * AC-F2.4 describes. Returns ColorTokens in export order with ids assigned.
 */
export function nameColors(clusters) {
  const named = [];
  const byFamily = new Map();
  for (const c of clusters) {
    const list = byFamily.get(c.family) ?? [];
    list.push(c);
    byFamily.set(c.family, list);
  }
  const taken = new Set();
  const unique = (name) => {
    let candidate = name;
    for (let i = 2; taken.has(candidate); i += 1) candidate = `${name}-${i}`;
    taken.add(candidate);
    return candidate;
  };

  for (const [family, list] of byFamily) {
    list.sort((a, b) => b.share - a.share || cmp(a.hex, b.hex));
    const occupied = new Map();
    let extra = 0;
    for (const c of list) {
      if (c.alpha < 1) {
        c.step = null;
        c.name = `${family}-alpha-${Math.round(c.alpha * 100)}`;
        continue;
      }
      if (family === 'white' || family === 'black') {
        c.step = null;
        c.name = family;
        continue;
      }
      const natural = stepOf(c.oklch.l);
      let step = natural;
      if (occupied.has(step)) {
        const holder = occupied.get(step);
        // Lighter colors move toward 100, darker toward 900.
        const direction = c.oklch.l > holder.oklch.l ? -1 : 1;
        step = null;
        for (
          let i = STEPS.indexOf(natural) + direction;
          i >= 0 && i < STEPS.length;
          i += direction
        ) {
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

  const familyRank = (f) => (f === 'white' ? -2 : f === 'black' ? -1 : HUE_FAMILIES.indexOf(f));
  const ordered = [...clusters].sort(
    (a, b) =>
      familyRank(a.family) - familyRank(b.family) ||
      (a.step ?? 1000) - (b.step ?? 1000) ||
      cmp(a.name, b.name),
  );
  ordered.forEach((c, i) => {
    named.push({
      id: `c${i + 1}`,
      name: unique(c.name),
      hex: c.hex,
      oklch: c.oklch,
      family: c.family,
      step: c.step,
      roles: [...c.roles],
      usageShare: round(c.share, 4),
      contexts: [...c.contexts].sort(),
      mergedFrom: c.mergedFrom,
      excluded: false,
    });
  });
  return named;
}

/** Finds the token a raw page color ended up in, through merges. */
export function colorLookup(tokens) {
  const map = new Map();
  for (const t of tokens) {
    map.set(t.hex, t);
    for (const hex of t.mergedFrom) map.set(hex, t);
  }
  return (value) => {
    const color = normalizeColor(value);
    return color ? (map.get(color.hex) ?? null) : null;
  };
}
