// Typography (F3, F15, F19): families with web fonts, the type scale, letter spacing and
// composite text styles. Pure.

import { ids } from '../model/ids.js';
import { cmp, isGenericFamily, parseFontStack, round2, toPx } from './units.js';

const MIN_SHARE = 0.005;
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const SMALLER = ['sm', 'xs', '2xs', '3xs', '4xs'];
const LARGER = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];
const MAX_TEXT_STYLES = 12;

/** Tailwind's tracking names (AC-F15.3). */
export const TRACKING_NAMES = [
  ['tighter', -0.05],
  ['tight', -0.025],
  ['normal', 0],
  ['wide', 0.025],
  ['wider', 0.05],
  ['widest', 0.1],
];

const round4 = (n) => Math.round(n * 10000) / 10000;

function classifyFamily(stack) {
  const lower = stack.map((n) => n.toLowerCase());
  if (lower.some((n) => n === 'monospace' || n === 'ui-monospace')) return 'mono';
  if (lower.some((n) => n === 'serif' || n === 'ui-serif')) return 'serif';
  if (stack.some((n) => /mono|code|consol|courier/i.test(n) && !isGenericFamily(n))) return 'mono';
  return 'sans';
}

/**
 * @param {object} raw pooled RawSnapshotV2 of the primary theme
 * @param {object[]} webFonts FontFaceInfo list
 */
export function analyzeTypography(raw, webFonts = []) {
  const styles = raw.textStyles ?? [];
  const totalText = styles.reduce((s, t) => s + t.usage, 0) || 1;

  // ---- Families ----
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
    const id = ids.family(stack[0]);
    const existing = families.find((f) => f.id === id);
    if (existing) {
      familyIdByValue.set(stat.value, existing.id);
      existing.usageShare = round4(existing.usageShare + stat.weight / familyTotal);
      existing.count += stat.count;
      continue;
    }
    const base = headingOnly(stat.value) ? 'display' : classifyFamily(stack);
    let name = base;
    for (let i = 2; usedNames.has(name); i += 1) name = `${base}-${i}`;
    usedNames.add(name);
    const webFont =
      webFonts.find((w) => w.family.toLowerCase() === stack[0].toLowerCase() && w.loaded) ?? null;
    families.push({
      id,
      name,
      stack,
      webFont,
      usageShare: round4(stat.weight / familyTotal),
      count: stat.count,
      excluded: false,
    });
    familyIdByValue.set(stat.value, id);
  }

  // ---- Sizes ----
  const bySize = new Map();
  for (const s of styles) {
    const sizePx = round2(s.sizePx);
    if (!(sizePx > 0)) continue;
    const e = bySize.get(sizePx) ?? {
      sizePx,
      weight: 0,
      bodyWeight: 0,
      count: 0,
      lineHeights: new Map(),
      weights: new Map(),
      families: new Map(),
      tracking: new Map(),
    };
    e.weight += s.usage;
    e.count += s.count;
    if (!s.tags.some((t) => HEADINGS.includes(t))) e.bodyWeight += s.usage;
    bump(e.lineHeights, s.lineHeightPx === null ? null : round2(s.lineHeightPx), s.usage);
    bump(e.weights, s.fontWeight, s.usage);
    bump(e.families, s.family, s.usage);
    bump(e.tracking, s.letterSpacingEm, s.usage);
    bySize.set(sizePx, e);
  }
  const headingSample = (level) =>
    (raw.samples ?? []).filter((s) => s.kind === level).sort((a, b) => b.count - a.count)[0];
  const headingSize = new Map();
  for (const level of HEADINGS) {
    const sample = headingSample(level);
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
        count: 0,
        lineHeights: new Map(),
        weights: new Map(),
        families: new Map(),
        tracking: new Map(),
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
    const heading = HEADINGS.find((h) => headingSize.get(h) === entry.sizePx);
    const hs = heading ? headingSample(heading)?.styles : undefined;
    const lineHeight = top(entry.lineHeights) ?? lineHeightFrom(hs, raw.rootFontSizePx);
    const family = top(entry.families) ?? hs?.['font-family'];
    const fontWeight = top(entry.weights) ?? (Number(hs?.['font-weight']) || 400);
    return {
      id: ids.text(entry.sizePx, lineHeight ?? null, fontWeight),
      name,
      sizePx: entry.sizePx,
      lineHeightPx: lineHeight ?? null,
      fontWeight,
      letterSpacingEm: top(entry.tracking) ?? 0,
      familyId: (family !== undefined && familyIdByValue.get(family)) || null,
      headings: HEADINGS.filter((h) => headingSize.get(h) === entry.sizePx),
      usageShare: round4(entry.weight / totalText),
      count: entry.count,
      excluded: false,
    };
  });

  // ---- Letter spacing (F15) ----
  const trackingStats = new Map();
  for (const s of raw.letterSpacings ?? []) {
    const em = Math.round(Number(s.value) * 1000) / 1000;
    if (!Number.isFinite(em)) continue;
    const e = trackingStats.get(em) ?? { weight: 0, count: 0 };
    e.weight += s.weight;
    // The element count feeds confidence; without it every tracking token scored as unused.
    e.count += s.count || 0;
    trackingStats.set(em, e);
  }
  const trackingTotal = [...trackingStats.values()].reduce((a, e) => a + e.weight, 0) || 1;
  let custom = 0;
  const letterSpacings = [...trackingStats.entries()]
    .filter(([, e]) => e.weight / trackingTotal >= MIN_SHARE)
    .sort((a, b) => b[1].weight - a[1].weight || a[0] - b[0])
    .map(([em, e]) => {
      const named = TRACKING_NAMES.find(([, v]) => Math.abs(v - em) <= 0.005);
      return {
        id: ids.tracking(em),
        name: named ? `tracking-${named[0]}` : null,
        em,
        usageShare: round4(e.weight / trackingTotal),
        count: e.count,
        excluded: false,
      };
    })
    .map((t) => (t.name ? t : { ...t, name: `tracking-custom-${(custom += 1)}` }))
    .sort((a, b) => a.em - b.em);

  // ---- Text styles (F15) ----
  const textStyles = buildTextStyles(styles, base?.sizePx ?? 16, familyIdByValue, totalText);

  return { families, sizes, letterSpacings, textStyles, familyIdByValue };
}

function buildTextStyles(styles, baseSize, familyIdByValue, totalText) {
  const sorted = [...styles].sort((a, b) => b.usage - a.usage || a.sizePx - b.sizePx);
  const named = [];
  const taken = new Set();
  const take = (style, name) => {
    if (
      !style ||
      taken.has(style) ||
      named.some((n) => n.name === name) ||
      named.length >= MAX_TEXT_STYLES
    )
      return;
    taken.add(style);
    named.push({ style, name });
  };
  for (const tag of [...HEADINGS, 'button', 'label', 'code'])
    take(
      sorted.find((s) => s.tags.includes(tag)),
      tag,
    );
  const nonHeading = sorted.filter((s) => !s.tags.some((t) => HEADINGS.includes(t)));
  const largest = [...nonHeading].sort((a, b) => b.sizePx - a.sizePx)[0];
  if (largest && largest.sizePx >= baseSize * 1.5) take(largest, 'display');
  take(
    nonHeading.find(
      (s) => s.textTransform === 'uppercase' && s.letterSpacingEm > 0 && s.sizePx <= baseSize,
    ),
    'overline',
  );
  const body =
    nonHeading.find((s) => s.tags.includes('p') && !taken.has(s)) ??
    nonHeading.find((s) => !taken.has(s));
  take(body, 'body');
  if (body) {
    const smaller = nonHeading.filter((s) => !taken.has(s) && s.sizePx < body.sizePx);
    const bodySm = smaller[0];
    take(bodySm, 'body-sm');
    if (bodySm)
      take(
        smaller.find((s) => !taken.has(s) && s.sizePx < bodySm.sizePx),
        'caption',
      );
  }
  return named.map(({ style, name }) => ({
    id: ids.textStyle(
      [
        style.family,
        style.sizePx,
        style.lineHeightPx,
        style.fontWeight,
        style.letterSpacingEm,
        style.textTransform,
      ].join('|'),
    ),
    name,
    familyId: familyIdByValue.get(style.family) ?? null,
    family: style.family,
    sizePx: round2(style.sizePx),
    lineHeightPx: style.lineHeightPx === null ? null : round2(style.lineHeightPx),
    fontWeight: style.fontWeight,
    letterSpacingEm: style.letterSpacingEm,
    textTransform: style.textTransform,
    usedFor: [...style.tags].sort(),
    usageShare: round4(style.usage / totalText),
    count: style.count,
    excluded: false,
  }));
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
