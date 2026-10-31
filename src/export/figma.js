// Figma variables (F35). Figma's native import reads DTCG files, one file per mode, with colors
// in the 2025.10 object form, px dimensions and single-string font families; aliases into
// another collection use com.figma.aliasData with the resolved value kept (checked in M15 and
// recorded in the PR). So this format is three files: Primitives (mode "Value") and Semantic
// Light and Semantic Dark.

import { converter, parse } from 'culori';
import { stripPrefix } from '../model/design.js';
import { collectTokens, generatedBy, prepare } from './common.js';

const toRgb = converter('rgb');
const round3 = (n) => Math.round(n * 1000) / 1000;

function color(hex) {
  const rgb = toRgb(parse(hex.slice(0, 7)));
  const value = {
    colorSpace: 'srgb',
    components: [round3(rgb.r), round3(rgb.g), round3(rgb.b)],
    alpha: 1,
    hex: hex.slice(0, 7),
  };
  if (hex.length === 9) value.alpha = round3(parseInt(hex.slice(7, 9), 16) / 255);
  return value;
}
const px = (n) => ({ value: Math.round(n * 100) / 100, unit: 'px' });

/** Slash-group path segments for a color name: gray-900 becomes gray/900, black/10 black/a10. */
function colorPath(name) {
  const m = /^([a-z]+)-(\d{3})(\/(\d+))?$/.exec(name);
  if (m) return m[4] ? [m[1], m[2], `a${m[4]}`] : [m[1], m[2]];
  return name.split('/').map((p, i) => (i > 0 ? `a${p}` : p));
}

const SEMANTIC_KEYS = {
  text: ['text', 'default'],
  'text-muted': ['text', 'muted'],
  'focus-ring': ['focus', 'ring'],
};

function set(obj, path, value) {
  let node = obj;
  for (const key of path.slice(0, -1)) node = node[key] ??= {};
  node[path.at(-1)] = value;
}

/** @returns {{primitives: string, light: string|null, dark: string|null}} */
export function exportFigmaFiles(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const primitives = {
    $description: `${generatedBy(d, version)}. Figma collection "Primitives", mode "Value".`,
  };
  for (const c of t.colors)
    set(primitives, ['color', ...colorPath(c.name)], { $type: 'color', $value: color(c.hex) });
  for (const s of t.spacing)
    set(primitives, ['space', stripPrefix(s.name, 'space')], {
      $type: 'dimension',
      $value: px(s.px),
    });
  for (const r of t.radii)
    set(primitives, ['radius', stripPrefix(r.name, 'radius')], {
      $type: 'dimension',
      $value: px(r.px),
    });
  for (const b of t.borderWidths)
    set(primitives, ['border', stripPrefix(b.name, 'border')], {
      $type: 'dimension',
      $value: px(b.px),
    });
  for (const s of t.sizes)
    set(primitives, ['text', s.name], { $type: 'dimension', $value: px(s.sizePx) });
  for (const f of t.families)
    set(primitives, ['font', f.name], { $type: 'fontFamily', $value: f.stack[0] });

  const semantic = (mode) => {
    const pairs = t.semanticByMode[mode] ?? [];
    if (pairs.length === 0) return null;
    const doc = {
      $description: `${generatedBy(d, version)}. Figma collection "Semantic", mode "${mode === 'dark' ? 'Dark' : 'Light'}".`,
    };
    for (const [role, c] of pairs) {
      const target = ['color', ...colorPath(c.name)].join('/');
      // `text` is a group because of text/muted; a DTCG token cannot also hold child tokens.
      const key = SEMANTIC_KEYS[role] ?? [role];
      set(doc, key, {
        $type: 'color',
        $value: color(c.hex),
        $extensions: {
          'com.figma.aliasData': {
            targetVariableName: target,
            targetVariableSetName: 'Primitives',
          },
        },
      });
    }
    return `${JSON.stringify(doc, null, 2)}\n`;
  };
  const modes = t.modes;
  return {
    primitives: `${JSON.stringify(primitives, null, 2)}\n`,
    light: modes.includes('light') ? semantic('light') : semantic(t.primaryMode),
    // A site without dark mode gets the Light mode only (AC-F35.2).
    dark: modes.includes('dark') && modes.includes('light') ? semantic('dark') : null,
  };
}

export const FIGMA_HELP =
  "Figma: open Variables, drag Primitives.tokens.json into a new collection named Primitives, then the Semantic files into a collection named Semantic (one file per mode). Uses Figma's native DTCG import.";
