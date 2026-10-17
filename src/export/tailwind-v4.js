// theme.css for Tailwind CSS v4. Scale tokens go in @theme; semantic aliases reference other
// variables, so they go in @theme inline.

import { formatFontStack } from '../analyze/units.js';
import { collectTokens, finish, generatedBy, pxString, safeComment, varName } from './common.js';

export function exportTailwindV4(design, version) {
  const t = collectTokens(design);
  const groups = [];
  groups.push(t.colors.map((c) => `  ${varName('color', c.name)}: ${c.hex};`));
  groups.push(t.families.map((f) => `  ${varName('font', f.name)}: ${formatFontStack(f.stack)};`));
  groups.push(
    t.sizes.flatMap((s) => {
      const lines = [`  ${varName('text', s.name)}: ${pxString(s.sizePx)};`];
      if (s.lineHeightPx !== null)
        lines.push(`  ${varName('text', s.name)}--line-height: ${pxString(s.lineHeightPx)};`);
      return lines;
    }),
  );
  if (design.spacing.baseUnitPx && t.spacing.length) {
    // Tailwind derives every spacing utility from the base, so only the base is emitted.
    groups.push([`  --spacing: ${design.spacing.baseUnitPx}px;`]);
  } else if (t.spacing.length) {
    groups.push([
      `  /* Spacing values (no base unit): ${t.spacing.map((s) => pxString(s.px)).join(', ')} */`,
    ]);
  }
  groups.push(t.radii.map((r) => `  ${varName('radius', r.name)}: ${pxString(r.px)};`));
  groups.push(t.shadows.map((s) => `  ${varName('shadow', s.name)}: ${s.value};`));
  groups.push(t.breakpoints.map((b) => `  ${varName('breakpoint', b.name)}: ${pxString(b.px)};`));

  const body = groups.filter((g) => g.length).flatMap((g, i) => (i === 0 ? g : ['', ...g]));
  const out = [`/* ${safeComment(generatedBy(design, version))} */`];
  if (body.length) out.push('@theme {', ...body, '}');
  if (t.semantic.length) {
    out.push('', '@theme inline {');
    for (const [role, c] of t.semantic)
      out.push(`  ${varName('color', role)}: var(${varName('color', c.name)});`);
    out.push('}');
  }
  return finish(out);
}
