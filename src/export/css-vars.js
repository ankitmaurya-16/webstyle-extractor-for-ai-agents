// variables.css: plain CSS custom properties. Primitives and light semantic values in :root,
// dark semantic values in the site's dark block (v2 spec 9.3). Site variable names are written
// verbatim for tokens that have one (AC-F10.9).

import {
  collectTokens,
  darkBlock,
  emString,
  finish,
  formatFontStack,
  generatedBy,
  prepare,
  pxString,
  roleVar,
  rootAndOtherMode,
  safeComment,
  varName,
} from './common.js';

/** The custom property used for a token in variables.css. */
export const cssVarOf = (category, token) => token.siteVariable ?? varName(category, token.name);

export function exportCssVars(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const lines = [];
  const add = (category, token, value, comment = '') => lines.push(`${cssVarOf(category, token)}: ${value};${comment}`);
  for (const c of t.colors) add('color', c, c.hex);
  const { root, other } = rootAndOtherMode(t);
  for (const [role, c] of t.semanticByMode[root] ?? []) {
    if (cssVarOf('color', c) !== roleVar(role)) lines.push(`${roleVar(role)}: var(${cssVarOf('color', c)});`);
  }
  for (const g of t.gradients) add('gradient', g, gradientCss(d, g));
  for (const f of t.families) add('font', f, formatFontStack(f.stack));
  for (const s of t.sizes) {
    add('text', s, pxString(s.sizePx));
    if (s.lineHeightPx !== null) lines.push(`${varName('text', s.name)}-line-height: ${pxString(s.lineHeightPx)};`);
  }
  for (const s of t.textStyles) {
    const base = `--text-${s.name}`;
    lines.push(`${base}-font-size: ${pxString(s.sizePx)};`);
    if (s.lineHeightPx !== null) lines.push(`${base}-line-height: ${pxString(s.lineHeightPx)};`);
    lines.push(`${base}-font-weight: ${s.fontWeight};`);
    if (s.letterSpacingEm) lines.push(`${base}-letter-spacing: ${emString(s.letterSpacingEm)};`);
    if (s.textTransform && s.textTransform !== 'none') lines.push(`${base}-text-transform: ${s.textTransform};`);
  }
  for (const l of t.letterSpacings) add('tracking', l, emString(l.em));
  for (const s of t.spacing) add('space', s, pxString(s.px));
  for (const c of t.containers) add('container', c, pxString(c.px));
  for (const g of t.gaps.filter((x) => !x.spaceId)) add('gap', g, pxString(g.px));
  for (const r of t.radii) add('radius', r, pxString(r.px));
  for (const b of t.borderWidths) add('border', b, pxString(b.px));
  for (const s of t.shadows) add('shadow', s, s.value);
  for (const o of t.opacities) add('opacity', o, String(o.value));
  for (const z of t.zIndex) add('z', z, String(z.value));
  for (const x of t.durations) add('duration', x, `${x.ms}ms`);
  for (const e of t.easings) add('easing', e, e.css);
  const ring = d.focusRing;
  if (ring && ring.source !== 'browser-default') {
    if (ring.outline) lines.push(`--focus-ring-outline: ${ring.outline};`);
    if (ring.offsetPx !== null && ring.outline) lines.push(`--focus-ring-offset: ${ring.offsetPx}px;`);
    if (ring.boxShadow) lines.push(`--focus-ring-shadow: ${ring.boxShadow};`);
  }
  for (const b of t.breakpoints) {
    add('breakpoint', b, pxString(b.px), ' /* reference only: custom properties do not work inside @media */');
  }

  const out = [`/* ${safeComment(generatedBy(d, version))} */`, ':root {', ...lines.map((l) => `  ${l}`), '}'];
  if (other) {
    const block = darkBlock(d);
    const dark = (t.semanticByMode[other] ?? []).map(([role, c]) => `${roleVar(role)}: var(${cssVarOf('color', c)});`);
    if (dark.length) out.push('', block.open, ...dark.map((l) => `${block.indent}${l}`), block.close);
  }
  return finish(out);
}

/** A gradient with stops written as the variables of their color tokens (AC-F18.4). */
export function gradientCss(d, g, varFor = (c) => `var(${cssVarOf('color', c)})`) {
  const stops = g.stops.map((s) => {
    const token = s.colorTokenId ? d.colors.find((c) => c.id === s.colorTokenId && !c.excluded) : null;
    return `${token ? varFor(token) : s.hex}${s.position ? ` ${s.position}` : ''}`;
  });
  return `${g.repeating ? 'repeating-' : ''}${g.type}-gradient(${[g.direction, ...stops].filter(Boolean).join(', ')})`;
}
