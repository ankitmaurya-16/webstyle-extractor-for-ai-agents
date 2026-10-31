// shadcn-theme.css (F31, v2 spec 9.6). Always :root and .dark (shadcn's convention). No color is
// invented: a variable with no source gets a TODO comment instead.

import { converter, parse, wcagContrast } from 'culori';
import { cssValue, resolveValue, roleToken, visible } from '../model/design.js';
import { collectTokens, finish, generatedBy, prepare, safeComment } from './common.js';

const toOklch = converter('oklch');
const toHsl = converter('hsl');
const r3 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;
const r1 = (n) => Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;

export function oklchString(hex) {
  const c = toOklch(parse(hex.slice(0, 7)));
  const alpha = hex.length === 9 ? r3(parseInt(hex.slice(7, 9), 16) / 255) : 1;
  const h = c.h === undefined || Number.isNaN(c.h) ? 0 : r3(c.h);
  return `oklch(${r3(c.l)} ${r3(c.c)} ${h}${alpha < 1 ? ` / ${alpha}` : ''})`;
}

export function hslTriplet(hex) {
  const c = toHsl(parse(hex.slice(0, 7)));
  const h = c.h === undefined || Number.isNaN(c.h) ? 0 : r1(c.h);
  // A translucent value keeps its alpha; `hsl(var(--border))` accepts the `/ a` form.
  const alpha = hex.length === 9 ? r3(parseInt(hex.slice(7, 9), 16) / 255) : 1;
  return `${h} ${r1((c.s ?? 0) * 100)}% ${r1(c.l * 100)}%${alpha < 1 ? ` / ${alpha}` : ''}`;
}

const VARIABLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
];

/** Resolves each shadcn variable for one theme, in the order of preference in 9.6. */
export function shadcnValues(d, mode) {
  const role = (r) => roleToken(d, r, mode)?.hex ?? null;
  const recipe = (kind, variant) =>
    d.components.find((x) => !x.excluded && x.kind === kind && (!variant || x.variant === variant))
      ?.byMode[mode]?.default;
  const color = (styles, prop) => {
    if (!styles || styles[prop] === undefined) return null;
    const v = cssValue(d, styles[prop]);
    return /^#[0-9a-f]{6,8}$/.test(v) ? v : null;
  };
  const inputBorder = (() => {
    const s = recipe('input');
    if (!s || typeof s.border !== 'string' || s.border === 'none') return null;
    const hex = s.border.split(' ')[2];
    return /^#/.test(hex ?? '') ? hex : null;
  })();
  const card = recipe('card');
  const primaryButton = recipe('button', 'primary');
  const secondaryButton = recipe('button', 'secondary');
  const grays = visible(d.colors).filter(
    (c) => c.alpha >= 1 && c.family === 'gray' && c.modes.includes(mode),
  );
  const lightestGray =
    grays.sort((a, b) => (mode === 'dark' ? a.oklch.l - b.oklch.l : b.oklch.l - a.oklch.l))[0]
      ?.hex ?? null;

  const v = {};
  v.background = role('background');
  v.foreground = role('text');
  v.card = color(card, 'background-color') ?? role('surface') ?? role('background');
  v['card-foreground'] = color(card, 'color') ?? role('text');
  v.popover = role('surface') ?? role('background');
  v['popover-foreground'] = role('text');
  v.primary = role('primary');
  v['primary-foreground'] = color(primaryButton, 'color') ?? highestContrast(d, v.primary, mode);
  v.secondary = color(secondaryButton, 'background-color') ?? role('surface');
  v['secondary-foreground'] = color(secondaryButton, 'color') ?? role('text');
  v.muted = role('surface') ?? lightestGray;
  v['muted-foreground'] = role('text-muted');
  v.accent = role('accent') ?? role('surface');
  v['accent-foreground'] = role('text');
  v.destructive = role('danger');
  v.border = role('border');
  v.input = inputBorder ?? role('border');
  v.ring = role('focus-ring') ?? role('primary');
  return v;
}

/** The extracted color with the highest contrast against `hex`, if it reaches 4.5:1 (AC-F31.2). */
function highestContrast(d, hex, mode) {
  if (!hex) return null;
  let best = null;
  let bestRatio = 0;
  for (const c of visible(d.colors).filter((x) => x.alpha >= 1 && x.modes.includes(mode))) {
    const ratio = wcagContrast(c.hex, hex.slice(0, 7));
    if (ratio > bestRatio) {
      best = c.hex;
      bestRatio = ratio;
    }
  }
  return bestRatio >= 4.5 ? best : null;
}

/** Top saturated colors, preferring distinct hue families (AC-F31.5). */
export function chartColors(d) {
  const saturated = visible(d.colors)
    .filter((c) => c.alpha >= 1 && c.oklch.c >= 0.08)
    .sort((a, b) => b.usageShare - a.usageShare);
  const picked = [];
  const families = new Set();
  for (const c of saturated) {
    if (picked.length >= 5) break;
    if (!families.has(c.family)) {
      picked.push(c);
      families.add(c.family);
    }
  }
  for (const c of saturated) if (picked.length < 5 && !picked.includes(c)) picked.push(c);
  return picked.map((c) => c.hex);
}

/** Most-used radius in rem (AC-F31.6). */
export function radiusRem(d) {
  const r = visible(d.radii)
    .filter((x) => x.px < 9999)
    .sort((a, b) => b.usageShare - a.usageShare)[0];
  return r ? `${Math.round((r.px / 16) * 1000) / 1000}rem` : null;
}

export function exportShadcn(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const format = ctx.shadcnFormat === 'hsl' ? 'hsl' : 'oklch';
  const fmt = (hex) => (format === 'hsl' ? hslTriplet(hex) : oklchString(hex));
  const block = (mode, withRadius) => {
    const v = shadcnValues(d, mode);
    const lines = [];
    if (withRadius) {
      const radius = radiusRem(d);
      lines.push(
        radius
          ? `  --radius: ${radius};`
          : '  /* --radius: TODO, no border radius found on the page */',
      );
    }
    for (const name of VARIABLES) {
      lines.push(
        v[name] ? `  --${name}: ${fmt(v[name])};` : `  /* --${name}: TODO, ${todoReason(name)} */`,
      );
    }
    const charts = chartColors(d);
    charts.forEach((hex, i) => lines.push(`  --chart-${i + 1}: ${fmt(hex)};`));
    return lines;
  };
  const lightMode = t.modes.includes('light') ? 'light' : t.primaryMode;
  const out = [
    `/* ${safeComment(generatedBy(d, version))} */`,
    ':root {',
    ...block(lightMode, true),
    '}',
  ];
  if (t.modes.includes('dark') && t.modes.includes('light'))
    out.push('', '.dark {', ...block('dark', false), '}');
  if (format === 'oklch') {
    // Only variables that have a value are mapped, so no utility points at an undefined variable.
    const defined = shadcnValues(d, lightMode);
    const names = [
      ...VARIABLES.filter((n) => defined[n]),
      ...chartColors(d).map((_, i) => `chart-${i + 1}`),
    ];
    out.push('', '@theme inline {', ...names.map((n) => `  --color-${n}: var(--${n});`));
    if (radiusRem(d)) {
      out.push(
        '  --radius-sm: calc(var(--radius) - 4px);',
        '  --radius-md: calc(var(--radius) - 2px);',
        '  --radius-lg: var(--radius);',
        '  --radius-xl: calc(var(--radius) + 4px);',
      );
    }
    out.push('}');
  }
  return finish(out);
}

function todoReason(name) {
  const reasons = {
    destructive: 'no danger color found on the page',
    'primary-foreground': 'no extracted color reaches 4.5:1 on primary',
    primary: 'no primary color found on the page',
    ring: 'no focus ring or primary color found',
  };
  return reasons[name] ?? 'no matching color found on the page';
}

export { resolveValue };
