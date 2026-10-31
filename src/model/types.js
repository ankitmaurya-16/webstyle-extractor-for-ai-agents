// Shared constants for the whole extension. Shapes are documented in docs/data-model.md and
// docs/v2-spec.md section 6 (TypeScript notation there; the code is JavaScript).

/** @type {Array<'background'|'surface'|'text'|'text-muted'|'border'|'primary'|'accent'|'success'|'warning'|'danger'|'focus-ring'|'overlay'>} */
export const SEMANTIC_ROLES = [
  'background',
  'surface',
  'text',
  'text-muted',
  'border',
  'primary',
  'accent',
  'success',
  'warning',
  'danger',
  'focus-ring',
  'overlay',
];

export const THEME_MODES = ['light', 'dark'];
export const INTERACTION_STATES = ['default', 'hover', 'focus', 'focus-visible', 'active'];

/** Hue order used by every exporter: gray first, then the families by hue. */
export const HUE_FAMILIES = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
];
export const FAMILY_ORDER = ['white', 'black', ...HUE_FAMILIES];

export const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const COMPONENT_KINDS = [
  'button',
  'input',
  'link',
  'heading',
  'card',
  'badge',
  'navbar',
  'tabs',
  'alert',
  'table',
];

export const RECIPE_PROPERTIES = [
  'background-color',
  'background-image',
  'color',
  'border',
  'border-width',
  'border-radius',
  'padding',
  'gap',
  'height',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  'box-shadow',
  'outline',
  'outline-offset',
  'opacity',
  'transition',
];

/** Every export format, in the order the Export tab lists them. */
export const EXPORT_FORMATS = [
  'design-md',
  'prompt',
  'dtcg',
  'tailwind-v4',
  'tailwind-v3',
  'css-vars',
  'shadcn',
  'styleguide',
  'agents-md',
  'cursor-rules',
  'claude-md',
  'figma',
  'audit',
];

/** Formats included in the zip and project writes unless the user changes the selection. */
export const DEFAULT_EXPORT_SELECTION = [
  'design-md',
  'prompt',
  'dtcg',
  'tailwind-v4',
  'css-vars',
  'shadcn',
  'agents-md',
  'cursor-rules',
  'claude-md',
];

/** Token categories as used in ids and token references. */
export const CATEGORIES = [
  'color',
  'gradient',
  'font',
  'text',
  'textStyle',
  'tracking',
  'space',
  'container',
  'grid',
  'gap',
  'radius',
  'border',
  'shadow',
  'opacity',
  'z',
  'duration',
  'easing',
  'breakpoint',
];

export const SCHEMA_VERSION = 2;
