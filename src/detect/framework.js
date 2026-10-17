// Framework detection (F11): scores SignalHits into detections with confidence. Pure.

export const FRAMEWORKS = [
  ['tailwind', 'Tailwind CSS'],
  ['bootstrap', 'Bootstrap'],
  ['mui', 'MUI'],
  ['chakra', 'Chakra UI'],
  ['shadcn', 'shadcn/ui'],
  ['radix-themes', 'Radix Themes'],
  ['antd', 'Ant Design'],
  ['bulma', 'Bulma'],
];

const SIGNAL_TYPES = ['variables', 'classes', 'attributes', 'layers'];

/** Sums hits with the same id (pages merged, frames merged). */
export function sumSignals(hits) {
  const map = new Map();
  for (const h of hits) {
    const e = map.get(h.id);
    if (e) e.count += h.count;
    else map.set(h.id, { ...h });
  }
  return map;
}

/**
 * @param {Array<{id: string, evidence: string, count: number}>} hits
 * @returns {Array<{id: string, name: string, version: string|null, confidence: {level: string, score: number, reasons: string[]}, evidence: string[]}>}
 */
export function detectFrameworks(hits) {
  const map = sumSignals(hits);
  const get = (id) => map.get(id)?.count ?? 0;
  const ev = (id) => (map.has(id) ? `${map.get(id).evidence} (${map.get(id).count})` : null);
  const totalClasses = get('meta:classes');
  const out = [];

  for (const [id, name] of FRAMEWORKS) {
    const types = new Set();
    let strong = false;
    const evidence = [];
    for (const type of SIGNAL_TYPES) {
      const hitId = `${id}:${type}`;
      const n = get(hitId);
      if (n <= 0) continue;
      let counts = true;
      if (id === 'tailwind' && type === 'classes') {
        // At least 30% of class tokens must look like utilities.
        counts = totalClasses > 0 && n / totalClasses >= 0.3;
        if (counts) strong = true;
      } else if (type === 'variables') {
        counts = n >= (id === 'shadcn' || id === 'radix-themes' ? 1 : 2);
        if (counts) strong = true;
      } else if (type === 'classes') {
        counts = n >= 2;
        if (counts && n >= 5) strong = true;
      } else if (type === 'attributes') {
        counts = n >= 2;
      }
      if (counts) {
        types.add(type);
        evidence.push(ev(hitId));
      }
    }
    if (types.size === 0) continue;
    if (get('meta:layers') > 0 && (id === 'tailwind' || id === 'shadcn')) {
      types.add('layers');
      evidence.push(ev('meta:layers'));
    }
    const level = types.size >= 2 ? 'high' : strong ? 'medium' : 'low';
    out.push({
      id,
      name,
      version: versionOf(id, get),
      confidence: { level, score: level === 'high' ? 0.9 : level === 'medium' ? 0.6 : 0.3, reasons: evidence },
      evidence,
    });
  }
  return out;
}

function versionOf(id, get) {
  if (id === 'tailwind') return get('tailwind:v4') > 0 ? 'v4' : 'v3';
  if (id === 'bootstrap') return get('bootstrap:variables') > 0 ? 'v5' : null;
  if (id === 'shadcn') return get('shadcn:oklch') > 0 ? 'Tailwind v4 style' : null;
  return null;
}
