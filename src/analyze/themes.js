// Light and dark themes (F13): mechanism detection and the stylesheet-override capture (Path A).
// Pure: it builds a second capture from data the collector already read, never from the page.

import { normalizeColor } from './colors.js';
import { parseVariableValue } from './variables.js';

/**
 * Theme mechanism from ThemeSignals. A class or attribute takes priority over the media query,
 * since it decides on the site (v2 spec 11.6).
 * @returns {{mechanism: 'media'|'class'|'attribute'|'none', selector: string|null}}
 */
export function themeMechanism(signals) {
  const dark = signals?.darkSelectors ?? [];
  const cls = dark.find((s) => s.startsWith('.'));
  if (cls) return { mechanism: 'class', selector: cls };
  const attr = dark.find((s) => s.startsWith('['));
  if (attr) return { mechanism: 'attribute', selector: attr };
  if (signals?.darkMedia) return { mechanism: 'media', selector: '@media (prefers-color-scheme: dark)' };
  return { mechanism: 'none', selector: null };
}

const otherMode = (mode) => (mode === 'dark' ? 'light' : 'dark');
const isDarkScope = (scope) => scope === 'dark-media' || scope === 'dark-selector';

/**
 * Path A (AC-F13.2): builds the other theme's capture from variable overrides and root-level
 * rules. Colors the page uses whose value equals a variable with an override in the other theme
 * take the override value, with the same weights. Component-level colors without a variable
 * stay unknown, so the result only holds what the stylesheets say.
 * @param {object} raw RawSnapshotV2 of the active theme
 * @returns {object|null} a RawSnapshotV2 for the other theme, or null
 */
export function buildOverrideRaw(raw) {
  const active = raw.themeSignals?.activeMode ?? raw.colorScheme ?? 'light';
  const target = otherMode(active);
  const defs = raw.variableDefs ?? [];
  const inTarget = (scope) => (target === 'dark' ? isDarkScope(scope) : scope === 'root' || scope === 'light-selector');
  const inActive = (scope) => (active === 'dark' ? isDarkScope(scope) : scope === 'root' || scope === 'light-selector');

  const activeValues = new Map();
  const targetValues = new Map();
  for (const d of defs) {
    const parsed = parseVariableValue(d.value, raw.rootFontSizePx);
    if (!parsed || parsed.type !== 'color') continue;
    if (inActive(d.scope) && !activeValues.has(d.name)) activeValues.set(d.name, parsed.hex);
    if (inTarget(d.scope) && !targetValues.has(d.name)) targetValues.set(d.name, parsed.hex);
  }
  // Active-theme hex -> target-theme hex, through variables defined in both.
  const swap = new Map();
  for (const [name, hex] of activeValues) {
    const other = targetValues.get(name);
    if (other && other !== hex && !swap.has(hex)) swap.set(hex, other);
  }

  const colors = [];
  for (const stat of raw.colors ?? []) {
    const c = normalizeColor(stat.value);
    if (!c) continue;
    const mapped = swap.get(c.hex);
    if (!mapped) continue;
    colors.push({ ...stat, value: mapped, effectiveHex: mapped.length === 9 ? stat.effectiveHex : mapped, backdropHex: stat.backdropHex });
  }

  // Root-level rules in the target theme scope (html, body, :root colors).
  const totalText = (raw.colors ?? []).filter((s) => s.contexts.includes('text')).reduce((n, s) => n + s.weight, 0);
  const totalFill = (raw.colors ?? []).filter((s) => s.contexts.includes('background')).reduce((n, s) => n + s.weight, 0);
  for (const rule of raw.themeRootRules ?? []) {
    if (!inTarget(rule.scope)) continue;
    const value = resolveSimpleVar(rule.value, targetValues, activeValues);
    const c = value && normalizeColor(value.split(/\s+(?![^(]*\))/)[0]);
    if (!c) continue;
    const isFill = rule.property !== 'color';
    colors.push({
      value: c.hex,
      count: 1,
      weight: isFill ? totalFill * 0.5 : totalText * 0.5,
      contexts: [isFill ? 'background' : 'text'],
      effectiveHex: c.hex.slice(0, 7),
      backdropHex: c.hex.slice(0, 7),
      overImageShare: 0,
      maxWeight: 0,
    });
  }
  if (colors.length === 0) return null;
  return {
    ...emptyRaw(raw),
    colorScheme: target,
    themeSignals: { ...raw.themeSignals, activeMode: target },
    colors,
    variableDefs: defs,
    variableUsage: raw.variableUsage,
  };
}

function resolveSimpleVar(value, primary, fallback) {
  const m = /^var\(\s*(--[\w-]+)/.exec(value.trim());
  if (!m) return value;
  return primary.get(m[1]) ?? fallback.get(m[1]) ?? null;
}

/** A RawSnapshotV2 with page metadata kept and every list empty. */
export function emptyRaw(raw) {
  return {
    url: raw.url,
    title: raw.title,
    capturedAt: raw.capturedAt,
    viewport: raw.viewport,
    rootFontSizePx: raw.rootFontSizePx,
    colorScheme: raw.colorScheme,
    elementsSampled: raw.elementsSampled,
    truncated: raw.truncated,
    colors: [],
    fontFamilies: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    letterSpacings: [],
    textTransforms: [],
    textStyles: [],
    spacing: [],
    radii: [],
    shadows: [],
    borderWidths: [],
    borderStyles: [],
    opacities: [],
    zIndices: [],
    durations: [],
    easings: [],
    transitionProperties: [],
    reducedMotion: false,
    gradients: [],
    gradientText: 0,
    containers: [],
    gridColumns: [],
    gaps: [],
    fontFaces: [],
    cssVariables: {},
    variableDefs: [],
    variableUsage: {},
    themeSignals: raw.themeSignals ?? { darkMedia: false, darkSelectors: [], lightSelectors: [], activeMode: raw.colorScheme ?? 'light', colorSchemeProperty: 'normal' },
    themeRootRules: [],
    frameworkSignals: [],
    iconSignals: [],
    iconSizes: [],
    iconStrokes: [],
    contrastSamples: [],
    stateSamples: [],
    representatives: [],
    breakpoints: [],
    stylesheets: raw.stylesheets ?? { readable: 0, unreadable: 0 },
    samples: [],
    canvasHex: raw.canvasHex ?? null,
    coverage: raw.coverage ?? { frames: { read: 0, skipped: 0 }, shadowRoots: 0, autoScrolled: false },
  };
}
