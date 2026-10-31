// Motion (F14): durations and easings. Pure.

import { ids } from '../model/ids.js';
import { cmp } from './units.js';

const MAX_DURATIONS = 6;
const KEYWORD_BEZIER = {
  ease: [0.25, 0.1, 0.25, 1],
  linear: [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};
/** Tailwind's default curves take Tailwind's names (AC-F14.3). */
const TAILWIND_CURVES = [
  ['ease-in', [0.4, 0, 1, 1]],
  ['ease-out', [0, 0, 0.2, 1]],
  ['ease-in-out', [0.4, 0, 0.2, 1]],
];

const round4 = (n) => Math.round(n * 10000) / 10000;
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Normalizes an easing: keywords as-is, cubic-bezier rounded to 3 decimals, steps() raw. */
export function normalizeEasing(value) {
  const v = String(value).trim();
  const m = /^cubic-bezier\(\s*([^)]+)\)$/i.exec(v);
  if (m) {
    const nums = m[1].split(',').map((n) => r3(Number(n)));
    if (nums.length === 4 && nums.every(Number.isFinite))
      return { css: `cubic-bezier(${nums.join(', ')})`, bezier: nums };
  }
  if (KEYWORD_BEZIER[v]) return { css: v, bezier: KEYWORD_BEZIER[v] };
  return { css: v, bezier: null };
}

export function analyzeMotion(raw) {
  const durationMap = new Map();
  for (const s of raw.durations ?? []) {
    const ms = Math.round(Number(s.value));
    if (!(ms > 0)) continue;
    durationMap.set(ms, (durationMap.get(ms) ?? 0) + (s.count || 1));
  }
  const dTotal = [...durationMap.values()].reduce((a, b) => a + b, 0) || 1;
  const durations = [...durationMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, MAX_DURATIONS)
    .sort((a, b) => a[0] - b[0])
    .map(([ms, w]) => ({
      id: ids.duration(ms),
      name: `duration-${ms}`,
      ms,
      usageShare: round4(w / dTotal),
      count: w,
      excluded: false,
    }));

  const easingMap = new Map();
  for (const s of raw.easings ?? []) {
    const { css, bezier } = normalizeEasing(s.value);
    const e = easingMap.get(css) ?? { css, bezier, count: 0 };
    e.count += s.count || 1;
    easingMap.set(css, e);
  }
  const eTotal = [...easingMap.values()].reduce((a, e) => a + e.count, 0) || 1;
  let custom = 0;
  const used = new Set();
  const easings = [...easingMap.values()]
    .sort((a, b) => b.count - a.count || cmp(a.css, b.css))
    .slice(0, 6)
    .map((e) => {
      let name;
      if (KEYWORD_BEZIER[e.css]) name = e.css;
      else if (e.bezier) {
        const tw = TAILWIND_CURVES.find(([, b]) =>
          b.every((v, i) => Math.abs(v - e.bezier[i]) < 0.001),
        );
        name = tw ? tw[0] : null;
      }
      if (!name || used.has(name)) name = `ease-custom-${(custom += 1)}`;
      used.add(name);
      return {
        id: ids.easing(e.css),
        name,
        css: e.css,
        bezier: e.bezier,
        usageShare: round4(e.count / eTotal),
        count: e.count,
        excluded: false,
      };
    });

  const props = [...(raw.transitionProperties ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((p) => p.value);
  return { durations, easings, properties: props, reducedMotion: Boolean(raw.reducedMotion) };
}
