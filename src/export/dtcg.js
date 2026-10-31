// tokens.json and tokens.dark.json in the Design Tokens Community Group format
// (designtokens.org, 2025.10). tokens.json holds primitives plus light semantic tokens;
// tokens.dark.json holds the dark semantic aliases only (v2 spec 9.3).

import { converter, parse } from 'culori';
import { stripPrefix } from '../model/design.js';
import { collectTokens, generatedBy, prepare, rootAndOtherMode } from './common.js';

const toRgb = converter('rgb');
const round3 = (n) => Math.round(n * 1000) / 1000;
const dimension = (px) => ({ value: Math.round(px * 100) / 100, unit: 'px' });

export function dtcgColor(hex) {
  const rgb = toRgb(parse(hex.slice(0, 7)));
  const value = { colorSpace: 'srgb', components: [round3(rgb.r), round3(rgb.g), round3(rgb.b)] };
  if (hex.length === 9) value.alpha = round3(parseInt(hex.slice(7, 9), 16) / 255);
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

/** Gradient stops as positions 0 to 1 where they are percentages. */
function dtcgGradient(g, colorRef) {
  return g.stops.map((s, i) => {
    const pct =
      s.position && /%$/.test(s.position)
        ? Number.parseFloat(s.position) / 100
        : i / Math.max(1, g.stops.length - 1);
    return { color: colorRef(s), position: round3(pct) };
  });
}

/**
 * @returns {{light: string, dark: string|null}} file texts
 */
export function exportDtcgFiles(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const doc = { $description: generatedBy(d, version) };
  const colorKey = (c) => c.name.replace(/\//g, '-a');

  if (t.colors.length) {
    doc.color = {};
    for (const c of t.colors) doc.color[colorKey(c)] = { $type: 'color', $value: dtcgColor(c.hex) };
  }
  const { root, other } = rootAndOtherMode(t);
  const semanticGroup = (mode) => {
    const group = {};
    for (const [role, c] of t.semanticByMode[mode] ?? [])
      group[role] = { $type: 'color', $value: `{color.${colorKey(c)}}` };
    return group;
  };
  const rootSemantic = semanticGroup(root);
  if (Object.keys(rootSemantic).length) doc.semantic = rootSemantic;
  if (t.gradients.length) {
    doc.gradient = {};
    for (const g of t.gradients) {
      const ref = (s) => {
        const token = s.colorTokenId ? t.colors.find((c) => c.id === s.colorTokenId) : null;
        return token ? `{color.${colorKey(token)}}` : dtcgColor(s.hex);
      };
      doc.gradient[stripPrefix(g.name, 'gradient')] = {
        $type: 'gradient',
        $value: dtcgGradient(g, ref),
        $extensions: {
          'com.webstyle': { type: g.type, direction: g.direction, repeating: g.repeating },
        },
      };
    }
  }
  if (t.families.length) {
    doc.font = {};
    for (const f of t.families) {
      doc.font[f.name] = { $type: 'fontFamily', $value: [...f.stack] };
      if (f.webFont)
        doc.font[f.name].$extensions = {
          'com.webstyle': { provider: f.webFont.provider, weights: f.webFont.weights },
        };
    }
  }
  if (t.sizes.length) {
    doc.text = {};
    doc['line-height'] = {};
    doc['font-weight'] = {};
    for (const s of t.sizes) {
      doc.text[s.name] = { $type: 'dimension', $value: dimension(s.sizePx) };
      if (s.lineHeightPx !== null)
        doc['line-height'][s.name] = { $type: 'dimension', $value: dimension(s.lineHeightPx) };
      doc['font-weight'][s.name] = { $type: 'fontWeight', $value: s.fontWeight };
    }
    if (Object.keys(doc['line-height']).length === 0) delete doc['line-height'];
  }
  if (t.textStyles.length) {
    doc.typography = {};
    for (const s of t.textStyles) {
      const family = d.typography.families.find((f) => f.id === s.familyId && !f.excluded);
      doc.typography[s.name] = {
        $type: 'typography',
        $value: {
          fontFamily: family ? `{font.${family.name}}` : s.family,
          fontSize: dimension(s.sizePx),
          fontWeight: s.fontWeight,
          letterSpacing: dimension(s.letterSpacingEm * s.sizePx),
          lineHeight: s.lineHeightPx === null ? 1.2 : round3(s.lineHeightPx / s.sizePx),
        },
        $extensions: { 'com.webstyle': { textTransform: s.textTransform, usedFor: s.usedFor } },
      };
    }
  }
  if (t.letterSpacings.length) {
    // DTCG dimensions allow px and rem only, so em letter spacing is a number with its unit noted.
    doc.tracking = {};
    for (const l of t.letterSpacings) {
      doc.tracking[stripPrefix(l.name, 'tracking')] = {
        $type: 'number',
        $value: l.em,
        $extensions: { 'com.webstyle': { unit: 'em' } },
      };
    }
  }
  const dims = (group, list, prefix, px = (x) => x.px) => {
    if (!list.length) return;
    doc[group] = {};
    for (const x of list)
      doc[group][stripPrefix(x.name, prefix)] = { $type: 'dimension', $value: dimension(px(x)) };
  };
  dims('space', t.spacing, 'space');
  dims('container', t.containers, 'container');
  dims(
    'gap',
    t.gaps.filter((g) => !g.spaceId),
    'gap',
  );
  dims('radius', t.radii, 'radius');
  dims('border-width', t.borderWidths, 'border');
  dims('breakpoint', t.breakpoints, '');
  const shadows = t.shadows.map((s) => [s, dtcgShadow(s.value)]).filter(([, v]) => v !== null);
  if (shadows.length) {
    doc.shadow = {};
    for (const [s, value] of shadows)
      doc.shadow[stripPrefix(s.name, 'shadow')] = { $type: 'shadow', $value: value };
  }
  const numbers = (group, list, prefix) => {
    if (!list.length) return;
    doc[group] = {};
    for (const x of list)
      doc[group][stripPrefix(x.name, prefix)] = { $type: 'number', $value: x.value };
  };
  numbers('opacity', t.opacities, 'opacity');
  numbers('z-index', t.zIndex, 'z');
  if (t.gridColumns.length) numbers('grid-columns', t.gridColumns, 'grid');
  if (t.durations.length) {
    doc.duration = {};
    for (const x of t.durations)
      doc.duration[stripPrefix(x.name, 'duration')] = {
        $type: 'duration',
        $value: { value: x.ms, unit: 'ms' },
      };
  }
  const curves = t.easings.filter((e) => e.bezier);
  if (curves.length) {
    doc.easing = {};
    for (const e of curves)
      doc.easing[e.name === 'ease' ? 'default' : stripPrefix(e.name, 'ease')] = {
        $type: 'cubicBezier',
        $value: e.bezier,
      };
  }
  const recipes = (d.components ?? []).filter((r) => !r.excluded);
  if (recipes.length || d.focusRing) {
    doc.$extensions = {
      'com.webstyle': {
        recipes: Object.fromEntries(
          recipes.map((r) => [
            r.id,
            { name: r.name, kind: r.kind, variant: r.variant, byMode: plainRecipe(r.byMode) },
          ]),
        ),
        focusRing: d.focusRing ?? null,
      },
    };
  }
  const light = `${JSON.stringify(doc, null, 2)}\n`;
  let dark = null;
  if (other) {
    const darkDoc = {
      $description: `${generatedBy(d, version)}. Dark theme semantic tokens: load together with tokens.json.`,
      semantic: semanticGroup(other),
    };
    dark = `${JSON.stringify(darkDoc, null, 2)}\n`;
  }
  return { light, dark };
}

function plainRecipe(byMode) {
  const out = {};
  for (const [mode, states] of Object.entries(byMode)) {
    out[mode] = {};
    for (const [state, styles] of Object.entries(states)) {
      out[mode][state] = Object.fromEntries(
        Object.entries(styles).map(([k, v]) => [k, typeof v === 'object' && v ? `{${v.ref}}` : v]),
      );
    }
  }
  return out;
}

export function exportDtcg(design, version, ctx = {}) {
  return exportDtcgFiles(design, version, ctx).light;
}
