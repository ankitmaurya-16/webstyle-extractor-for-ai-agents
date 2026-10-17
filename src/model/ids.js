// Stable, value-based token ids (v2 spec section 6.3). Two tokens with the same id are the same
// token across re-runs, merged pages and themes.

export { fnv1a } from '../collect/aggregate.js';
import { fnv1a } from '../collect/aggregate.js';

const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export const ids = {
  color: (hex, alpha = 1) => (alpha >= 1 ? `color:${hex.slice(0, 7)}` : `color:${hex.slice(0, 7)}@${Math.round(alpha * 100)}`),
  space: (px) => `space:${r(px)}`,
  radius: (px) => `radius:${r(px)}`,
  border: (px) => `border:${r(px)}`,
  container: (px) => `container:${r(px)}`,
  gap: (px) => `gap:${r(px)}`,
  breakpoint: (px) => `breakpoint:${r(px)}`,
  text: (size, line, weight) => `text:${r(size)}/${line === null ? 'normal' : r(line)}/${weight}`,
  textStyle: (key) => `textStyle:${fnv1a(key)}`,
  tracking: (em) => `tracking:${r(em, 3)}`,
  family: (first) => `family:${String(first).toLowerCase().replace(/\s+/g, '-')}`,
  duration: (ms) => `duration:${r(ms, 0)}`,
  easing: (css) => `easing:${css.replace(/\s+/g, '')}`,
  shadow: (css) => `shadow:${fnv1a(css.replace(/\s+/g, ' ').trim())}`,
  gradient: (css) => `gradient:${fnv1a(css.replace(/\s+/g, ' ').trim())}`,
  z: (value) => `z:${value}`,
  opacity: (value) => `opacity:${r(value)}`,
  grid: (count) => `grid:${count}`,
  component: (kind, variant) => `component:${kind}:${variant}`,
};

/** The category part of a token id. */
export const categoryOf = (id) => String(id).split(':')[0];
