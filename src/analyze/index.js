// analyze(): RawSnapshot to DesignSystem. Pure: no chrome.*, no DOM, no I/O.

import {
  assignRoles,
  clusterColors,
  colorLookup,
  computeShares,
  nameColors,
  normalizeColors,
} from './colors.js';
import { analyzeTypography } from './typography.js';
import { analyzeBreakpoints, analyzeRadii, analyzeShadows, analyzeSpacing } from './layout.js';
import { buildRecipes } from './recipes.js';

/**
 * @param {import('../model/types.js').RawSnapshot} raw
 * @param {(stage: 'normalize'|'cluster'|'roles'|'naming') => void} [onStage]
 * @returns {import('../model/types.js').DesignSystem}
 */
export function analyze(raw, onStage = () => {}) {
  onStage('normalize');
  const { colors: normalized } = normalizeColors(raw.colors ?? []);
  computeShares(normalized);

  onStage('cluster');
  const clusters = clusterColors(normalized);

  onStage('roles');
  const kept = assignRoles(clusters);

  onStage('naming');
  const colors = nameColors(kept);
  const typography = analyzeTypography(raw);
  const spacing = analyzeSpacing(raw);
  const radii = analyzeRadii(raw);
  const shadows = analyzeShadows(raw);
  const breakpoints = analyzeBreakpoints(raw);
  const tokens = { colors, typography, spacing, radii, shadows, breakpoints };
  const components = buildRecipes(raw, tokens, colorLookup(colors));

  const sheets = raw.stylesheets ?? { readable: 0, unreadable: 0 };
  const partial =
    sheets.unreadable > 0 || sheets.readable === 0 ? ['breakpoints', 'cssVariables'] : [];

  return {
    meta: {
      sourceUrl: raw.url,
      hostname: hostnameOf(raw.url),
      capturedAt: raw.capturedAt,
      colorScheme: raw.colorScheme,
      partial,
      truncated: Boolean(raw.truncated),
      stylesheets: { readable: sheets.readable, unreadable: sheets.unreadable },
    },
    ...tokens,
    components,
  };
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname || 'local-file';
  } catch {
    return 'unknown';
  }
}
