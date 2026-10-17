// Plain-language descriptions of recipe values, shared by DESIGN.md, prompt.md, the style
// guide and the panel. Pure.

import { anyRolesOf, primaryModeOf, resolveValue, rolesOf } from '../model/design.js';
import { recipeName } from '../analyze/recipes.js';

const BACKGROUND_ROLES = ['primary', 'accent', 'surface', 'background', 'success', 'warning', 'danger', 'overlay'];
const TEXT_ROLES = ['text', 'text-muted', 'primary', 'accent', 'success', 'warning', 'danger'];

/**
 * Token-first description of a color: "primary (blue-600)", "gray-900" or "#123456". Only roles
 * that make sense for the property are named.
 * @param {'background'|'text'|'border'} use
 */
export function describeColor(design, value, use = 'background', mode) {
  const { token, raw } = resolveValue(design, value);
  if (!token) return raw;
  const m = mode ?? primaryModeOf(design);
  const fitting = use === 'text' ? TEXT_ROLES : use === 'border' ? ['border', 'focus-ring'] : BACKGROUND_ROLES;
  const roles = rolesOf(design, token.id, m);
  const role = fitting.find((r) => roles.includes(r)) ?? fitting.find((r) => anyRolesOf(design, token.id).includes(r));
  return role && role !== token.name ? `${role} (${token.name})` : token.name;
}

/** Padding as spacing tokens when every side has one, with the px values in brackets. */
export function describePadding(design, padding) {
  const parts = String(padding ?? '').split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.every((p) => parseFloat(p) === 0)) return '0';
  const names = parts.map((p) => {
    const n = parseFloat(p);
    if (n === 0) return '0';
    const token = design.spacing.tokens.find((s) => !s.excluded && p.endsWith('px') && s.px === n);
    return token ? token.name : null;
  });
  if (names.every((n) => n !== null)) return `${names.join(' ')} (${parts.join(' ')})`;
  return parts.join(' ');
}

/** Border shorthand with its color described as a token. */
export function describeBorder(design, value) {
  if (!value || value === 'none') return 'none';
  const parts = String(value).split(' ');
  if (parts.length < 3) return value;
  const hex = parts.slice(2).join(' ');
  const token = design.colors.find((c) => !c.excluded && (c.hex === hex || c.mergedFrom.includes(hex)));
  return token ? `${parts[0]} ${parts[1]} ${describeColor(design, { ref: '', id: token.id, raw: hex }, 'border')}` : value;
}

const tokenName = (design, value) => {
  const { token, raw } = resolveValue(design, value);
  return token ? token.name : raw;
};

/** One recipe state as "background primary (blue-600), text white, ..." */
export function describeStyles(design, styles, mode) {
  const s = styles ?? {};
  const parts = [];
  const color = (key, label, use) => s[key] !== undefined && parts.push(`${label} ${describeColor(design, s[key], use, mode)}`);
  color('background-color', 'background', 'background');
  if (s['background-image'] && s['background-image'] !== 'none') parts.push(`background ${tokenName(design, s['background-image'])}`);
  color('color', 'text', 'text');
  if (s.border !== undefined) parts.push(`border ${describeBorder(design, s.border)}`);
  if (s['border-radius'] !== undefined) parts.push(`radius ${tokenName(design, s['border-radius'])}`);
  if (s.padding !== undefined) parts.push(`padding ${describePadding(design, s.padding)}`);
  if (s.gap !== undefined && parseFloat(resolveValue(design, s.gap).raw) > 0) parts.push(`gap ${tokenName(design, s.gap)}`);
  if (s.height !== undefined && s.height !== 'auto') parts.push(`height ${s.height}`);
  if (s['font-family'] !== undefined || s['font-size'] !== undefined) {
    const family = s['font-family'] !== undefined ? `${tokenName(design, s['font-family'])} ` : '';
    const size = s['font-size'] !== undefined ? resolveValue(design, s['font-size']).raw : '';
    const line = s['line-height'] ? `/${s['line-height']}` : '';
    const weight = s['font-weight'] ? ` weight ${s['font-weight']}` : '';
    parts.push(`font ${family}${size}${line}${weight}`.replace(/\s+/g, ' ').trim());
  } else if (s['font-weight'] !== undefined) parts.push(`weight ${s['font-weight']}`);
  if (s['letter-spacing'] && s['letter-spacing'] !== 'normal') parts.push(`tracking ${s['letter-spacing']}`);
  if (s['text-transform'] && s['text-transform'] !== 'none') parts.push(s['text-transform']);
  if (s['box-shadow'] && s['box-shadow'] !== 'none') parts.push(`shadow ${tokenName(design, s['box-shadow'])}`);
  if (s.outline && s.outline !== 'none') parts.push(`outline ${describeBorder(design, s.outline)}`);
  if (s['outline-offset'] && s.outline && s.outline !== 'none') parts.push(`offset ${s['outline-offset']}`);
  if (s.opacity !== undefined && String(resolveValue(design, s.opacity).raw) !== '1') parts.push(`opacity ${tokenName(design, s.opacity)}`);
  if (s.transition && s.transition !== 'none') parts.push(`transition ${s.transition}`);
  // Composite kinds.
  const sub = (prefix, label) => {
    const keys = Object.keys(s).filter((k) => k.startsWith(prefix));
    if (keys.length === 0) return;
    const inner = {};
    for (const k of keys) inner[k.slice(prefix.length)] = s[k];
    const text = describeStyles(design, inner, mode);
    if (text) parts.push(`${label}: ${text}`);
  };
  sub('link-', 'links');
  sub('active-', 'active link');
  sub('tab-', 'tab');
  sub('selected-', 'selected tab');
  sub('header-', 'header cells');
  sub('cell-', 'body cells');
  if (s.divider && s.divider !== 'none') parts.push(`row divider ${describeBorder(design, s.divider)}`);
  if (s.zebra !== undefined) parts.push(`zebra rows ${describeColor(design, s.zebra, 'background', mode)}`);
  return parts.join(', ');
}

export const recipeTitle = (recipe) => recipe.name ?? recipeName(recipe.kind, recipe.variant);

/** Focus ring as "outline 2px solid focus-ring (blue-500), offset 2px". */
export function describeFocusRing(design) {
  const ring = design.focusRing;
  if (!ring || ring.source === 'browser-default') return null;
  const parts = [];
  if (ring.outline) parts.push(`outline ${describeBorder(design, ring.outline)}`);
  if (ring.outline && ring.offsetPx !== null) parts.push(`offset ${ring.offsetPx}px`);
  if (ring.boxShadow) parts.push(`ring ${ring.boxShadow}`);
  return parts.join(', ');
}
