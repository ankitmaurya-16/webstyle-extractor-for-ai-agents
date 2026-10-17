// Component recipes (F5): default-state styles of buttons, inputs, links and headings, with
// values that match a token stored as a token reference.

import { normalizeColor } from './colors.js';
import { cmp, parseFontStack, round2, toPx } from './units.js';
import { RECIPE_PROPERTIES } from '../model/types.js';

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * Builds a reference to a token. `id` lets edits follow renames and merges; `raw` is the value
 * shown and exported when the token is excluded.
 */
const ref = (category, token, raw) => ({ ref: `${category}.${token.name}`, id: token.id, raw });

/** Collapses four padding values to the shortest equivalent CSS shorthand. */
export function collapseBox(value) {
  const parts = String(value).trim().split(/\s+/);
  const [t, r = t, b = t, l = r] = parts;
  if (t === r && t === b && t === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

function borderValue(value) {
  if (!value || value === 'none') return 'none';
  const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(value);
  if (!m) return value;
  const color = normalizeColor(m[3]);
  if (!color) return 'none';
  return `${m[1]} ${m[2]} ${color.hex}`;
}

/**
 * @param {import('../model/types.js').RawSnapshot} raw
 * @param {object} tokens the tokens built so far
 * @param {(value: string) => object|null} findColor
 */
export function buildRecipes(raw, tokens, findColor) {
  const rootPx = raw.rootFontSizePx;
  const primary = tokens.colors.find((c) => c.roles.includes('primary'));

  const style = (sample) => {
    const s = sample.styles;
    const out = {};
    const colorValue = (value) => {
      const color = normalizeColor(value);
      if (!color) return 'transparent';
      const token = findColor(value);
      return token ? ref('color', token, color.hex) : color.hex;
    };
    out['background-color'] = colorValue(s['background-color']);
    out.color = colorValue(s.color);
    out.border = borderValue(s.border);

    const radius = collapseBox(s['border-radius'] ?? '0px');
    const radiusPx = radius.includes(' ') ? null : toPx(radius, rootPx);
    const radiusToken =
      radius === '50%' || (radiusPx !== null && radiusPx >= 9999)
        ? tokens.radii.find((r) => r.name === 'radius-full')
        : tokens.radii.find((r) => radiusPx !== null && r.px === round2(radiusPx));
    out['border-radius'] = radiusToken ? ref('radius', radiusToken, radius) : radius;

    out.padding = collapseBox(s.padding ?? '0px');

    const stack = parseFontStack(s['font-family'] ?? '');
    const family = tokens.typography.families.find(
      (f) => f.stack.join(',').toLowerCase() === stack.join(',').toLowerCase(),
    );
    out['font-family'] = family ? ref('font', family, s['font-family']) : s['font-family'];

    const sizePx = toPx(s['font-size'] ?? '', rootPx);
    const size = tokens.typography.sizes.find(
      (t) => sizePx !== null && t.sizePx === round2(sizePx),
    );
    out['font-size'] = size ? ref('text', size, s['font-size']) : s['font-size'];
    out['font-weight'] = s['font-weight'];
    out['line-height'] = s['line-height'];

    const shadow = s['box-shadow'];
    const shadowToken = tokens.shadows.find((t) => t.value === shadow);
    out['box-shadow'] = shadowToken ? ref('shadow', shadowToken, shadow) : (shadow ?? 'none');

    const ordered = {};
    for (const prop of RECIPE_PROPERTIES) if (out[prop] !== undefined) ordered[prop] = out[prop];
    return ordered;
  };

  const byCount = (kind) =>
    (raw.samples ?? [])
      .filter((s) => s.kind === kind)
      .sort((a, b) => b.count - a.count || cmp(JSON.stringify(a.styles), JSON.stringify(b.styles)));

  const recipes = [];
  const push = (kind, variant, sample) =>
    recipes.push({ id: '', kind, variant, styles: style(sample), excluded: false });

  const buttons = byCount('button');
  if (buttons.length > 0) {
    const first = buttons[0];
    const isPrimary =
      primary !== undefined && findColor(first.styles['background-color'])?.id === primary.id;
    push('button', isPrimary ? 'primary' : 'default', first);
    const look = (s) => [s.styles['background-color'], s.styles.color, s.styles.border].join('|');
    const second = buttons.find((s) => look(s) !== look(first));
    if (second) push('button', 'secondary', second);
  }
  const input = byCount('input')[0];
  if (input) push('input', 'default', input);
  const link = byCount('link')[0];
  if (link) push('link', 'default', link);
  for (const level of HEADINGS) {
    const heading = byCount(level)[0];
    if (heading) push('heading', level, heading);
  }
  recipes.forEach((r, i) => (r.id = `p${i + 1}`));
  return recipes;
}
