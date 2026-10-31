// WCAG 2.x contrast (F27). Pure; APCA is out of scope.

import { differenceEuclidean, parse, wcagContrast } from 'culori';

const distance = differenceEuclidean('oklab');
export const TOKEN_MATCH = 0.02;

/** WCAG contrast ratio of two opaque colors, rounded to 2 decimals. */
export function contrastRatio(a, b) {
  return Math.round(wcagContrast(a.slice(0, 7), b.slice(0, 7)) * 100) / 100;
}

/** Large text: at least 24 px, or at least 18.66 px with weight 700 or more (AC-F27.3). */
export const isLargeText = (sizePx, weight) => sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);

/** AAA, AA, AA-large or fail. */
export function contrastLevel(ratio, large) {
  if (large) {
    if (ratio >= 4.5) return 'AAA';
    if (ratio >= 3) return 'AA-large';
    return 'fail';
  }
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return 'fail';
}

/** The color token closest to a hex by effective color, within OKLab 0.02. */
export function nearestToken(hex, tokens) {
  const target = parse(hex.slice(0, 7));
  let best = null;
  let bestD = Infinity;
  for (const t of tokens) {
    const d = distance(parse((t.effectiveHex ?? t.hex).slice(0, 7)), target);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return bestD < TOKEN_MATCH ? best : null;
}

/**
 * Aggregates ContrastSamples per token pair and theme with element counts (AC-F27.4).
 * Pairs whose colors match no token are dropped.
 * @param {Record<string, object[]>} samplesByMode
 * @param {object[]} colorTokens
 */
export function contrastResults(samplesByMode, colorTokens) {
  const visible = colorTokens.filter((t) => !t.excluded);
  const map = new Map();
  for (const [mode, samples] of Object.entries(samplesByMode)) {
    for (const s of samples ?? []) {
      const text = nearestToken(s.effectiveText, visible);
      const bg = nearestToken(s.effectiveBg, visible);
      if (!text || !bg || text.id === bg.id) continue;
      const large = isLargeText(s.sizePx, s.fontWeight);
      const key = `${mode}|${text.id}|${bg.id}|${large}`;
      const e = map.get(key);
      if (e) e.count += s.count;
      else {
        // The ratio belongs to the token pair, not to whichever sample came first: samples merged
        // into one token differ slightly, and the agent will use the token values.
        const ratio = contrastRatio(text.effectiveHex ?? text.hex, bg.effectiveHex ?? bg.hex);
        map.set(key, {
          textTokenId: text.id,
          backgroundTokenId: bg.id,
          mode,
          ratio,
          large,
          level: contrastLevel(ratio, large),
          count: s.count,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.ratio - b.ratio);
}

/**
 * Non-text checks at 3:1 (WCAG 1.4.11): the focus ring against the background and input
 * borders against the input fill (AC-F27.5).
 */
export function nonTextChecks({ focusRingHex, backgroundHex, inputBorderHex, inputBackgroundHex }) {
  const out = [];
  if (focusRingHex && backgroundHex) {
    const ratio = contrastRatio(focusRingHex, backgroundHex);
    out.push({ check: 'focus-ring', ratio, pass: ratio >= 3 });
  }
  if (inputBorderHex && inputBackgroundHex) {
    const ratio = contrastRatio(inputBorderHex, inputBackgroundHex);
    out.push({ check: 'input-border', ratio, pass: ratio >= 3 });
  }
  return out;
}
