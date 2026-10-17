// Read helpers over a DesignSystem, shared by the edit, export and UI code. Pure.

/** The token lists of a design system, by category name used in token references. */
export function categories(design) {
  return {
    color: design.colors,
    font: design.typography.families,
    text: design.typography.sizes,
    space: design.spacing.tokens,
    radius: design.radii,
    shadow: design.shadows,
    breakpoint: design.breakpoints,
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

export const isRef = (value) => typeof value === 'object' && value !== null && 'ref' in value;

/**
 * Resolves a recipe value. A reference to an excluded or missing token falls back to its raw
 * value (AC-F6.5).
 * @returns {{token: object|null, category: string|null, raw: string}}
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
  if (category === 'radius' || category === 'space') return `${token.px}px`;
  if (category === 'text') return `${token.sizePx}px`;
  if (category === 'shadow') return token.value;
  return raw;
}

export const visible = (list) => list.filter((t) => !t.excluded);

const FAMILY_ORDER = [
  'white',
  'black',
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
];

/** Visible color tokens in export order: white and black, then gray, then hue order, steps up. */
export function orderedColors(design) {
  return visible(design.colors).sort(
    (a, b) =>
      FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) ||
      (a.step ?? 1000) - (b.step ?? 1000) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

/** [role, token] pairs for roles held by visible tokens, in SemanticRole order. */
export function semanticPairs(design, roles) {
  const pairs = [];
  for (const role of roles) {
    const token = design.colors.find((c) => !c.excluded && c.roles.includes(role));
    if (token) pairs.push([role, token]);
  }
  return pairs;
}

/** Visible tokens sorted by a numeric key, ascending. */
export const ascending = (list, key) => visible(list).sort((a, b) => a[key] - b[key]);

/** Strips the category prefix from a token name: radius-md becomes md. */
export const stripPrefix = (name, prefix) =>
  name.startsWith(`${prefix}-`) && name.length > prefix.length + 1
    ? name.slice(prefix.length + 1)
    : name;
