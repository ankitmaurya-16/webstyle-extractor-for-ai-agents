// Typography stage: font families, the type scale and the heading map (F3).

import { cmp, isGenericFamily, parseFontStack, round2, toPx } from './units.js';

const MIN_SHARE = 0.005;
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const SMALLER = ['sm', 'xs', '2xs', '3xs', '4xs'];
const LARGER = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];

/** Parses the collector's "size|lineHeight|weight|family" text style records. */
function parseTextStyles(raw) {
  return (raw.textStyles ?? []).map((stat) => {
    const [size, lineHeight, weight, ...family] = stat.value.split('|');
    return {
      sizePx: round2(toPx(size, raw.rootFontSizePx) ?? 0),
      lineHeightPx:
        lineHeight === 'normal' ? null : round2(toPx(lineHeight, raw.rootFontSizePx) ?? 0),
      weight: Number(weight) || 400,
      family: family.join('|'),
      weightChars: stat.weight,
      tags: stat.contexts,
    };
  });
}

function classifyFamily(stack) {
  const generics = stack.map((n) => n.toLowerCase());
  if (generics.some((n) => n === 'monospace' || n === 'ui-monospace')) return 'mono';
  if (generics.some((n) => n === 'serif' || n === 'ui-serif')) return 'serif';
  if (stack.some((n) => /mono|code|consol|courier/i.test(n) && !isGenericFamily(n))) return 'mono';
  return 'sans';
}

/**
 * @param {import('../model/types.js').RawSnapshot} raw
 */
export function analyzeTypography(raw) {
  const styles = parseTextStyles(raw);
  const totalText = styles.reduce((s, t) => s + t.weightChars, 0) || 1;

  // Families: keep the declared stack, drop rare ones, name by generic class.
  const familyStats = [...(raw.fontFamilies ?? [])].sort(
    (a, b) => b.weight - a.weight || cmp(a.value, b.value),
  );
  const familyTotal = familyStats.reduce((s, f) => s + f.weight, 0) || 1;
  const headingOnly = (value) => {
    const uses = styles.filter((s) => s.family === value);
    return (
      uses.length > 0 &&
      uses.every((s) => s.tags.length > 0 && s.tags.every((t) => HEADINGS.includes(t)))
    );
  };

  const families = [];
  const familyIdByValue = new Map();
  const usedNames = new Set();
  for (const stat of familyStats) {
    if (stat.weight / familyTotal < MIN_SHARE) continue;
    const stack = parseFontStack(stat.value);
    if (stack.length === 0) continue;
    const key = stack.join(',').toLowerCase();
    const existing = families.find((f) => f.stack.join(',').toLowerCase() === key);
    if (existing) {
      familyIdByValue.set(stat.value, existing.id);
      existing.usageShare = round4(existing.usageShare + stat.weight / familyTotal);
      continue;
    }
    let base = headingOnly(stat.value) ? 'display' : classifyFamily(stack);
    let name = base;
    for (let i = 2; usedNames.has(name); i += 1) name = `${base}-${i}`;
    usedNames.add(name);
    const id = `f${families.length + 1}`;
    families.push({
      id,
      name,
      stack,
      usageShare: round4(stat.weight / familyTotal),
      excluded: false,
    });
    familyIdByValue.set(stat.value, id);
  }

  // Sizes: aggregate text styles by size.
  const bySize = new Map();
  for (const s of styles) {
    if (!(s.sizePx > 0)) continue;
    const entry = bySize.get(s.sizePx) ?? {
      sizePx: s.sizePx,
      weight: 0,
      bodyWeight: 0,
      lineHeights: new Map(),
      weights: new Map(),
      families: new Map(),
    };
    entry.weight += s.weightChars;
    if (!s.tags.some((t) => HEADINGS.includes(t))) entry.bodyWeight += s.weightChars;
    bump(entry.lineHeights, s.lineHeightPx, s.weightChars);
    bump(entry.weights, s.weight, s.weightChars);
    bump(entry.families, s.family, s.weightChars);
    bySize.set(s.sizePx, entry);
  }

  // Headings map to the size of their most common sample.
  const headingSize = new Map();
  for (const level of HEADINGS) {
    const sample = (raw.samples ?? [])
      .filter((s) => s.kind === level)
      .sort((a, b) => b.count - a.count)[0];
    const size = sample ? toPx(sample.styles['font-size'], raw.rootFontSizePx) : null;
    if (size) headingSize.set(level, round2(size));
  }
  const headingSizes = new Set(headingSize.values());

  const kept = [...bySize.values()].filter(
    (e) => e.weight / totalText >= MIN_SHARE || headingSizes.has(e.sizePx),
  );
  for (const size of headingSizes) {
    if (!kept.some((e) => e.sizePx === size)) {
      kept.push({
        sizePx: size,
        weight: 0,
        bodyWeight: 0,
        lineHeights: new Map(),
        weights: new Map(),
        families: new Map(),
      });
    }
  }
  kept.sort((a, b) => a.sizePx - b.sizePx);

  const base = [...kept].sort(
    (a, b) => b.bodyWeight - a.bodyWeight || b.weight - a.weight || a.sizePx - b.sizePx,
  )[0];
  const baseIndex = kept.indexOf(base);

  const sizes = kept.map((entry, i) => {
    let name;
    if (i === baseIndex) name = 'base';
    else if (i < baseIndex) name = SMALLER[baseIndex - i - 1] ?? `${baseIndex - i + 1}xs`;
    else name = LARGER[i - baseIndex - 1] ?? `${i - baseIndex - 1}xl`;
    const sample = (level) =>
      (raw.samples ?? []).filter((s) => s.kind === level).sort((a, b) => b.count - a.count)[0];
    // A size only used by headings takes its line height and weight from the heading sample.
    const heading = HEADINGS.find((h) => headingSize.get(h) === entry.sizePx);
    const headingStyles = heading ? sample(heading)?.styles : undefined;
    const lineHeight = top(entry.lineHeights) ?? lineHeightFrom(headingStyles, raw.rootFontSizePx);
    const family = top(entry.families) ?? headingStyles?.['font-family'];
    return {
      id: `t${i + 1}`,
      name,
      sizePx: entry.sizePx,
      lineHeightPx: lineHeight ?? null,
      weight: top(entry.weights) ?? (Number(headingStyles?.['font-weight']) || 400),
      familyId: (family !== undefined && familyIdByValue.get(family)) || null,
      headings: HEADINGS.filter((h) => headingSize.get(h) === entry.sizePx),
      usageShare: round4(entry.weight / totalText),
      excluded: false,
    };
  });

  return { families, sizes };
}

function lineHeightFrom(styles, rootPx) {
  if (!styles) return null;
  const v = styles['line-height'];
  if (!v || v === 'normal') return null;
  const n = toPx(v, rootPx);
  return n === null ? null : round2(n);
}

function bump(map, key, weight) {
  map.set(key, (map.get(key) ?? 0) + weight);
}

/** Key with the largest weight; ties go to the first key in sort order. */
function top(map) {
  let best;
  let bestWeight = -1;
  const keys = [...map.keys()].sort((a, b) => cmp(String(a), String(b)));
  for (const key of keys) {
    const w = map.get(key);
    if (w > bestWeight) {
      best = key;
      bestWeight = w;
    }
  }
  return best;
}

const round4 = (n) => Math.round(n * 10000) / 10000;
