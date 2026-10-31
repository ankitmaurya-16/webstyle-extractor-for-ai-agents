// Custom-property naming rules shared by analysis and the UI (F10).

/** Framework-internal prefixes that never name tokens (AC-F10.4). */
export const EXCLUDED_PREFIXES = ['--tw-', '--un-'];

export const isExcludedVariable = (name) => EXCLUDED_PREFIXES.some((p) => name.startsWith(p));

/** Category prefixes stripped from derived names, longest first (AC-F10.6). */
export const CATEGORY_PREFIXES = [
  'wp--preset--color--',
  'colors-',
  'color-',
  'clr-',
  'spacing-',
  'space-',
  'size-',
  'radius-',
  'radii-',
  'rounded-',
  'shadow-',
  'font-',
  'ff-',
  'fs-',
  'text-',
  'duration-',
  'easing-',
  'ease-',
  'zindex-',
  'z-',
  'breakpoint-',
  'bp-',
  'screen-',
  'gradient-',
];

/**
 * Words that only say "first", "second" or "default" within a category. After stripping a prefix
 * they would leave a name like `primary` for --text-primary, a gray that has nothing to do with
 * the primary role, so the prefix stays.
 */
const RANK_WORDS =
  /^(primary|secondary|tertiary|quaternary|default|base|main|muted|subtle|strong|inverse|disabled)$/;

/** Derived token name: strip `--` and one known category prefix, then kebab-case. */
export function deriveName(variable) {
  let name = variable.replace(/^--/, '');
  for (const prefix of CATEGORY_PREFIXES) {
    if (name.toLowerCase().startsWith(prefix) && name.length > prefix.length) {
      const rest = name.slice(prefix.length);
      // --space-4 stays space-4: a bare "4" would need an n prefix and lose its meaning.
      const colorPrefix = /^(wp--preset--color--|colors?-|clr-)$/.test(prefix);
      if (!/^\d/.test(rest) && (colorPrefix || !RANK_WORDS.test(kebab(rest)))) name = rest;
      break;
    }
  }
  return kebab(name);
}

export function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .replace(/^(\d)/, 'n$1');
}

const ROLE_WORDS = [
  ['background', ['background', 'bg', 'page']],
  ['surface', ['surface', 'card', 'panel', 'elevated', 'popover']],
  ['text', ['foreground', 'fg', 'text', 'body']],
  ['text-muted', ['muted', 'subtle', 'secondary-text', 'text-secondary']],
  ['border', ['border', 'divider', 'stroke', 'outline']],
  ['primary', ['primary', 'brand']],
  ['accent', ['accent']],
  ['focus-ring', ['ring', 'focus']],
  ['danger', ['destructive', 'danger', 'error', 'negative']],
  ['success', ['success', 'positive']],
  ['warning', ['warning', 'caution']],
  ['overlay', ['overlay', 'backdrop', 'scrim']],
];

/**
 * The semantic role a variable name signals, or null (AC-F10.8). Paired foregrounds such as
 * --primary-foreground describe text on another role and signal nothing, except the muted one.
 * @param {string} variable
 */
export function roleFromName(variable) {
  const words = variable
    .replace(/^--/, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const joined = words.join('-');
  if (words.length === 0) return null;
  // A leading category word decides the family first: text-primary is a text color, bg-primary
  // a fill, and border-subtle a border rather than muted text.
  const head = words[0];
  if (head === 'text' || head === 'fg' || head === 'foreground') {
    if (words.length > 1 && /muted|subtle|secondary/.test(words[1])) return 'text-muted';
    return words.length === 1 || /primary|default|base|body|main/.test(words[1]) ? 'text' : null;
  }
  if (head === 'bg' || head === 'background') {
    if (words.length === 1 || /primary|default|base|page|body|main/.test(words[1]))
      return 'background';
    if (/secondary|subtle|muted|surface|elevated|raised|card/.test(words[1])) return 'surface';
    return null;
  }
  if (head === 'border' || head === 'divider') return words.length <= 2 ? 'border' : null;
  if (/(^|-)muted(-|$)|(^|-)subtle(-|$)|secondary-text/.test(joined)) return 'text-muted';
  const isForeground = words.some((w) => w === 'foreground' || w === 'fg');
  if (isForeground && words.length > 1) return null;
  if (words.includes('color') && words.length === 1) return null;
  // "primary" names the brand only on its own or after a color prefix (--primary,
  // --color-primary, --brand-primary). After another category word it is a rank:
  // --fill-primary and --label-primary are the first fill and label, not the brand color.
  const COLOR_HEADS = ['color', 'colors', 'clr', 'c', 'theme', 'brand', 'palette', 'sys', 'md'];
  // A short namespace such as --sd- or --ui- before "primary" is not a category word.
  const brandPosition = (w, i) =>
    w === 'brand' ||
    i === 0 ||
    COLOR_HEADS.includes(words[i - 1]) ||
    (i === 1 && words[0].length <= 3);
  for (const [role, list] of ROLE_WORDS) {
    const hit = words.findIndex((w) => list.includes(w));
    if (hit < 0) continue;
    if (role === 'primary' && !brandPosition(words[hit], hit)) continue;
    return role;
  }
  return null;
}
