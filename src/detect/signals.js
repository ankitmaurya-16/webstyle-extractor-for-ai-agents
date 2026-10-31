// Turns raw page observations (class names, variable names, attributes, layers, fonts and SVG
// attributes) into SignalHits. Runs in the page as part of the extractor, so it stays small and
// has no dependencies. Scoring happens later in framework.js and icons.js.

/** @typedef {{id: string, evidence: string, count: number}} SignalHit */

const TW_COLORS =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|primary|secondary|muted|accent|foreground|background';
const TAILWIND_UTILITY = new RegExp(
  [
    '^(?:sm|md|lg|xl|2xl|hover|focus|focus-visible|active|disabled|dark|group-hover|data-\\[[^\\]]+\\]):',
    '^-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|left|right|bottom)-(?:\\d+(?:\\.5)?|px|auto|full)$',
    '^text-(?:xs|sm|base|lg|[2-9]?xl)$',
    `^(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder)-(?:${TW_COLORS})(?:-\\d{2,3})?(?:\\/\\d+)?$`,
    '\\[[^\\]]+\\]$',
    '^(?:flex|grid|inline-flex|items-center|items-start|justify-between|justify-center|shrink-0|grow|truncate|sr-only|antialiased)$',
    '^(?:rounded|shadow|font|leading|tracking|w|h|min-w|max-w|min-h|max-h|size|z|opacity|duration|ease|grid-cols|col-span)-[\\w./]+$',
  ].join('|'),
);

/**
 * @param {{classCounts: Map<string, number>, varNames: string[], dataSlots: number,
 *   layerNames: string[], themeOklch: boolean}} input
 * @returns {SignalHit[]}
 */
export function frameworkSignals({ classCounts, varNames, dataSlots, layerNames, themeOklch }) {
  const hits = [];
  const add = (id, evidence, count) => count > 0 && hits.push({ id, evidence, count });
  const classes = [...classCounts.keys()];
  const total = classes.length;
  const countClasses = (test) => classes.filter(test).length;
  const countVars = (test) => varNames.filter(test).length;
  const varSet = new Set(varNames);

  add('meta:classes', 'unique class names sampled', total);

  // Tailwind
  add(
    'tailwind:variables',
    '--tw- variables',
    countVars((n) => n.startsWith('--tw-')),
  );
  const utilities = countClasses((c) => TAILWIND_UTILITY.test(c));
  add('tailwind:classes', `${utilities} of ${total} class names are utility classes`, utilities);
  add(
    'tailwind:v4',
    'theme variables use oklch() or an @layer theme exists',
    themeOklch || layerNames.includes('theme') ? 1 : 0,
  );

  // Bootstrap
  add(
    'bootstrap:variables',
    '--bs- variables',
    countVars((n) => n.startsWith('--bs-')),
  );
  add(
    'bootstrap:classes',
    'btn, btn-primary, container, row, col-*, d-flex classes',
    countClasses((c) =>
      /^(?:btn|btn-primary|btn-secondary|container|row|d-flex|navbar|card-body)$|^col(?:-\w+)?(?:-\d+)?$/.test(
        c,
      ),
    ),
  );

  // MUI
  add(
    'mui:classes',
    'classes starting with Mui',
    countClasses((c) => /^Mui[A-Z]/.test(c)),
  );
  add(
    'mui:variables',
    '--mui- variables',
    countVars((n) => n.startsWith('--mui-')),
  );

  // Chakra
  add(
    'chakra:variables',
    '--chakra- variables',
    countVars((n) => n.startsWith('--chakra-')),
  );
  add(
    'chakra:classes',
    'chakra- classes',
    countClasses((c) => c.startsWith('chakra-')),
  );

  // shadcn/ui
  const shadcnVars = ['--background', '--foreground', '--primary-foreground', '--ring', '--radius'];
  add(
    'shadcn:variables',
    shadcnVars.join(', '),
    shadcnVars.every((v) => varSet.has(v)) ? shadcnVars.length : 0,
  );
  add('shadcn:attributes', 'data-slot attributes', dataSlots);
  add('shadcn:oklch', 'theme variables use oklch()', themeOklch ? 1 : 0);

  // Radix Themes
  add('radix-themes:classes', '.radix-themes class', classCounts.get('radix-themes') ?? 0);
  add(
    'radix-themes:variables',
    '--accent-1 to --accent-12 variables',
    Array.from({ length: 12 }, (_, i) => `--accent-${i + 1}`).every((v) => varSet.has(v)) ? 12 : 0,
  );

  // Ant Design
  add(
    'antd:classes',
    'ant- classes',
    countClasses((c) => c.startsWith('ant-')),
  );
  add(
    'antd:variables',
    '--ant- variables',
    countVars((n) => n.startsWith('--ant-')),
  );

  // Bulma
  add(
    'bulma:classes',
    'button with is-primary, columns and column classes',
    (classCounts.has('is-primary') && classCounts.has('button') ? 1 : 0) +
      (classCounts.has('columns') && classCounts.has('column') ? 1 : 0),
  );
  add(
    'bulma:variables',
    '--bulma- variables',
    countVars((n) => n.startsWith('--bulma-')),
  );

  // Layers count as their own signal type for any framework that declares them.
  add('meta:layers', `@layer ${layerNames.join(', ')}`, layerNames.length);
  return hits;
}

/**
 * @param {{classCounts: Map<string, number>, fontFamilies: string[], svg: {lucide: number,
 *   heroicons: number, fontawesome: number}}} input
 * @returns {SignalHit[]}
 */
export function iconSignals({ classCounts, fontFamilies, svg }) {
  const hits = [];
  const add = (id, evidence, count) => count > 0 && hits.push({ id, evidence, count });
  const sum = (test) => [...classCounts].filter(([c]) => test(c)).reduce((n, [, k]) => n + k, 0);
  const font = (test) => fontFamilies.filter(test).length;

  add('lucide:svg', 'svg.lucide elements', svg.lucide);
  add(
    'lucide:classes',
    'lucide- classes',
    sum((c) => c.startsWith('lucide-')),
  );
  add('heroicons:svg', 'SVGs with data-slot="icon", 24 x 24 viewBox and stroke 1.5', svg.heroicons);
  add('fontawesome:svg', 'svg.svg-inline--fa elements', svg.fontawesome);
  add(
    'fontawesome:classes',
    'fa- classes',
    sum((c) => /^fa-[\w-]+$/.test(c) || c === 'fa' || /^fa[srlbdt]$/.test(c)),
  );
  add(
    'fontawesome:font',
    'Font Awesome font family',
    font((f) => /font awesome/i.test(f)),
  );
  add(
    'material:font',
    'Material Symbols or Material Icons font',
    font((f) => /material (symbols|icons)/i.test(f)),
  );
  add(
    'material:classes',
    'material-symbols or material-icons classes',
    sum((c) => /^material-(symbols|icons)/.test(c)),
  );
  add(
    'bootstrap-icons:classes',
    'bi- classes',
    sum((c) => /^bi-[\w-]+$/.test(c)),
  );
  add(
    'bootstrap-icons:font',
    'bootstrap-icons font',
    font((f) => /bootstrap-icons/i.test(f)),
  );
  add(
    'phosphor:classes',
    'ph and ph- classes',
    sum((c) => c === 'ph' || /^ph-[\w-]+$/.test(c)),
  );
  add(
    'tabler:classes',
    'tabler-icon classes',
    sum((c) => c.startsWith('tabler-icon')),
  );
  add(
    'remix:classes',
    'ri- classes',
    sum((c) => /^ri-[\w-]+$/.test(c)),
  );
  return hits;
}
