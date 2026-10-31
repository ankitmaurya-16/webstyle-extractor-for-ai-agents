// Component recipes (F5, F12, F20): default styles, states and themes for every kind, with
// values that match a token stored as a token reference. Pure.

import { ids } from '../model/ids.js';
import { familyOf, normalizeColor, oklchOf } from './colors.js';
import { cmp, parseFontStack, round2, toPx } from './units.js';

const stableJson = (styles) =>
  JSON.stringify(
    Object.keys(styles ?? {})
      .sort()
      .map((k) => [k, styles[k]]),
  );

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const MAX_VARIANTS = 3;
const STATES = ['hover', 'focus', 'focus-visible', 'active'];
const COLOR_KEY = /(^|-)color$|^zebra$/;

/** A reference to a token; `raw` is shown and exported when the token is excluded. */
export const ref = (category, token, raw) => ({
  ref: `${category}.${token.name}`,
  id: token.id,
  raw,
});

/** Collapses four box values to the shortest equivalent shorthand. */
export function collapseBox(value) {
  const parts = String(value).trim().split(/\s+/);
  const [t, r = t, b = t, l = r] = parts;
  if (t === r && t === b && t === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

/** Normalizes a border shorthand's color to hex, or 'none'. */
export function borderValue(value) {
  if (!value || value === 'none') return 'none';
  const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(value);
  if (!m) return value;
  const color = normalizeColor(m[3]);
  if (!color) return 'none';
  return `${m[1]} ${m[2]} ${color.hex}`;
}

/**
 * Turns raw recipe styles into token references where a value matches a token (AC-F5.6).
 * @param {Record<string, string>} styles
 * @param {object} t token lists
 * @param {(value: string) => object|null} findColor
 * @param {number} rootPx
 */
export function referenceStyles(styles, t, findColor, rootPx) {
  const out = {};
  for (const [prop, value] of Object.entries(styles)) {
    if (value === undefined || value === null || value === '') continue;
    out[prop] = referenceValue(prop, String(value), t, findColor, rootPx);
  }
  return out;
}

function referenceValue(prop, value, t, findColor, rootPx) {
  if (COLOR_KEY.test(prop)) {
    const color = normalizeColor(value);
    if (!color) return 'transparent';
    const token = findColor(value);
    return token ? ref('color', token, color.hex) : color.hex;
  }
  if (/border$|divider$/.test(prop) || prop === 'outline') return borderValue(value);
  if (prop === 'background-image') {
    if (value === 'none') return 'none';
    const css = value.replace(/\s+/g, ' ').trim();
    const g = t.gradients.find((x) => x.css === css);
    return g ? ref('gradient', g, css) : css;
  }
  if (prop === 'border-radius') {
    const radius = collapseBox(value);
    const px = radius.includes(' ') ? null : toPx(radius, rootPx);
    const token =
      radius === '50%' || (px !== null && px >= 9999)
        ? t.radii.find((r) => r.name === 'radius-full' || r.px >= 9999)
        : t.radii.find((r) => px !== null && r.px === round2(px));
    return token ? ref('radius', token, radius) : radius;
  }
  if (/padding$/.test(prop)) return collapseBox(value);
  if (prop === 'font-family') {
    const stack = parseFontStack(value);
    const family = t.families.find(
      (f) => f.stack.join(',').toLowerCase() === stack.join(',').toLowerCase(),
    );
    return family ? ref('font', family, value) : value;
  }
  if (/font-size$/.test(prop)) {
    const px = toPx(value, rootPx);
    const size = t.sizes.find((s) => px !== null && s.sizePx === round2(px));
    return size ? ref('text', size, value) : value;
  }
  if (prop === 'letter-spacing') return value;
  if (prop === 'box-shadow') {
    const shadow = t.shadows.find((s) => s.value === value);
    return shadow ? ref('shadow', shadow, value) : value;
  }
  if (prop === 'border-width') {
    const px = toPx(value, rootPx);
    const token = t.borderWidths.find((b) => px !== null && b.px === round2(px));
    return token ? ref('border', token, value) : value;
  }
  if (prop === 'gap') {
    const px = toPx(value, rootPx);
    const token = px ? t.spacing.find((s) => s.px === round2(px)) : null;
    return token ? ref('space', token, value) : value;
  }
  if (prop === 'opacity') {
    const n = Number(value);
    const token = t.opacities.find((o) => Math.abs(o.value - n) < 0.001);
    return token ? ref('opacity', token, value) : value;
  }
  return value;
}

const hueGroup = (token, primaryId) => {
  if (!token) return 'neutral';
  if (token.id === primaryId) return 'primary';
  const f = token.family;
  if (f === 'green' || f === 'teal') return 'success';
  if (f === 'yellow' || f === 'orange') return 'warning';
  if (f === 'red' || f === 'pink') return 'danger';
  if (f === 'blue' || f === 'indigo' || f === 'purple') return 'info';
  return 'neutral';
};

/**
 * The color that decides a badge or alert variant: the fill, else the text color. Small fills
 * often fall under the token threshold, so an untokenized fill still groups by its own hue
 * instead of falling through to the text color (AC-F20.3).
 */
function variantColor(styles, findColor) {
  for (const value of [styles['background-color'], styles.color]) {
    const color = normalizeColor(value);
    if (!color) continue;
    return findColor(value) ?? { id: null, family: familyOf({ oklch: oklchOf(color.hex) }) };
  }
  return null;
}

const LABEL = {
  button: 'Button',
  input: 'Input',
  link: 'Link',
  card: 'Card',
  badge: 'Badge',
  navbar: 'Nav bar',
  tabs: 'Tabs',
  alert: 'Alert',
  table: 'Table',
};

export function recipeName(kind, variant) {
  if (kind === 'heading') return `Heading ${variant.slice(1)}`;
  const label = LABEL[kind] ?? kind;
  return variant === 'default' ? label : `${label}, ${variant}`;
}

/**
 * Builds ComponentRecipeV2 objects.
 * @param {Record<string, object>} rawByMode pooled raw per theme (component-level captures only)
 * @param {object} t token lists
 * @param {(value: string) => object|null} findColor
 * @param {Record<string, string|undefined>} primaryByMode primary token id per theme
 */
export function buildRecipes(rawByMode, t, findColor, primaryByMode) {
  const recipes = new Map();
  const modes = Object.keys(rawByMode);
  for (const mode of modes) {
    const raw = rawByMode[mode];
    const rootPx = raw.rootFontSizePx ?? 16;
    const primaryId = primaryByMode[mode];
    const samplesOf = (kind) =>
      (raw.samples ?? [])
        .filter((s) => s.kind === kind)
        .sort(
          // Keys are sorted first: Chrome returns script results with sorted keys and the CLI
          // does not, and the tie-break must not depend on key order (AC-F41.2).
          (a, b) => b.count - a.count || cmp(stableJson(a.styles), stableJson(b.styles)),
        );
    const statesFor = (sample) => {
      const out = {};
      for (const s of raw.stateSamples ?? []) {
        if (s.variant !== sample.key) continue;
        out[s.state] = { styles: s.styles, source: s.source };
      }
      return out;
    };
    const repFor = (sample) =>
      (raw.representatives ?? []).find((r) => r.variant === sample.key)?.selector ?? null;
    const add = (kind, variant, sample) => {
      const id = ids.component(kind, variant);
      const recipe = recipes.get(id) ?? {
        id,
        kind,
        variant,
        name: recipeName(kind, variant),
        byMode: {},
        stateSource: 'none',
        representativeSelector: null,
        screenshotIds: [],
        count: 0,
        excluded: false,
      };
      const stateStyles = {
        default: referenceStyles(trimStyles(kind, sample.styles), t, findColor, rootPx),
      };
      for (const [state, s] of Object.entries(statesFor(sample))) {
        if (!STATES.includes(state)) continue;
        stateStyles[state] = referenceStyles(s.styles, t, findColor, rootPx);
        recipe.stateSource =
          s.source === 'forced'
            ? 'forced'
            : recipe.stateSource === 'forced'
              ? 'forced'
              : 'stylesheet';
      }
      recipe.byMode[mode] = stateStyles;
      recipe.representativeSelector ??= repFor(sample);
      recipe.count = Math.max(recipe.count, sample.count);
      recipe.sampleKey ??= sample.key;
      recipes.set(id, recipe);
    };
    const look = (s) => [s.styles['background-color'], s.styles.color, s.styles.border].join('|');

    // Buttons: primary when the most common style's fill is the primary color, then one more.
    const buttons = samplesOf('button');
    if (buttons[0]) {
      const first = buttons[0];
      const isPrimary = primaryId && findColor(first.styles['background-color'])?.id === primaryId;
      add('button', isPrimary ? 'primary' : 'default', first);
      const second = buttons.find((s) => look(s) !== look(first));
      if (second) add('button', 'secondary', second);
    }
    if (samplesOf('input')[0]) add('input', 'default', samplesOf('input')[0]);
    if (samplesOf('link')[0]) add('link', 'default', samplesOf('link')[0]);
    for (const level of HEADINGS)
      if (samplesOf(level)[0]) add('heading', level, samplesOf(level)[0]);

    // Cards: default, plus interactive when a hover rule exists (F20).
    const cards = samplesOf('card').filter((s) => s.count >= 1);
    if (cards[0]) {
      const hoverable = cards.find((s) => statesFor(s).hover);
      const plain = cards.find((s) => s !== hoverable) ?? (hoverable ? null : cards[0]);
      if (plain) add('card', 'default', plain);
      if (hoverable) add('card', 'interactive', hoverable);
    }
    // Badges and alerts: variants by background hue (AC-F20.3), at most 3 by usage.
    for (const kind of ['badge', 'alert']) {
      const list = samplesOf(kind).filter(
        (s) => kind !== 'badge' || s.count >= 2 || s.hints?.includes('class'),
      );
      const seen = new Set();
      for (const s of list) {
        let variant = hueGroup(variantColor(s.styles, findColor), primaryId);
        if (kind === 'alert' && variant === 'neutral') variant = 'info';
        if (seen.has(variant)) continue;
        seen.add(variant);
        add(kind, variant, s);
        if (seen.size >= MAX_VARIANTS) break;
      }
    }
    for (const kind of ['navbar', 'tabs', 'table'])
      if (samplesOf(kind)[0]) add(kind, 'default', samplesOf(kind)[0]);
  }
  const order = [
    'button',
    'input',
    'link',
    'card',
    'badge',
    'alert',
    'navbar',
    'tabs',
    'table',
    'heading',
  ];
  return [...recipes.values()].sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      variantRank(a.variant) - variantRank(b.variant) ||
      cmp(a.variant, b.variant),
  );
}

const VARIANT_ORDER = [
  'primary',
  'default',
  'secondary',
  'interactive',
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
];
const variantRank = (v) => (VARIANT_ORDER.includes(v) ? VARIANT_ORDER.indexOf(v) : 50);

/** Each kind lists only the properties its recipe uses (AC-F5.5, F20 table). */
const KIND_PROPS = {
  button: [
    'background-color',
    'background-image',
    'color',
    'border',
    'border-radius',
    'padding',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-transform',
    'box-shadow',
    'transition',
  ],
  input: [
    'background-color',
    'color',
    'border',
    'border-radius',
    'padding',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'box-shadow',
    'height',
  ],
  link: ['color', 'font-family', 'font-size', 'font-weight', 'line-height'],
  heading: [
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'text-transform',
  ],
  card: ['background-color', 'border', 'border-radius', 'padding', 'box-shadow', 'gap'],
  badge: [
    'background-color',
    'color',
    'border',
    'border-radius',
    'padding',
    'font-size',
    'font-weight',
    'letter-spacing',
    'text-transform',
  ],
  alert: [
    'background-color',
    'color',
    'border',
    'border-radius',
    'padding',
    'font-family',
    'font-size',
  ],
  navbar: ['height', 'background-color', 'border', 'padding', 'box-shadow', 'gap'],
  tabs: ['gap'],
  table: [],
};

function trimStyles(kind, styles) {
  const k = HEADINGS.includes(kind) ? 'heading' : kind;
  const keep = KIND_PROPS[k] ?? Object.keys(styles);
  const out = {};
  for (const prop of keep) if (styles[prop] !== undefined) out[prop] = styles[prop];
  // Composite kinds carry their extra keys (link-*, active-*, tab-*, selected-*, header-*, ...).
  for (const [prop, value] of Object.entries(styles)) {
    if (/^(link|active|tab|selected|header|cell)-|^divider$|^zebra$/.test(prop)) out[prop] = value;
  }
  return out;
}

/**
 * The focus ring from :focus-visible (preferred) or :focus states of buttons, links and inputs
 * (AC-F12.6), or browser-default when none exists (AC-F12.7).
 */
export function buildFocusRing(raws, findColor) {
  const states = raws
    .flatMap((r) => r.stateSamples ?? [])
    .filter((s) => ['button', 'link', 'input'].includes(s.kind));
  const pick = ['focus-visible', 'focus']
    .map((state) =>
      states.filter((s) => s.state === state && (s.styles.outline || s.styles['box-shadow'])),
    )
    .find((list) => list.length > 0);
  if (!pick)
    return {
      outline: null,
      offsetPx: null,
      boxShadow: null,
      colorTokenId: null,
      colorHex: null,
      source: 'browser-default',
    };
  const s = pick.find((x) => x.source === 'forced') ?? pick[0];
  const outline =
    s.styles.outline && s.styles.outline !== 'none' ? borderValue(s.styles.outline) : null;
  const boxShadow =
    s.styles['box-shadow'] && s.styles['box-shadow'] !== 'none' ? s.styles['box-shadow'] : null;
  let colorValue = null;
  if (outline) colorValue = outline.split(' ').slice(2).join(' ');
  else if (boxShadow)
    colorValue =
      /(rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|#[0-9a-f]{3,8})/i.exec(boxShadow)?.[1] ?? null;
  const color = colorValue ? normalizeColor(colorValue) : null;
  const token = colorValue ? findColor(colorValue) : null;
  return {
    outline,
    offsetPx: s.styles['outline-offset']
      ? parseFloat(s.styles['outline-offset'])
      : outline
        ? 0
        : null,
    boxShadow,
    colorTokenId: token?.id ?? null,
    colorHex: color?.hex ?? null,
    source: s.source === 'forced' ? 'forced' : 'stylesheet',
  };
}
