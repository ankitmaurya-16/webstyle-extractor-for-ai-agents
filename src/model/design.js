// Read helpers over a DesignSystemV2, shared by edit, export and UI code. Pure.

import { FAMILY_ORDER, SEMANTIC_ROLES } from './types.js';

/** Token lists of a design system, keyed by the category used in token references. */
export function categories(design) {
  return {
    color: design.colors ?? [],
    gradient: design.gradients ?? [],
    font: design.typography?.families ?? [],
    text: design.typography?.sizes ?? [],
    textStyle: design.typography?.textStyles ?? [],
    tracking: design.typography?.letterSpacings ?? [],
    space: design.spacing?.tokens ?? [],
    container: design.layout?.containers ?? [],
    grid: design.layout?.gridColumns ?? [],
    gap: design.layout?.gaps ?? [],
    radius: design.radii ?? [],
    border: design.borderWidths ?? [],
    shadow: design.shadows ?? [],
    opacity: design.opacities ?? [],
    z: design.zIndex ?? [],
    duration: design.motion?.durations ?? [],
    easing: design.motion?.easings ?? [],
    breakpoint: design.breakpoints ?? [],
  };
}

/** @returns {{category: string, token: object, list: object[]}|null} */
export function findToken(design, tokenId) {
  for (const [category, list] of Object.entries(categories(design))) {
    const token = list.find((t) => t.id === tokenId);
    if (token) return { category, token, list };
  }
  return null;
}

export const visible = (list) => (list ?? []).filter((t) => !t.excluded);
export const isRef = (value) => typeof value === 'object' && value !== null && 'ref' in value;

/** The token holding a role in a theme, or null when unset or excluded. */
export function roleToken(design, role, mode) {
  const id = design.semantic?.[role]?.[mode];
  if (!id) return null;
  const token = design.colors.find((c) => c.id === id);
  return token && !token.excluded ? token : null;
}

/** Roles a token holds in a theme. */
export function rolesOf(design, tokenId, mode) {
  return SEMANTIC_ROLES.filter((role) => design.semantic?.[role]?.[mode] === tokenId);
}

/** Roles a token holds in any theme. */
export function anyRolesOf(design, tokenId) {
  return SEMANTIC_ROLES.filter((role) => Object.values(design.semantic?.[role] ?? {}).includes(tokenId));
}

export const modesOf = (design) => design.meta?.modes ?? [design.meta?.colorScheme ?? 'light'];
export const primaryModeOf = (design) => design.meta?.primaryMode ?? modesOf(design)[0];

/** [role, token] pairs for a theme, in SemanticRole order. */
export function semanticPairs(design, mode) {
  const pairs = [];
  for (const role of SEMANTIC_ROLES) {
    const token = roleToken(design, role, mode);
    if (token) pairs.push([role, token]);
  }
  return pairs;
}

/** Roles held in any theme, in order, with the token per theme. */
export function semanticRows(design) {
  const modes = modesOf(design);
  return SEMANTIC_ROLES.map((role) => ({ role, byMode: Object.fromEntries(modes.map((m) => [m, roleToken(design, role, m)])) })).filter(
    (row) => Object.values(row.byMode).some(Boolean),
  );
}

/**
 * Resolves a recipe value. A reference to an excluded or missing token falls back to its raw
 * value (AC-F6.5).
 */
export function resolveValue(design, value) {
  if (!isRef(value)) return { token: null, category: null, raw: String(value ?? '') };
  const found = findToken(design, value.id);
  if (!found || found.token.excluded) return { token: null, category: null, raw: value.raw };
  return { token: found.token, category: found.category, raw: value.raw };
}

/** Plain CSS value of a recipe property, whatever it references. */
export function cssValue(design, value) {
  const { token, category, raw } = resolveValue(design, value);
  if (!token) return raw;
  if (category === 'color') return token.hex;
  if (['radius', 'space', 'border', 'container', 'gap'].includes(category)) return `${token.px}px`;
  if (category === 'text') return `${token.sizePx}px`;
  if (category === 'shadow') return token.value;
  if (category === 'gradient') return token.css;
  if (category === 'opacity') return String(token.value);
  return raw;
}

/** Visible colors in export order: opaque white, black, gray, hues; then translucent ones. */
export function orderedColors(design) {
  return visible(design.colors).sort(
    (a, b) =>
      Number(a.alpha < 1) - Number(b.alpha < 1) ||
      FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) ||
      (a.step ?? 1000) - (b.step ?? 1000) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

/** Visible tokens sorted by a numeric key, ascending. */
export const ascending = (list, key) => visible(list).sort((a, b) => a[key] - b[key]);

/** Strips the category prefix from a token name: radius-md becomes md. */
export const stripPrefix = (name, prefix) =>
  name.startsWith(`${prefix}-`) && name.length > prefix.length + 1 ? name.slice(prefix.length + 1) : name;

/** Every recipe value of a component across themes and states, with a callback per value. */
export function forEachRecipeValue(recipe, fn) {
  for (const states of Object.values(recipe.byMode ?? {})) {
    for (const styles of Object.values(states ?? {})) {
      for (const [prop, value] of Object.entries(styles ?? {})) fn(value, prop, styles);
    }
  }
}
