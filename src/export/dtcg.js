// tokens.json in the Design Tokens Community Group format (designtokens.org, 2025.10 stable).
// Color values use the structured form with colorSpace, components and hex; dimensions use
// { value, unit }; shadows use the structured shadow object.

import { parse, converter } from 'culori';
import { stripPrefix } from '../model/design.js';
import { collectTokens, generatedBy } from './common.js';

const toRgb = converter('rgb');
const round3 = (n) => Math.round(n * 1000) / 1000;
const dimension = (px) => ({ value: Math.round(px * 100) / 100, unit: 'px' });

export function dtcgColor(hex) {
  const rgb = toRgb(parse(hex));
  const value = {
    colorSpace: 'srgb',
    components: [round3(rgb.r), round3(rgb.g), round3(rgb.b)],
  };
  if (hex.length === 9) value.alpha = round3(rgb.alpha ?? 1);
  value.hex = hex.slice(0, 7);
  return value;
}

/** Splits a computed box-shadow into DTCG shadow objects, or null when it cannot be parsed. */
export function dtcgShadow(value) {
  const layers = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      layers.push(current.trim());
      current = '';
    } else current += ch;
  }
  layers.push(current.trim());
  const out = [];
  for (const layer of layers) {
    const colorMatch = /(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(
      layer,
    );
    const rest = (colorMatch ? layer.replace(colorMatch[0], ' ') : layer).trim();
    const inset = /\binset\b/.test(rest);
    const lengths = rest
      .replace(/\binset\b/, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => (/^-?\d*\.?\d+(px)?$/.test(p) ? Number.parseFloat(p) : NaN));
    if (lengths.length < 2 || lengths.some(Number.isNaN)) return null;
    const parsed = colorMatch ? parse(colorMatch[0]) : parse('black');
    if (!parsed) return null;
    const rgb = toRgb(parsed);
    const color = { colorSpace: 'srgb', components: [round3(rgb.r), round3(rgb.g), round3(rgb.b)] };
    if ((rgb.alpha ?? 1) < 1) color.alpha = round3(rgb.alpha);
    const shadow = {
      color,
      offsetX: dimension(lengths[0]),
      offsetY: dimension(lengths[1]),
      blur: dimension(lengths[2] ?? 0),
      spread: dimension(lengths[3] ?? 0),
    };
    if (inset) shadow.inset = true;
    out.push(shadow);
  }
  return out.length === 1 ? out[0] : out;
}

export function exportDtcg(design, version) {
  const t = collectTokens(design);
  const doc = { $description: generatedBy(design, version) };

  if (t.colors.length) {
    doc.color = {};
    for (const c of t.colors) doc.color[c.name] = { $type: 'color', $value: dtcgColor(c.hex) };
    for (const [role, c] of t.semantic)
      doc.color[role] = { $type: 'color', $value: `{color.${c.name}}` };
  }
  if (t.families.length) {
    doc.font = {};
    for (const f of t.families) doc.font[f.name] = { $type: 'fontFamily', $value: [...f.stack] };
  }
  if (t.sizes.length) {
    doc.text = {};
    doc['line-height'] = {};
    doc['font-weight'] = {};
    for (const s of t.sizes) {
      doc.text[s.name] = { $type: 'dimension', $value: dimension(s.sizePx) };
      if (s.lineHeightPx !== null) {
        doc['line-height'][s.name] = { $type: 'dimension', $value: dimension(s.lineHeightPx) };
      }
      doc['font-weight'][s.name] = { $type: 'fontWeight', $value: s.weight };
    }
    if (Object.keys(doc['line-height']).length === 0) delete doc['line-height'];
  }
  if (t.spacing.length) {
    doc.space = {};
    for (const s of t.spacing)
      doc.space[stripPrefix(s.name, 'space')] = { $type: 'dimension', $value: dimension(s.px) };
  }
  if (t.radii.length) {
    doc.radius = {};
    for (const r of t.radii)
      doc.radius[stripPrefix(r.name, 'radius')] = { $type: 'dimension', $value: dimension(r.px) };
  }
  const shadows = t.shadows.map((s) => [s, dtcgShadow(s.value)]).filter(([, v]) => v !== null);
  if (shadows.length) {
    doc.shadow = {};
    for (const [s, value] of shadows)
      doc.shadow[stripPrefix(s.name, 'shadow')] = { $type: 'shadow', $value: value };
  }
  if (t.breakpoints.length) {
    doc.breakpoint = {};
    for (const b of t.breakpoints)
      doc.breakpoint[b.name] = { $type: 'dimension', $value: dimension(b.px) };
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}
