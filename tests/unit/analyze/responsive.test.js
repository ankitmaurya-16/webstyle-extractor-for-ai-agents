import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { buildResponsive } from '../../../src/analyze/responsive.js';
import { captureOf, capturesFor, loadRaw, rawSnapshot, stat } from '../helpers.js';

const style = (sizePx, tags, usage, lineHeightPx = null) => ({
  family: 'system-ui, sans-serif',
  sizePx,
  lineHeightPx,
  fontWeight: tags.some((t) => /^h\d$/.test(t)) ? 700 : 400,
  letterSpacingEm: 0,
  textTransform: 'none',
  tags,
  count: 1,
  usage,
});
const spacing = (pairs) => pairs.map(([px, n]) => stat(`${px}px`, n, [], n));

/**
 * The responsive fixture as it renders below 640 px and between 640 and 1024 px, following its
 * media queries: h1 32 px and h2 24 px until 1024 px; the container is the full width, then
 * 600 px; 1, then 2 grid columns; padding 8 px with 4 px, then 16 px.
 */
function widthRaws() {
  const base = loadRaw('responsive');
  const mobile = {
    ...base,
    viewport: { width: 375, height: 720 },
    textStyles: [
      style(16, ['div', 'p'], 88, 24),
      style(32, ['h1'], 18, 40),
      style(24, ['h2'], 7, 32),
    ],
    containers: [],
    gridColumns: [stat('1', 1)],
    spacing: spacing([
      [8, 20],
      [4, 2],
    ]),
  };
  const tablet = {
    ...base,
    viewport: { width: 768, height: 720 },
    textStyles: mobile.textStyles,
    containers: [stat('600px', 300000)],
    gridColumns: [stat('2', 1)],
    spacing: spacing([[16, 22]]),
  };
  return { base, mobile, tablet };
}

const widthCapture = (raw) => captureOf(raw, { kind: 'width', viewportWidth: raw.viewport.width });

describe('responsive table (F24, analysis side)', () => {
  it('AC-F24.3 width captures never change token usage shares', () => {
    const { base, mobile, tablet } = widthRaws();
    const alone = analyze(capturesFor(base));
    const withWidths = analyze([...capturesFor(base), widthCapture(mobile), widthCapture(tablet)]);
    const shares = (d) =>
      [
        d.colors,
        d.typography.sizes,
        d.typography.textStyles,
        d.spacing.tokens,
        d.layout.containers,
        d.layout.gridColumns,
      ].map((list) => list.map((t) => [t.id, t.usageShare, t.count]));
    expect(shares(withWidths)).toEqual(shares(alone));
    expect(withWidths.spacing.baseUnitPx).toBe(alone.spacing.baseUnitPx);
    expect(alone.responsive).toBeNull();
    expect(withWidths.meta.viewports).toEqual([1280, 375, 768]);
  });

  it('AC-F24.4 holds heading and body sizes, containers, grid columns and spacing base per width', () => {
    const { base, mobile, tablet } = widthRaws();
    const d = analyze([
      ...capturesFor(base),
      widthCapture(tablet),
      widthCapture(mobile),
      captureOf(base, { kind: 'width', viewportWidth: 1280, id: 'w1280' }),
    ]);
    const table = d.responsive;
    expect(table.widths).toEqual([375, 768, 1280]);
    const sizes = Object.fromEntries(table.textSizes.map((t) => [t.label, t.byWidth]));
    expect(sizes).toEqual({
      h1: { 375: 32, 768: 32, 1280: 48 },
      h2: { 375: 24, 768: 24, 1280: 30 },
      body: { 375: 16, 768: 16, 1280: 16 },
    });
    // Rows point at the base design's type-size tokens.
    const sizeIds = new Set(d.typography.sizes.map((s) => s.id));
    for (const row of table.textSizes) expect(sizeIds.has(row.tokenId), row.label).toBe(true);
    expect(table.textSizes.find((t) => t.label === 'h1').tokenId).toBe(
      d.typography.sizes.find((s) => s.headings.includes('h1')).id,
    );
    expect(table.containers).toEqual({ 375: null, 768: 600, 1280: 960 });
    expect(table.gridColumns).toEqual({ 375: 1, 768: 2, 1280: 4 });
    expect(table.spacingBase).toEqual({ 375: 4, 768: 8, 1280: 8 });
  });

  it('AC-F24.4 reports the container width that applies, never wider than the viewport', () => {
    const narrow = rawSnapshot({
      viewport: { width: 375, height: 720 },
      containers: [stat('1200px', 1000)],
    });
    const table = buildResponsive([{ width: 375, raw: narrow }], []);
    expect(table.containers).toEqual({ 375: 375 });
  });

  it('AC-F24.4 leaves out labels that no width has and returns null without widths', () => {
    const raw = rawSnapshot({ textStyles: [style(16, ['p'], 100)] });
    const table = buildResponsive(
      [{ width: 1024, raw }],
      [{ id: 'text:16', name: 'base', sizePx: 16, headings: [] }],
    );
    expect(table.textSizes).toEqual([{ label: 'body', tokenId: 'text:16', byWidth: { 1024: 16 } }]);
    expect(table.gridColumns).toEqual({ 1024: null });
    expect(table.spacingBase).toEqual({ 1024: null });
    expect(buildResponsive([], [])).toBeNull();
  });
});
