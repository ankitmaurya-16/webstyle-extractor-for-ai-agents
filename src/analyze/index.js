// analyze(): captures to DesignSystemV2. Pure: no chrome.*, no DOM, no I/O.
// Stage order follows docs/v2-spec.md section 7.3.

import {
  MIN_SHARE,
  assignRoles,
  clusterColors,
  colorLookup,
  computeShares,
  nameColors,
  normalizeColor,
  normalizeColors,
} from './colors.js';
import { analyzeTypography } from './typography.js';
import {
  analyzeBorderWidths,
  analyzeBreakpoints,
  analyzeContainers,
  analyzeGaps,
  analyzeGridColumns,
  analyzeOpacities,
  analyzeRadii,
  analyzeShadows,
  analyzeSpacing,
  analyzeZIndex,
} from './layout.js';
import { analyzeMotion } from './motion.js';
import { analyzeGradients } from './gradients.js';
import { buildFocusRing, buildRecipes } from './recipes.js';
import { themeMechanism } from './themes.js';
import { poolRaws, upgradeRaw } from './pool.js';
import { applySiteNames, rolesFromVariables, variableCandidates } from './variables.js';
import { buildResponsive } from './responsive.js';
import { recipeConfidence, roleConfidence, tokenConfidence } from './confidence.js';
import { detectFrameworks } from '../detect/framework.js';
import { detectIcons } from '../detect/icons.js';
import { contrastResults, nonTextChecks } from '../contrast/index.js';
import { buildAudit } from '../audit/index.js';
import { SEMANTIC_ROLES, THEME_MODES } from '../model/types.js';

export const ANALYZE_STAGES = [
  'normalize',
  'translucency',
  'variables',
  'cluster',
  'roles',
  'typography',
  'layout',
  'motion',
  'components',
  'detect',
  'contrast',
  'confidence',
  'audit',
  'naming',
];

export function hostnameOf(url) {
  try {
    return new URL(url).hostname || 'local-file';
  } catch {
    return 'unknown';
  }
}

/**
 * @typedef {object} Capture
 * @property {string} id
 * @property {string} pageUrl
 * @property {'light'|'dark'} mode
 * @property {number} viewportWidth
 * @property {'computed'|'stylesheet-override'|'emulated'} method
 * @property {'base'|'theme'|'width'} [kind] width captures feed only the responsive table
 * @property {number} capturedAt
 * @property {object} raw RawSnapshotV2
 */

/**
 * @param {Capture[]} captures
 * @param {{useSiteVariableNames?: boolean, advanced?: boolean, deepScan?: boolean}} [options]
 * @param {(stage: string) => void} [onStage]
 */
export function analyze(captures, options = {}, onStage = () => {}) {
  if (!Array.isArray(captures) || captures.length === 0) throw new Error('No captures to analyze');
  const useSite = options.useSiteVariableNames ?? true;
  const caps = captures.map((c) => ({ ...c, raw: upgradeRaw(c.raw) }));
  const widthCaps = caps.filter((c) => c.kind === 'width');
  const themeCaps = caps.filter((c) => c.kind !== 'width');
  const primaryCap = themeCaps.find((c) => c.method === 'computed') ?? themeCaps[0];
  const primaryMode = primaryCap.mode;

  // Per theme: emulated or computed captures win over stylesheet overrides.
  const rawsByMode = {};
  const overrideOnly = {};
  for (const mode of THEME_MODES) {
    const real = themeCaps.filter((c) => c.mode === mode && c.method !== 'stylesheet-override');
    const override = themeCaps.filter((c) => c.mode === mode && c.method === 'stylesheet-override');
    const chosen = real.length ? real : override;
    if (chosen.length === 0) continue;
    rawsByMode[mode] = poolRaws(chosen.map((c) => c.raw));
    overrideOnly[mode] = real.length === 0;
  }
  const modes = THEME_MODES.filter((m) => rawsByMode[m]);
  const primary = rawsByMode[primaryMode];
  const componentModes = Object.fromEntries(
    modes.filter((m) => !overrideOnly[m]).map((m) => [m, rawsByMode[m]]),
  );
  const pages = [
    ...new Set(themeCaps.filter((c) => c.method !== 'stylesheet-override').map((c) => c.pageUrl)),
  ];

  // ---- normalize ----
  onStage('normalize');
  const focusRingSeed = buildFocusRing(Object.values(componentModes), () => null);
  const colorInputs = modes.map((mode) => {
    const raw = rawsByMode[mode];
    const stats = [...raw.colors];
    // The focus ring color is a real page value even when no element shows it by default.
    if (focusRingSeed.colorHex && !overrideOnly[mode]) {
      stats.push({
        value: focusRingSeed.colorHex,
        count: 1,
        weight: 0,
        contexts: ['outline'],
        effectiveHex: focusRingSeed.colorHex.slice(0, 7),
      });
    }
    return { mode, stats, viewportArea: (raw.viewport?.width ?? 0) * (raw.viewport?.height ?? 0) };
  });
  const { colors: normalized } = normalizeColors(colorInputs);
  computeShares(normalized);

  // ---- translucency and variables ----
  onStage('translucency');
  onStage('variables');
  const allDefs = modes.flatMap((m) => rawsByMode[m].variableDefs ?? []);
  const usage = Object.assign({}, ...modes.map((m) => rawsByMode[m].variableUsage ?? {}));
  const candidates = variableCandidates(dedupeDefs(allDefs), usage, primary.rootFontSizePx);
  const namingCandidates = [
    ...candidates[primaryMode],
    ...candidates[primaryMode === 'light' ? 'dark' : 'light'],
  ];

  // ---- cluster ----
  onStage('cluster');
  const clusters = clusterColors(normalized);

  // ---- roles ----
  onStage('roles');
  const rolesByMode = {};
  const roleSource = {};
  for (const mode of modes) {
    const usageRoles = assignRoles(clusters, mode);
    const named = rolesFromVariables(
      clusters.filter((c) => c.modes[mode]),
      candidates[mode],
    );
    rolesByMode[mode] = { ...usageRoles };
    roleSource[mode] = {};
    for (const [role, hit] of Object.entries(named)) {
      rolesByMode[mode][role] = hit.token;
      roleSource[mode][role] = hit.name;
    }
    if (focusRingSeed.colorHex && !roleSource[mode]['focus-ring'] && !overrideOnly[mode]) {
      const ring = clusters.find(
        (c) => c.hex === focusRingSeed.colorHex || c.mergedFrom.includes(focusRingSeed.colorHex),
      );
      if (ring) rolesByMode[mode]['focus-ring'] = ring;
    }
  }
  const roleHolders = new Set(modes.flatMap((m) => Object.values(rolesByMode[m])));
  const kept = clusters.filter((c) => c.share >= MIN_SHARE || roleHolders.has(c));
  const colorsBeforeMerge = normalized.length;

  // ---- naming of colors (ids are value-based) ----
  const named = nameColors(kept);
  for (const c of named) {
    if (c.translucent)
      c.baseTokenId = c.baseCluster && kept.includes(c.baseCluster) ? c.baseCluster.id : null;
  }
  const colorTokens = named.map((c) => toColorToken(c));
  const findColor = colorLookup(colorTokens);
  const semantic = {};
  for (const role of SEMANTIC_ROLES) {
    for (const mode of modes) {
      const holder = rolesByMode[mode][role];
      if (!holder) continue;
      (semantic[role] ??= {})[mode] = holder.id;
    }
  }

  // ---- typography ----
  onStage('typography');
  const typo = analyzeTypography(primary, primary.fontFaces ?? []);

  // ---- layout ----
  onStage('layout');
  const spacing = analyzeSpacing(primary);
  const radii = analyzeRadii(primary);
  const borders = analyzeBorderWidths(primary);
  const shadows = analyzeShadows(
    Object.fromEntries(Object.entries(componentModes).map(([m, r]) => [m, r.shadows])),
  );
  const breakpoints = analyzeBreakpoints(primary);
  const containers = analyzeContainers(primary);
  const gridColumns = analyzeGridColumns(primary);
  const gaps = analyzeGaps(primary, spacing.tokens);
  const opacities = analyzeOpacities(primary);
  const zIndex = analyzeZIndex(primary);

  // ---- motion ----
  onStage('motion');
  const motion = analyzeMotion(primary);
  const gradients = analyzeGradients(primary.gradients ?? [], findColor);

  // ---- site names (F10) ----
  const lists = {
    color: colorTokens,
    gradient: gradients,
    font: typo.families,
    text: typo.sizes,
    space: spacing.tokens,
    container: containers,
    gap: gaps.filter((g) => !g.spaceId),
    radius: radii.tokens,
    border: borders.tokens,
    shadow: shadows.tokens,
    opacity: opacities,
    z: zIndex,
    duration: motion.durations,
    easing: motion.easings,
    breakpoint: breakpoints,
  };
  const semanticIds = new Set(Object.values(semantic).flatMap((ref) => Object.values(ref)));
  applySiteNames(lists, namingCandidates, { useSiteVariableNames: useSite, semanticIds });
  for (const list of [
    typo.letterSpacings,
    typo.textStyles,
    gridColumns,
    gaps.filter((g) => g.spaceId),
  ]) {
    for (const t of list) {
      t.generatedName = t.name;
      t.aliases = [];
      t.siteVariable = null;
      t.siteName = null;
    }
  }
  // Translucent names follow their base token's preferred name.
  for (const t of colorTokens) {
    if (t.alpha < 1 && t.baseTokenId && !t.siteVariable) {
      const base = colorTokens.find((b) => b.id === t.baseTokenId);
      if (base && base.name !== base.generatedName)
        t.name = `${base.name}/${t.name.split('/').pop()}`;
    }
  }

  // ---- components ----
  onStage('components');
  const primaryByMode = Object.fromEntries(modes.map((m) => [m, semantic.primary?.[m]]));
  const tokenLists = {
    gradients,
    radii: radii.tokens,
    families: typo.families,
    sizes: typo.sizes,
    shadows: shadows.tokens,
    borderWidths: borders.tokens,
    spacing: spacing.tokens,
    opacities,
  };
  const components = buildRecipes(componentModes, tokenLists, findColor, primaryByMode);
  const focusRing = buildFocusRing(Object.values(componentModes), findColor);

  // ---- detect ----
  onStage('detect');
  const framework = detectFrameworks(primary.frameworkSignals ?? []);
  const icons = detectIcons(primary.iconSignals ?? []);
  const topValue = (stats) => [...(stats ?? [])].sort((a, b) => b.count - a.count)[0]?.value;
  const iconSize = topValue(primary.iconSizes);
  const iconStroke = topValue(primary.iconStrokes);

  // ---- contrast ----
  onStage('contrast');
  const contrast = contrastResults(
    Object.fromEntries(Object.entries(componentModes).map(([m, r]) => [m, r.contrastSamples])),
    colorTokens,
  );
  const bg = colorTokens.find((t) => t.id === semantic.background?.[primaryMode]);
  const input = components.find((r) => r.kind === 'input');
  const inputStyles = input?.byMode[primaryMode]?.default ?? {};
  const inputBorder =
    typeof inputStyles.border === 'string' ? inputStyles.border.split(' ')[2] : null;
  const inputFill = inputStyles['background-color'];
  const nonText = nonTextChecks({
    focusRingHex: focusRing.colorHex,
    backgroundHex: bg?.effectiveHex ?? bg?.hex,
    inputBorderHex: inputBorder && normalizeColor(inputBorder)?.hex,
    inputBackgroundHex:
      typeof inputFill === 'object'
        ? inputFill.raw
        : (normalizeColor(inputFill ?? '')?.hex ?? bg?.hex),
  });

  // ---- confidence ----
  onStage('confidence');
  const truncated = themeCaps.some((c) => c.raw.truncated);
  const unreadable = (primary.stylesheets?.unreadable ?? 0) > 0;
  for (const t of colorTokens) {
    const cluster = named.find((c) => c.id === t.id);
    t.confidence = tokenConfidence({
      count: t.count,
      consistency: cluster && cluster.share > 0 ? cluster.ownShare / cluster.share : 1,
      siteVariable: t.siteVariable,
      exactSource: options.advanced,
      overImage: t.overImageShare > 0.5,
      truncated,
      overrideOnly: t.modes.length > 0 && t.modes.every((m) => overrideOnly[m]),
    });
  }
  for (const list of [
    gradients,
    typo.families,
    typo.sizes,
    typo.letterSpacings,
    typo.textStyles,
    spacing.tokens,
    containers,
    gridColumns,
    gaps,
    radii.tokens,
    borders.tokens,
    shadows.tokens,
    opacities,
    zIndex,
    motion.durations,
    motion.easings,
    breakpoints,
  ]) {
    for (const t of list)
      t.confidence = tokenConfidence({
        count: t.count ?? 1,
        siteVariable: t.siteVariable,
        truncated,
        unreadable: list === breakpoints && unreadable,
      });
  }
  const roleConfidenceMap = {};
  for (const mode of modes) {
    for (const [role, holder] of Object.entries(rolesByMode[mode])) {
      const otherHolders = new Set(
        Object.entries(rolesByMode[mode])
          .filter(([r]) => r !== role)
          .map(([, c]) => c),
      );
      const w = (c) => roleWeight(c, mode, role);
      // A color holding another role in this theme (the text color for text-muted, the
      // background for primary) is not a rival for this one.
      const runnerUp = clusters
        .filter((c) => c !== holder && !otherHolders.has(c) && c.modes[mode] && w(c) > 0)
        .sort((a, b) => w(b) - w(a))[0];
      (roleConfidenceMap[role] ??= {})[mode] = roleConfidence({
        count: holder.modes[mode]?.count ?? 0,
        winnerWeight: w(holder),
        runnerUpWeight: runnerUp ? w(runnerUp) : 0,
        runnerUpName: runnerUp ? named.find((n) => n === runnerUp)?.name : null,
        siteVariable: roleSource[mode][role],
        overrideOnly: overrideOnly[mode],
        truncated,
      });
    }
  }
  for (const r of components)
    r.confidence = recipeConfidence({ count: r.count, stateSource: r.stateSource });

  // ---- audit ----
  onStage('audit');
  const lowConfidence = [
    ...Object.values(lists).flat(),
    ...typo.letterSpacings,
    ...typo.textStyles,
    ...gridColumns,
  ]
    .filter((t) => t.confidence?.level === 'low')
    .map((t) => t.id);
  const audit = buildAudit({
    colorsBeforeMerge,
    colors: colorTokens,
    spacing,
    distinct: {
      fontSizes: new Set((primary.textStyles ?? []).map((s) => Math.round(s.sizePx * 100) / 100))
        .size,
      radii: radii.distinct,
      shadows: shadows.distinct,
      zIndices: new Set((primary.zIndices ?? []).map((z) => z.value)).size,
      durations: new Set((primary.durations ?? []).map((d) => d.value)).size,
    },
    contrast,
    focusRing,
    variableConflicts: primary.variableConflicts,
    lowConfidence,
  });

  // ---- naming (final) and meta ----
  onStage('naming');
  const { mechanism, selector } = themeMechanism(primary.themeSignals);
  const sheets = primary.stylesheets ?? { readable: 0, unreadable: 0 };
  const partial = [];
  if (sheets.unreadable > 0 || sheets.readable === 0) partial.push('breakpoints', 'cssVariables');
  if (sheets.unreadable > 0 && !components.some((r) => r.stateSource === 'forced'))
    partial.push('states');
  if (modes.some((m) => overrideOnly[m])) partial.push('dark');
  if ((primary.coverage?.frames?.skipped ?? 0) > 0) partial.push('frames');
  // Advanced stages that failed (CAPTURE_PARTIAL), reported by the capture.
  for (const stage of options.partial ?? []) if (typeof stage === 'string') partial.push(stage);

  return {
    schemaVersion: 2,
    meta: {
      sourceUrl: primaryCap.pageUrl ?? primary.url,
      hostname: hostnameOf(primaryCap.pageUrl ?? primary.url),
      capturedAt: Math.min(...themeCaps.map((c) => c.capturedAt ?? c.raw.capturedAt)),
      pages,
      modes,
      primaryMode,
      viewports: [
        ...new Set([primaryCap.viewportWidth, ...widthCaps.map((c) => c.viewportWidth)]),
      ].filter(Boolean),
      themeMechanism: modes.length > 1 || mechanism !== 'none' ? mechanism : 'none',
      themeSelector: selector,
      framework,
      icons,
      webFonts: primary.fontFaces ?? [],
      iconSizePx: iconSize ? parseFloat(iconSize) : null,
      iconStroke: iconStroke ? Number(iconStroke) : null,
      partial: [...new Set(partial)],
      truncated,
      capture: {
        advanced: Boolean(options.advanced),
        deepScan: Boolean(options.deepScan),
        autoScroll: themeCaps.some((c) => c.raw.coverage?.autoScrolled),
      },
      stylesheets: sheets,
      coverage: primary.coverage,
      borderStyle: borders.style,
      gradientText: primary.gradientText ?? 0,
      colorScheme: primaryMode,
    },
    colors: colorTokens,
    semantic,
    roleConfidence: roleConfidenceMap,
    gradients,
    typography: {
      families: typo.families,
      sizes: typo.sizes,
      letterSpacings: typo.letterSpacings,
      textStyles: typo.textStyles,
    },
    spacing: { baseUnitPx: spacing.baseUnitPx, tokens: spacing.tokens },
    layout: { containers, gridColumns, gaps },
    radii: radii.tokens,
    borderWidths: borders.tokens,
    shadows: shadows.tokens,
    opacities,
    zIndex,
    motion: {
      durations: motion.durations,
      easings: motion.easings,
      properties: motion.properties,
      reducedMotion: motion.reducedMotion,
    },
    breakpoints,
    responsive: buildResponsive(
      widthCaps.map((c) => ({ width: c.viewportWidth, raw: c.raw })),
      typo.sizes,
    ),
    focusRing,
    components,
    contrast,
    nonTextContrast: nonText,
    audit,
  };
}

function roleWeight(c, mode, role) {
  const m = c.modes[mode];
  if (!m) return 0;
  if (role === 'background' || role === 'surface' || role === 'overlay')
    return m.weights.background;
  if (role === 'text' || role === 'text-muted') return m.weights.text;
  if (role === 'border') return m.weights.border;
  if (role === 'focus-ring') return m.weights.outline;
  return m.interactiveCount;
}

function dedupeDefs(defs) {
  const seen = new Set();
  return defs.filter((d) => {
    const key = `${d.scope}|${d.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toColorToken(c) {
  const count = Object.values(c.modes).reduce((n, m) => n + m.count, 0);
  return {
    id: c.id,
    name: c.name,
    aliases: [],
    siteVariable: null,
    hex: c.hex,
    alpha: c.alpha,
    baseTokenId: c.baseTokenId ?? null,
    effectiveHex: c.effectiveHex,
    backdropHex: c.backdropHex,
    oklch: c.oklch,
    family: c.family,
    step: c.step ?? null,
    modes: Object.keys(c.modes).sort(),
    contexts: [...c.contexts].sort(),
    mergedFrom: c.mergedFrom,
    overImageShare: Math.round(c.overImageShare * 100) / 100,
    usageShare: Math.round(c.share * 10000) / 10000,
    count,
    excluded: false,
  };
}
