// Icon library detection (F21). Pure.

import { sumSignals } from './framework.js';

export const ICON_LIBRARIES = [
  ['lucide', 'Lucide'],
  ['heroicons', 'Heroicons'],
  ['fontawesome', 'Font Awesome'],
  ['material', 'Material Symbols / Icons'],
  ['bootstrap-icons', 'Bootstrap Icons'],
  ['phosphor', 'Phosphor'],
  ['tabler', 'Tabler Icons'],
  ['remix', 'Remix Icon'],
];

/** Confidence follows the F11 rule: two signal types high, one strong medium, else low. */
export function detectIcons(hits) {
  const map = sumSignals(hits);
  const out = [];
  for (const [id, name] of ICON_LIBRARIES) {
    const own = [...map.values()].filter((h) => h.id.startsWith(`${id}:`) && h.count > 0);
    if (own.length === 0) continue;
    const types = new Set(own.map((h) => h.id.split(':')[1]));
    const total = own.reduce((n, h) => n + h.count, 0);
    // Heroicons from SVG attributes alone stays low (AC-F21.3).
    const strong = id === 'heroicons' ? false : total >= 3;
    const level = types.size >= 2 ? 'high' : strong ? 'medium' : 'low';
    const evidence = own.map((h) => `${h.evidence} (${h.count})`);
    out.push({
      id,
      name,
      version: null,
      confidence: {
        level,
        score: level === 'high' ? 0.9 : level === 'medium' ? 0.6 : 0.3,
        reasons: evidence,
      },
      evidence,
    });
  }
  return out.sort((a, b) => b.confidence.score - a.confidence.score);
}
