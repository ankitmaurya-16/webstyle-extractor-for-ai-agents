// tailwind.config.js for Tailwind CSS v3. Uses theme.extend so Tailwind's defaults stay
// available. Semantic colors are written as resolved hex.

import { stripPrefix } from '../model/design.js';
import { collectTokens, finish, generatedBy, pxString, safeComment } from './common.js';

const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) || /^[1-9]\d*$/.test(k) ? k : quote(k));
const object = (entries) => `{ ${entries.map(([k, v]) => `${key(k)}: ${v}`).join(', ')} }`;

export function exportTailwindV3(design, version) {
  const t = collectTokens(design);
  const extend = [];

  if (t.colors.length) {
    const colorLines = [];
    const families = new Map();
    for (const c of t.colors) {
      if (c.step !== null && c.name === `${c.family}-${c.step}`) {
        const list = families.get(c.family) ?? [];
        list.push([String(c.step), quote(c.hex)]);
        families.set(c.family, list);
      }
    }
    const emittedFamilies = new Set();
    for (const c of t.colors) {
      if (c.step !== null && c.name === `${c.family}-${c.step}`) {
        if (emittedFamilies.has(c.family)) continue;
        emittedFamilies.add(c.family);
        colorLines.push(`${key(c.family)}: ${object(families.get(c.family))},`);
      } else {
        colorLines.push(`${key(c.name)}: ${quote(c.hex)},`);
      }
    }
    const scaleKeys = new Set(t.colors.map((c) => c.name).concat([...emittedFamilies]));
    for (const [role, c] of t.semantic) {
      if (!scaleKeys.has(role)) colorLines.push(`${key(role)}: ${quote(c.hex)},`);
    }
    extend.push(['colors', colorLines]);
  }
  if (t.families.length) {
    extend.push([
      'fontFamily',
      t.families.map((f) => `${key(f.name)}: [${f.stack.map(quote).join(', ')}],`),
    ]);
  }
  if (t.sizes.length) {
    extend.push([
      'fontSize',
      t.sizes.map((s) =>
        s.lineHeightPx === null
          ? `${key(s.name)}: ${quote(pxString(s.sizePx))},`
          : `${key(s.name)}: [${quote(pxString(s.sizePx))}, { lineHeight: ${quote(pxString(s.lineHeightPx))} }],`,
      ),
    ]);
  }
  const inline = (name, list, prefix, value) => {
    if (list.length)
      extend.push([name, object(list.map((tk) => [stripPrefix(tk.name, prefix), value(tk)]))]);
  };
  inline('spacing', t.spacing, 'space', (s) => quote(pxString(s.px)));
  inline('borderRadius', t.radii, 'radius', (r) => quote(pxString(r.px)));
  inline('boxShadow', t.shadows, 'shadow', (s) => quote(s.value));
  inline('screens', t.breakpoints, '', (b) => quote(pxString(b.px)));

  const out = [
    `// ${safeComment(generatedBy(design, version))}`,
    "/** @type {import('tailwindcss').Config} */",
    'module.exports = {',
    '  theme: {',
    '    extend: {',
  ];
  for (const [name, value] of extend) {
    if (Array.isArray(value)) {
      out.push(`      ${name}: {`, ...value.map((l) => `        ${l}`), '      },');
    } else {
      out.push(`      ${name}: ${value},`);
    }
  }
  out.push('    },', '  },', '};');
  return finish(out);
}
