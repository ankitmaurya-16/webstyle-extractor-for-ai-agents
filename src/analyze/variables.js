// Site variable names (F10): parse custom-property values by type, match them to tokens, pick
// names and read role words. Pure.

import { parse } from 'culori';
import { deriveName, isExcludedVariable, kebab, roleFromName } from '../detect/variable-rules.js';
import { normalizeColor, oklabDistance } from './colors.js';
import { parseGradient } from './gradients.js';
import { cmp, parseFontStack, toPx } from './units.js';

export const COLOR_MATCH = 0.005;

/**
 * Bare HSL triplets (`222.2 47.4% 11.2%`) and bare RGB channel triplets (`37 99 235`) as used by
 * shadcn/ui and Tailwind themes, with an optional `/ alpha` (AC-F10.3).
 * @param {string} value
 */
export function bareColor(value) {
  const v = value.trim();
  const hsl = /^(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+%?))?$/.exec(v);
  if (hsl) return `hsl(${hsl[1]} ${hsl[2]}% ${hsl[3]}%${hsl[4] ? ` / ${hsl[4]}` : ''})`;
  const rgb = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s*\/\s*([\d.]+%?))?$/.exec(v);
  if (rgb && [rgb[1], rgb[2], rgb[3]].every((n) => Number(n) <= 255)) {
    return `rgb(${rgb[1]} ${rgb[2]} ${rgb[3]}${rgb[4] ? ` / ${rgb[4]}` : ''})`;
  }
  return null;
}

/**
 * Parses a custom-property value into a typed value, or null.
 * @param {string} value
 * @param {number} rootPx
 */
export function parseVariableValue(value, rootPx = 16) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const bare = bareColor(v);
  if (bare) {
    const c = normalizeColor(bare);
    return c ? { type: 'color', ...c } : null;
  }
  if (/^-?[\d.]+(ms|s)$/.test(v))
    return { type: 'duration', ms: v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000 };
  if (/^(cubic-bezier\(|steps\(|ease|linear$)/.test(v)) return { type: 'easing', css: v };
  if (/^-?[\d.]+(px|rem|em)$/.test(v)) return { type: 'length', px: toPx(v, rootPx) };
  if (/^-?[\d.]+$/.test(v)) return { type: 'number', value: Number(v) };
  if (/gradient\(/.test(v)) return { type: 'gradient', css: v.replace(/\s+/g, ' ') };
  if (/(\d+px|\d)\s+[\d.-]+px\s+[\d.-]+px/.test(v) && /(rgb|hsl|#|oklch)/.test(v))
    return { type: 'shadow', css: normalizeShadow(v) };
  if (!/\(/.test(v) || /^(rgb|hsl|oklch|oklab|lab|lch|hwb|color)\(/i.test(v) || /^#/.test(v)) {
    try {
      if (parse(v)) {
        const c = normalizeColor(v);
        if (c) return { type: 'color', ...c };
      }
    } catch {
      // Not a color.
    }
  }
  if (/,/.test(v) || /^["']/.test(v) || /\b(sans-serif|serif|monospace|system-ui)\b/.test(v)) {
    const stack = parseFontStack(v);
    if (stack.length) return { type: 'font', first: stack[0].toLowerCase(), stack };
  }
  return null;
}

export const normalizeShadow = (css) =>
  String(css)
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();

/**
 * Builds typed candidates per mode from VariableDefs. Light uses root and light-selector scopes;
 * dark uses the dark scopes. Excluded prefixes are dropped (AC-F10.4).
 * @param {object[]} defs
 * @param {Record<string, number>} usage
 * @param {number} rootPx
 */
export function variableCandidates(defs, usage, rootPx) {
  const byMode = { light: [], dark: [] };
  const seen = new Set();
  for (const d of defs) {
    if (isExcludedVariable(d.name)) continue;
    const mode =
      d.scope === 'dark-media' || d.scope === 'dark-selector'
        ? 'dark'
        : d.scope === 'other'
          ? null
          : 'light';
    if (!mode) continue;
    const key = `${mode}|${d.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = parseVariableValue(d.value, rootPx);
    if (!parsed) continue;
    byMode[mode].push({ name: d.name, scope: d.scope, usage: usage[d.name] ?? 0, parsed });
  }
  return byMode;
}

const LENGTH_HINTS = [
  ['text', /font-?size|(^|-)fs(-|$)|(^|-)text(-|$)|type-|leading|line-height/],
  ['space', /space|spacing|(^|-)gap(-|$)|pad|margin|gutter|inset|(^|-)p[xy]?(-|$)/],
  ['radius', /radius|radii|rounded|corner/],
  ['border', /border|stroke|outline|hairline/],
  ['container', /container|max-?width|content-width|wrapper|page-width|(^|-)measure/],
  ['breakpoint', /breakpoint|screen|(^|-)bp(-|$)|media/],
];

/** The length category a variable's name points to, or null when the name gives no hint. */
export function lengthCategory(name) {
  const n = name.toLowerCase();
  const hit = LENGTH_HINTS.find(([, re]) => re.test(n));
  return hit ? hit[0] : null;
}

const LENGTH_CATEGORIES = new Set([
  'space',
  'radius',
  'border',
  'container',
  'gap',
  'breakpoint',
  'text',
]);

/**
 * Gradients compared by parsed stops: a variable holds the authored CSS (hex stops) while the
 * token holds the computed CSS (rgb() stops), so the strings rarely agree.
 */
export function sameGradient(a, b) {
  const pa = parseGradient(a);
  const pb = parseGradient(b);
  if (!pa || !pb || pa.stops.length === 0) return false;
  const dir = (g) => (g.direction ?? '').replace(/\s+/g, ' ').toLowerCase();
  return (
    pa.type === pb.type &&
    pa.repeating === pb.repeating &&
    dir(pa) === dir(pb) &&
    pa.stops.length === pb.stops.length &&
    pa.stops.every((s, i) => s.hex === pb.stops[i].hex && s.position === pb.stops[i].position)
  );
}

/** Whether a candidate's value equals a token's value, by type (F10 matching rules). */
export function valueMatches(category, token, parsed, name = '') {
  if (LENGTH_CATEGORIES.has(category) && parsed.type === 'length') {
    // A length variable only names tokens of the category its name points to; a name with no
    // hint can name spacing-like tokens but not font sizes.
    const hint = lengthCategory(name);
    const want = category === 'gap' ? 'space' : category;
    if (hint ? hint !== want : category === 'text') return false;
  }
  switch (category) {
    case 'color':
      if (parsed.type !== 'color') return false;
      if (Math.abs((parsed.alpha ?? 1) - (token.alpha ?? 1)) > 0.03) return false;
      return [token.hex, ...(token.mergedFrom ?? [])].some(
        (hex) => oklabDistance(parse(hex.slice(0, 7)), parse(parsed.hex.slice(0, 7))) < COLOR_MATCH,
      );
    case 'space':
    case 'radius':
    case 'border':
    case 'container':
    case 'gap':
    case 'breakpoint':
      return parsed.type === 'length' && Math.abs(parsed.px - token.px) < 0.01;
    case 'text':
      return parsed.type === 'length' && Math.abs(parsed.px - token.sizePx) < 0.01;
    case 'duration':
      return parsed.type === 'duration' && Math.abs(parsed.ms - token.ms) < 0.5;
    case 'easing':
      return (
        parsed.type === 'easing' && parsed.css.replace(/\s+/g, '') === token.css.replace(/\s+/g, '')
      );
    case 'shadow':
      return parsed.type === 'shadow' && parsed.css === normalizeShadow(token.value);
    case 'gradient':
      return parsed.type === 'gradient' && sameGradient(parsed.css, token.css);
    case 'font':
      return parsed.type === 'font' && parsed.first === (token.stack[0] ?? '').toLowerCase();
    case 'z':
    case 'opacity':
      return parsed.type === 'number' && Math.abs(parsed.value - token.value) < 1e-6;
    default:
      return false;
  }
}

/**
 * Picks the site variable for a token: the most-referenced match; ties go to role-word names
 * for semantic tokens, then the shortest name (AC-F10.5).
 */
export function pickVariable(category, token, candidates, isSemantic) {
  const matches = candidates.filter((c) => valueMatches(category, token, c.parsed, c.name));
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) =>
      b.usage - a.usage ||
      (isSemantic
        ? Number(Boolean(roleFromName(b.name))) - Number(Boolean(roleFromName(a.name)))
        : 0) ||
      a.name.length - b.name.length ||
      cmp(a.name, b.name),
  );
  return matches[0];
}

/**
 * Applies site variable names to every token list (AC-F10.5 to AC-F10.7). Mutates tokens: sets
 * siteVariable, siteName and generatedName, and puts the preferred one in `name` with the other
 * in `aliases`.
 * @param {Record<string, object[]>} lists category -> tokens
 * @param {object[]} candidates candidates of the theme the tokens were named in
 * @param {{useSiteVariableNames: boolean, semanticIds: Set<string>}} options
 */
export function applySiteNames(lists, candidates, options) {
  const order = new Map(candidates.map((c, i) => [c, i]));
  for (const [category, tokens] of Object.entries(lists)) {
    const matched = [];
    const picks = [];
    for (const token of tokens) {
      token.generatedName = token.name;
      token.aliases = [];
      token.siteVariable = null;
      token.siteName = null;
      const match = pickVariable(category, token, candidates, options.semanticIds.has(token.id));
      if (match) picks.push({ token, match });
    }
    // A themed variable such as --bg matches the light token through its root value and the dark
    // token through its dark-scope value. It names only one of them, the one matched in the
    // theme listed first (the primary theme), or both would export the same variable twice.
    picks.sort((a, b) => order.get(a.match) - order.get(b.match));
    const taken = new Set();
    for (const { token, match } of picks) {
      if (taken.has(match.name)) continue;
      taken.add(match.name);
      token.siteVariable = match.name;
      matched.push(token);
    }
    const derivedCount = new Map();
    for (const t of matched) {
      const d = deriveName(t.siteVariable);
      derivedCount.set(d, (derivedCount.get(d) ?? 0) + 1);
    }
    const generated = new Set(tokens.map((t) => t.generatedName));
    for (const t of matched) {
      const derived = deriveName(t.siteVariable);
      const collides =
        derivedCount.get(derived) > 1 || (generated.has(derived) && derived !== t.generatedName);
      // Collisions within a category keep the full variable name (AC-F10.6).
      t.siteName = collides ? kebab(t.siteVariable) : derived;
      setPreferredName(t, options.useSiteVariableNames);
    }
  }
}

/** Puts the site or generated name first, the other in aliases (AC-F10.7). */
export function setPreferredName(token, useSite) {
  if (!token.siteName) {
    token.name = token.generatedName ?? token.name;
    token.aliases = [];
    return;
  }
  token.name = useSite ? token.siteName : token.generatedName;
  token.aliases = [useSite ? token.generatedName : token.siteName];
}

/**
 * Roles signalled by variable names (AC-F10.8): { role: { token, name, usage } }. Works on color
 * clusters or tokens, anything with hex, alpha and mergedFrom.
 */
const SOLID_ROLES = new Set(['primary', 'accent', 'success', 'warning', 'danger']);

export function rolesFromVariables(colorTokens, candidates) {
  const roles = {};
  for (const c of candidates) {
    if (c.parsed.type !== 'color') continue;
    const role = roleFromName(c.name);
    if (!role) continue;
    const token = colorTokens.find((t) => valueMatches('color', t, c.parsed));
    if (!token) continue;
    // Brand and status roles are solid colors; a translucent value under such a name is a tint
    // or an overlay, not the color itself.
    if (SOLID_ROLES.has(role) && token.alpha < 1) continue;
    const prev = roles[role];
    if (
      !prev ||
      c.usage > prev.usage ||
      (c.usage === prev.usage && c.name.length < prev.name.length)
    ) {
      roles[role] = { token, name: c.name, usage: c.usage };
    }
  }
  return roles;
}
