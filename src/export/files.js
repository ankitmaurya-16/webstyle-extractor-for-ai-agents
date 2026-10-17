// File map (v2 spec 9.2): where each format lands in the zip, project writes and the CLI.

export const FILE_MAP = Object.freeze({
  'design-md': ['DESIGN.md'],
  prompt: ['design/prompt.md'],
  dtcg: ['design/tokens.json', 'design/tokens.dark.json'],
  'tailwind-v4': ['design/theme.css'],
  'tailwind-v3': ['design/tailwind.webstyle.js'],
  'css-vars': ['design/variables.css'],
  shadcn: ['design/shadcn-theme.css'],
  styleguide: ['design/styleguide.html'],
  'agents-md': ['AGENTS.md'],
  'cursor-rules': ['.cursor/rules/design-system.mdc'],
  'claude-md': ['CLAUDE.md'],
  figma: ['design/figma/Primitives.tokens.json', 'design/figma/Semantic.Light.tokens.json', 'design/figma/Semantic.Dark.tokens.json'],
  audit: ['design/audit.md'],
});

export const SCREENSHOTS_DIR = 'design/screenshots/';

/** Display names in the Export tab's format picker. */
export const EXPORT_LABELS = Object.freeze({
  'design-md': 'DESIGN.md',
  prompt: 'prompt.md (compact prompt)',
  dtcg: 'tokens.json (DTCG)',
  'tailwind-v4': 'theme.css (Tailwind v4)',
  'tailwind-v3': 'tailwind.webstyle.js (Tailwind v3)',
  'css-vars': 'variables.css',
  shadcn: 'shadcn-theme.css (shadcn/ui)',
  styleguide: 'styleguide.html (style guide)',
  'agents-md': 'AGENTS.md block',
  'cursor-rules': 'Cursor rules (.mdc)',
  'claude-md': 'CLAUDE.md block',
  figma: 'Figma variables',
  audit: 'audit.md (consistency report)',
});

/** The base file name of a path. */
export const baseName = (path) => path.split('/').pop();

/** Screenshot path for a recipe: design/screenshots/<kind>-<variant>[-dark].png (F36). */
export const screenshotPath = (recipe, mode) =>
  `${SCREENSHOTS_DIR}${recipe.kind}-${recipe.variant}${mode === 'dark' ? '-dark' : ''}.png`;

/**
 * Validates a project file-map path: relative, no `..`, no leading slash (AC-F37.2).
 * @param {string} path
 */
export function isValidRelativePath(path) {
  const p = String(path ?? '').trim();
  if (!p || p.startsWith('/') || p.startsWith('\\') || /^[a-z]:/i.test(p)) return false;
  return !p.split(/[\\/]/).some((part) => part === '..' || part === '');
}
