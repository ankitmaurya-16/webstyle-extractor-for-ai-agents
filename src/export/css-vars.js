// variables.css: plain CSS custom properties on :root.

import { formatFontStack } from '../analyze/units.js';
import { collectTokens, finish, generatedBy, pxString, safeComment, varName } from './common.js';

export function exportCssVars(design, version) {
  const t = collectTokens(design);
  const lines = [];
  for (const c of t.colors) lines.push(`${varName('color', c.name)}: ${c.hex};`);
  for (const [role, c] of t.semantic)
    lines.push(`${varName('color', role)}: var(${varName('color', c.name)});`);
  for (const f of t.families)
    lines.push(`${varName('font', f.name)}: ${formatFontStack(f.stack)};`);
  for (const s of t.sizes) {
    lines.push(`${varName('text', s.name)}: ${pxString(s.sizePx)};`);
    if (s.lineHeightPx !== null)
      lines.push(`${varName('text', s.name)}-line-height: ${pxString(s.lineHeightPx)};`);
  }
  for (const s of t.spacing) lines.push(`${varName('space', s.name)}: ${pxString(s.px)};`);
  for (const r of t.radii) lines.push(`${varName('radius', r.name)}: ${pxString(r.px)};`);
  for (const s of t.shadows) lines.push(`${varName('shadow', s.name)}: ${s.value};`);
  for (const b of t.breakpoints) {
    lines.push(
      `${varName('breakpoint', b.name)}: ${pxString(b.px)}; /* reference only: custom properties do not work inside @media */`,
    );
  }
  return finish([
    `/* ${safeComment(generatedBy(design, version))} */`,
    ':root {',
    ...lines.map((l) => `  ${l}`),
    '}',
  ]);
}
