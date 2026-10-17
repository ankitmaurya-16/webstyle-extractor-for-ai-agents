// Small accumulator used while walking the page. Kept free of DOM access so it can be unit tested.

export class StatMap {
  constructor() {
    /** @type {Map<string, {value: string, count: number, weight: number, contexts: Set<string>}>} */
    this.map = new Map();
  }

  /**
   * @param {string} value
   * @param {number} weight
   * @param {string[]} [contexts]
   * @param {boolean} [byContext] keep one entry per value and context set, so a color used on
   *   both links and plain text reports its interactive count separately
   */
  add(value, weight, contexts = [], byContext = false) {
    if (!value) return;
    const key = byContext ? `${value}|${contexts.join(',')}` : value;
    let entry = this.map.get(key);
    if (!entry) {
      entry = { value, count: 0, weight: 0, contexts: new Set() };
      this.map.set(key, entry);
    }
    entry.count += 1;
    entry.weight += weight;
    for (const context of contexts) entry.contexts.add(context);
  }

  /** @returns {import('../model/types.js').ValueStat[]} sorted by weight, heaviest first */
  toStats() {
    return [...this.map.values()]
      .map((e) => ({
        value: e.value,
        count: e.count,
        weight: Math.round(e.weight * 100) / 100,
        contexts: [...e.contexts].sort(),
      }))
      .sort((a, b) => b.weight - a.weight || b.count - a.count || cmp(a.value, b.value));
  }
}

/** Groups identical component styles and keeps the most common ones per kind. */
export class SampleMap {
  constructor(perKind = 8) {
    this.perKind = perKind;
    /** @type {Map<string, {kind: string, styles: Record<string,string>, count: number}>} */
    this.map = new Map();
  }

  add(kind, styles) {
    const key = kind + '\u0000' + JSON.stringify(styles);
    const entry = this.map.get(key);
    if (entry) entry.count += 1;
    else this.map.set(key, { kind, styles, count: 1 });
  }

  toSamples() {
    const byKind = new Map();
    for (const sample of this.map.values()) {
      const list = byKind.get(sample.kind) ?? [];
      list.push(sample);
      byKind.set(sample.kind, list);
    }
    const out = [];
    for (const list of byKind.values()) {
      list.sort(
        (a, b) => b.count - a.count || cmp(JSON.stringify(a.styles), JSON.stringify(b.styles)),
      );
      out.push(...list.slice(0, this.perKind));
    }
    return out;
  }
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Normalizes a media-query bound to the breakpoint it describes. Bootstrap-style max-width
 * bounds such as 767.98px or 767px describe the 768px breakpoint.
 * @param {number} px
 * @param {'min'|'max'} kind
 */
export function breakpointFromBound(px, kind) {
  const rounded = Math.round(px);
  if (kind === 'max' && (rounded + 1) % 16 === 0) return rounded + 1;
  return rounded;
}

const LENGTH = '(\\d+(?:\\.\\d+)?)(px|em|rem)';
const MEDIA_PATTERNS = [
  { re: new RegExp(`min-width\\s*:\\s*${LENGTH}`, 'gi'), kind: 'min' },
  { re: new RegExp(`max-width\\s*:\\s*${LENGTH}`, 'gi'), kind: 'max' },
  { re: new RegExp(`width\\s*>=?\\s*${LENGTH}`, 'gi'), kind: 'min' },
  { re: new RegExp(`width\\s*<=?\\s*${LENGTH}`, 'gi'), kind: 'max' },
  { re: new RegExp(`${LENGTH}\\s*<=?\\s*width`, 'gi'), kind: 'min' },
];

/**
 * Pulls width breakpoints out of a media condition such as "(min-width: 768px)".
 * em and rem in media queries are relative to the initial font size, 16px.
 * @param {string} condition
 * @returns {number[]}
 */
export function parseMediaBreakpoints(condition) {
  const found = [];
  for (const { re, kind } of MEDIA_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(condition))) {
      const value = Number(match[1]);
      const px = match[2].toLowerCase() === 'px' ? value : value * 16;
      if (px > 0 && px < 10000) found.push(breakpointFromBound(px, kind));
    }
  }
  return found;
}

/**
 * Relative luminance of an rgb()/rgba() string, or null if it is in another syntax.
 * @param {string} value
 */
export function rgbLuminance(value) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
    value.trim(),
  );
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** True for colors with zero alpha and the keyword transparent. */
export function isTransparent(value) {
  if (!value || value === 'transparent') return true;
  const v = value.trim();
  if (/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(v)) return true;
  return /\/\s*0(?:\.0+)?%?\s*\)$/.test(v);
}
