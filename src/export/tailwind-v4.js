// theme.css for Tailwind CSS v4 (v2 spec 9.3, 9.4). Primitives in @theme; semantic variables
// in :root and the dark block; @theme inline maps --color-<role> to them; categories without a
// v4 theme namespace are plain :root variables used with the `utility-(--var)` syntax.

import {
  collectTokens,
  darkBlock,
  emString,
  finish,
  formatFontStack,
  generatedBy,
  prepare,
  pxString,
  rootAndOtherMode,
  safeComment,
  varName,
} from './common.js';
import { gradientCss } from './css-vars.js';

export function exportTailwindV4(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const groups = [];
  groups.push(t.colors.map((c) => `  ${varName('color', c.name)}: ${c.hex};`));
  groups.push(
    t.families.map(
      (f) =>
        `  ${varName('font', f.name)}: ${formatFontStack(f.stack)};${f.webFont ? ` /* web font: ${f.webFont.provider} */` : ''}`,
    ),
  );
  groups.push(
    t.sizes.flatMap((s) => {
      const lines = [`  ${varName('text', s.name)}: ${pxString(s.sizePx)};`];
      if (s.lineHeightPx !== null)
        lines.push(`  ${varName('text', s.name)}--line-height: ${pxString(s.lineHeightPx)};`);
      return lines;
    }),
  );
  groups.push(t.letterSpacings.map((l) => `  ${varName('tracking', l.name)}: ${emString(l.em)};`));
  if (d.spacing.baseUnitPx && t.spacing.length) {
    // Tailwind derives every spacing utility from the base, so only the base is emitted.
    groups.push([`  --spacing: ${d.spacing.baseUnitPx}px;`]);
  } else if (t.spacing.length) {
    groups.push([
      `  /* Spacing values (no base unit): ${t.spacing.map((s) => pxString(s.px)).join(', ')} */`,
    ]);
  }
  groups.push(t.containers.map((c) => `  ${varName('container', c.name)}: ${pxString(c.px)};`));
  groups.push(t.radii.map((r) => `  ${varName('radius', r.name)}: ${pxString(r.px)};`));
  groups.push(t.shadows.map((s) => `  ${varName('shadow', s.name)}: ${s.value};`));
  groups.push(t.easings.map((e) => `  ${varName('easing', e.name)}: ${e.css};`));
  groups.push(t.breakpoints.map((b) => `  ${varName('breakpoint', b.name)}: ${pxString(b.px)};`));

  const out = [`/* ${safeComment(generatedBy(d, version))} */`];
  const block = darkBlock(d);
  if (t.paired && (block.mechanism === 'class' || block.mechanism === 'attribute')) {
    out.push(`@custom-variant dark (&:where(${block.selector}, ${block.selector} *));`, '');
  }
  const body = groups.filter((g) => g.length).flatMap((g, i) => (i === 0 ? g : ['', ...g]));
  if (body.length) out.push('@theme {', ...body, '}');

  // Plain variables: semantic values, then categories with no theme namespace.
  const { root, other } = rootAndOtherMode(t);
  const semanticLine = (role, c) =>
    `  --${role}: ${c.alpha < 1 ? c.hex : `var(${varName('color', c.name)})`};`;
  const rootLines = (t.semanticByMode[root] ?? []).map(([role, c]) => semanticLine(role, c));
  rootLines.push(...t.zIndex.map((z) => `  ${varName('z', z.name)}: ${z.value};`));
  rootLines.push(...t.opacities.map((o) => `  ${varName('opacity', o.name)}: ${o.value};`));
  rootLines.push(...t.durations.map((x) => `  ${varName('duration', x.name)}: ${x.ms}ms;`));
  rootLines.push(
    ...t.borderWidths.map((b) => `  ${varName('border', b.name)}: ${pxString(b.px)};`),
  );
  rootLines.push(
    ...t.gaps
      .filter((g) => !g.spaceId)
      .map((g) => `  ${varName('gap', g.name)}: ${pxString(g.px)};`),
  );
  rootLines.push(
    ...t.gradients.map(
      (g) =>
        `  ${varName('gradient', g.name)}: ${gradientCss(d, g, (c) => `var(${varName('color', c.name)})`)};`,
    ),
  );
  if (rootLines.length) out.push('', ':root {', ...rootLines, '}');
  if (other) {
    const dark = (t.semanticByMode[other] ?? []).map(([role, c]) => semanticLine(role, c));
    if (dark.length) {
      if (block.mechanism === 'media')
        out.push(
          '',
          '@media (prefers-color-scheme: dark) {',
          '  :root {',
          ...dark.map((l) => `  ${l}`),
          '  }',
          '}',
        );
      else out.push('', `${block.selector} {`, ...dark, '}');
    }
  }
  const roles = [
    ...new Set(Object.values(t.semanticByMode).flatMap((pairs) => pairs.map(([role]) => role))),
  ];
  if (roles.length) {
    out.push(
      '',
      '@theme inline {',
      ...roles.map((role) => `  --color-${role}: var(--${role});`),
      '}',
    );
  }
  for (const s of t.textStyles) {
    out.push('', `@utility text-${s.name} {`);
    const family = d.typography.families.find((f) => f.id === s.familyId && !f.excluded);
    if (family) out.push(`  font-family: var(${varName('font', family.name)});`);
    out.push(`  font-size: ${pxString(s.sizePx)};`);
    if (s.lineHeightPx !== null) out.push(`  line-height: ${pxString(s.lineHeightPx)};`);
    out.push(`  font-weight: ${s.fontWeight};`);
    if (s.letterSpacingEm) out.push(`  letter-spacing: ${emString(s.letterSpacingEm)};`);
    if (s.textTransform && s.textTransform !== 'none')
      out.push(`  text-transform: ${s.textTransform};`);
    out.push('}');
  }
  return finish(out);
}
