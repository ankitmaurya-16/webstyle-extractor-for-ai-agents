// Parsing helpers shared by the analysis stages. Pure functions only.

/**
 * Converts a CSS length to px. rem and em use the page's root font size, because computed
 * styles are already px and only custom properties still carry relative units.
 * @param {string} value
 * @param {number} rootFontSizePx
 * @returns {number|null}
 */
export function toPx(value, rootFontSizePx = 16) {
  const m = /^\s*(-?\d*\.?\d+)(px|rem|em)?\s*$/i.exec(String(value));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'px').toLowerCase();
  if (unit === 'px') return n;
  return n * rootFontSizePx;
}

/** Rounds to two decimals so float noise from layout does not create duplicate tokens. */
export const round2 = (n) => Math.round(n * 100) / 100;

/** Formats a px number the way exporters print it: 16px, 15.5px. */
export const px = (n) => `${round2(n)}px`;

/** Stable comparison for strings. */
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
  'inherit',
  'initial',
]);

/**
 * Splits a font-family list into names without quotes.
 * @param {string} value
 * @returns {string[]}
 */
export function parseFontStack(value) {
  const names = [];
  let current = '';
  let quote = null;
  for (const ch of String(value)) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      names.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  names.push(current.trim());
  return names.filter(Boolean).map((n) => n.replace(/\s+/g, ' '));
}

export const isGenericFamily = (name) => GENERIC_FAMILIES.has(name.toLowerCase());

/** Formats a stack for CSS: real family names quoted, generic keywords bare. */
export function formatFontStack(stack) {
  return stack.map((name) => (isGenericFamily(name) ? name : `"${name}"`)).join(', ');
}
