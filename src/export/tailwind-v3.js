// tailwind.webstyle.js for Tailwind CSS v3. Uses theme.extend so Tailwind's defaults stay
// available. With two themes, semantic colors are written as var(--color-<role>) and need
// variables.css (v2 spec 9.3).

import { stripPrefix } from '../model/design.js';
import {
  collectTokens,
  emString,
  finish,
  generatedBy,
  prepare,
  pxString,
  roleVar,
  safeComment,
} from './common.js';
import { gradientCss } from './css-vars.js';

const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) || /^[1-9]\d*$/.test(k) ? k : quote(k));
const object = (entries) => `{ ${entries.map(([k, v]) => `${key(k)}: ${v}`).join(', ')} }`;

export function exportTailwindV3(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const extend = [];

  if (t.colors.length) {
    const colorLines = [];
    const families = new Map();
    const scaleName = (c) => c.alpha >= 1 && c.step !== null && c.name === `${c.family}-${c.step}`;
    for (const c of t.colors) {
      if (scaleName(c)) {
        const list = families.get(c.family) ?? [];
        list.push([String(c.step), quote(c.hex)]);
        families.set(c.family, list);
      }
    }
    const emitted = new Set();
    for (const c of t.colors) {
      if (scaleName(c)) {
        if (emitted.has(c.family)) continue;
        emitted.add(c.family);
        colorLines.push(`${key(c.family)}: ${object(families.get(c.family))},`);
      } else {
        colorLines.push(`${key(c.name)}: ${quote(c.hex)},`);
      }
    }
    const taken = new Set([...t.colors.map((c) => c.name), ...emitted]);
    const roles = new Map();
    for (const pairs of Object.values(t.semanticByMode))
      for (const [role, c] of pairs) if (!roles.has(role)) roles.set(role, c);
    for (const [role, c] of roles) {
      if (taken.has(role)) continue;
      colorLines.push(`${key(role)}: ${t.paired ? quote(`var(${roleVar(role)})`) : quote(c.hex)},`);
    }
    extend.push(['colors', colorLines]);
  }
  if (t.families.length) {
    extend.push([
      'fontFamily',
      t.families.map((f) => `${key(f.name)}: [${f.stack.map(quote).join(', ')}],`),
    ]);
  }
  const sizeLines = t.sizes.map((s) =>
    s.lineHeightPx === null
      ? `${key(s.name)}: ${quote(pxString(s.sizePx))},`
      : `${key(s.name)}: [${quote(pxString(s.sizePx))}, { lineHeight: ${quote(pxString(s.lineHeightPx))} }],`,
  );
  for (const s of t.textStyles) {
    const opts = [];
    if (s.lineHeightPx !== null) opts.push(`lineHeight: ${quote(pxString(s.lineHeightPx))}`);
    if (s.letterSpacingEm) opts.push(`letterSpacing: ${quote(emString(s.letterSpacingEm))}`);
    opts.push(`fontWeight: ${quote(String(s.fontWeight))}`);
    if (!t.sizes.some((x) => x.name === s.name))
      sizeLines.push(`${key(s.name)}: [${quote(pxString(s.sizePx))}, { ${opts.join(', ')} }],`);
  }
  if (sizeLines.length) extend.push(['fontSize', sizeLines]);
  const inline = (name, list, prefix, value) => {
    if (list.length)
      extend.push([
        name,
        object(list.map((tk) => [prefix ? stripPrefix(tk.name, prefix) : tk.name, value(tk)])),
      ]);
  };
  inline('letterSpacing', t.letterSpacings, 'tracking', (l) => quote(emString(l.em)));
  inline('spacing', t.spacing, 'space', (s) => quote(pxString(s.px)));
  inline('maxWidth', t.containers, 'container', (c) => quote(pxString(c.px)));
  inline(
    'gap',
    t.gaps.filter((g) => !g.spaceId),
    'gap',
    (g) => quote(pxString(g.px)),
  );
  inline('borderRadius', t.radii, 'radius', (r) => quote(pxString(r.px)));
  inline('borderWidth', t.borderWidths, 'border', (b) => quote(pxString(b.px)));
  inline('boxShadow', t.shadows, 'shadow', (s) => quote(s.value));
  inline('opacity', t.opacities, 'opacity', (o) => quote(String(o.value)));
  inline('zIndex', t.zIndex, 'z', (z) => quote(String(z.value)));
  inline('transitionDuration', t.durations, 'duration', (x) => quote(`${x.ms}ms`));
  inline('transitionTimingFunction', t.easings, 'ease', (e) => quote(e.css));
  inline('backgroundImage', t.gradients, 'gradient', (g) => quote(gradientCss(d, g, (c) => c.hex)));
  inline('screens', t.breakpoints, '', (b) => quote(pxString(b.px)));
  const ring = d.focusRing;
  if (ring && ring.source !== 'browser-default' && ring.outline) {
    const [width] = ring.outline.split(' ');
    const ringColor = d.colors.find((c) => c.id === ring.colorTokenId && !c.excluded);
    if (ringColor) extend.push(['ringColor', object([['DEFAULT', quote(ringColor.hex)]])]);
    extend.push(['ringWidth', object([['DEFAULT', quote(width)]])]);
    if (ring.offsetPx !== null)
      extend.push(['ringOffsetWidth', object([['DEFAULT', quote(`${ring.offsetPx}px`)]])]);
  }

  const { themeMechanism: mechanism, themeSelector: selector } = d.meta;
  const out = [`// ${safeComment(generatedBy(d, version))}`];
  if (t.paired)
    out.push(
      '// Semantic colors read CSS variables: import design/variables.css in your global stylesheet.',
    );
  out.push("/** @type {import('tailwindcss').Config} */", 'module.exports = {');
  if (t.paired) {
    out.push(
      mechanism === 'class' || mechanism === 'attribute'
        ? `  darkMode: ['selector', ${quote(selector)}],`
        : "  darkMode: 'media',",
    );
  }
  out.push('  theme: {', '    extend: {');
  for (const [name, value] of extend) {
    if (Array.isArray(value))
      out.push(`      ${name}: {`, ...value.map((l) => `        ${l}`), '      },');
    else out.push(`      ${name}: ${value},`);
  }
  out.push('    },', '  },', '};');
  return finish(out);
}
