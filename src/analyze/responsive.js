// Responsive table (F24): what changes at each captured width. Width captures never feed token
// usage (AC-F24.3). Pure.

import { detectBaseUnit } from './layout.js';
import { round2, toPx } from './units.js';

const LABELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * @param {Array<{width: number, raw: object}>} widths
 * @param {object[]} sizeTokens base design's type sizes
 */
export function buildResponsive(widths, sizeTokens) {
  if (widths.length === 0) return null;
  const sorted = [...widths].sort((a, b) => a.width - b.width);
  const table = {
    widths: sorted.map((w) => w.width),
    textSizes: [],
    containers: {},
    gridColumns: {},
    spacingBase: {},
  };
  const labels = [...LABELS, 'body'];
  for (const label of labels) {
    const byWidth = {};
    for (const { width, raw } of sorted) {
      const styles = (raw.textStyles ?? []).filter((s) =>
        label === 'body' ? s.tags.includes('p') : s.tags.includes(label),
      );
      const top = styles.sort((a, b) => b.usage - a.usage)[0];
      if (top) byWidth[width] = round2(top.sizePx);
    }
    if (Object.keys(byWidth).length === 0) continue;
    const any = Object.values(byWidth)[0];
    const token =
      sizeTokens.find((t) => (label === 'body' ? t.name === 'base' : t.headings.includes(label))) ??
      sizeTokens.find((t) => t.sizePx === any);
    table.textSizes.push({ label, tokenId: token?.id ?? null, byWidth });
  }
  for (const { width, raw } of sorted) {
    const container = [...(raw.containers ?? [])].sort((a, b) => b.weight - a.weight)[0];
    // A max-width wider than the viewport is not what applies at that width; the page is.
    const maxPx = container ? toPx(container.value, raw.rootFontSizePx) : null;
    table.containers[width] = maxPx ? round2(Math.min(maxPx, width)) : null;
    const grid = [...(raw.gridColumns ?? [])].sort((a, b) => b.count - a.count)[0];
    table.gridColumns[width] = grid ? Number(grid.value) : null;
    const spacing = new Map();
    for (const s of raw.spacing ?? []) {
      const px = toPx(s.value, raw.rootFontSizePx);
      if (px) spacing.set(round2(px), (spacing.get(round2(px)) ?? 0) + (s.count || 1));
    }
    table.spacingBase[width] = detectBaseUnit(spacing);
  }
  return table;
}
