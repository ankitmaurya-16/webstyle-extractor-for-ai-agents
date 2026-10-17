// Shared constants and JSDoc shapes for the whole extension. The shapes are documented in
// docs/data-model.md; this file is the single source of the ordered enums.

/** @typedef {string} Hex lowercase '#rrggbb' or '#rrggbbaa' */
/** @typedef {100|200|300|400|500|600|700|800|900} Step */
/** @typedef {'gray'|'red'|'orange'|'yellow'|'green'|'teal'|'blue'|'indigo'|'purple'|'pink'} HueFamily */
/** @typedef {'background'|'surface'|'text'|'text-muted'|'border'|'primary'|'accent'|'success'|'warning'|'danger'} SemanticRole */
/** @typedef {'text'|'background'|'border'|'interactive'} UsageContext */
/** @typedef {'design-md'|'dtcg'|'tailwind-v4'|'tailwind-v3'|'css-vars'} ExportFormat */

/**
 * @typedef {object} ValueStat
 * @property {string} value computed CSS value, px for lengths
 * @property {number} count elements using it
 * @property {number} weight visible area (fills) or character count (text)
 * @property {UsageContext[]} contexts
 */

/**
 * @typedef {object} ComponentSample
 * @property {'button'|'input'|'link'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'} kind
 * @property {Record<string, string>} styles keyed by RecipeProperty
 * @property {number} count
 */

/**
 * @typedef {object} RawSnapshot
 * @property {string} url
 * @property {string} title
 * @property {number} capturedAt
 * @property {{width: number, height: number}} viewport
 * @property {number} rootFontSizePx
 * @property {'light'|'dark'} colorScheme
 * @property {number} elementsSampled
 * @property {boolean} truncated
 * @property {ValueStat[]} colors
 * @property {ValueStat[]} fontFamilies
 * @property {ValueStat[]} fontSizes
 * @property {ValueStat[]} fontWeights
 * @property {ValueStat[]} lineHeights
 * @property {ValueStat[]} spacing
 * @property {ValueStat[]} radii
 * @property {ValueStat[]} shadows
 * @property {Record<string, string>} cssVariables
 * @property {number[]} breakpoints
 * @property {{readable: number, unreadable: number}} stylesheets
 * @property {ComponentSample[]} samples
 */

/**
 * @typedef {object} ColorToken
 * @property {string} id
 * @property {string} name
 * @property {Hex} hex
 * @property {{l: number, c: number, h: number|null}} oklch
 * @property {HueFamily|'white'|'black'} family
 * @property {Step|null} step
 * @property {SemanticRole[]} roles
 * @property {number} usageShare
 * @property {UsageContext[]} contexts
 * @property {Hex[]} mergedFrom
 * @property {boolean} excluded
 */

/**
 * @typedef {object} DesignSystem
 * @property {{sourceUrl: string, hostname: string, capturedAt: number, colorScheme: 'light'|'dark',
 *   partial: Array<'breakpoints'|'cssVariables'>, truncated: boolean}} meta
 * @property {ColorToken[]} colors
 * @property {{families: object[], sizes: object[]}} typography
 * @property {{baseUnitPx: 4|8|null, tokens: object[]}} spacing
 * @property {object[]} radii
 * @property {object[]} shadows
 * @property {object[]} breakpoints
 * @property {object[]} components
 */

/** @type {SemanticRole[]} */
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
];

/** Hue order used by every exporter: gray first, then the families by hue. */
/** @type {HueFamily[]} */
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

/** @type {Step[]} */
export const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const RECIPE_PROPERTIES = [
  'background-color',
  'color',
  'border',
  'border-radius',
  'padding',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'box-shadow',
];

/** @type {ExportFormat[]} */
export const EXPORT_FORMATS = ['design-md', 'dtcg', 'tailwind-v4', 'tailwind-v3', 'css-vars'];

export const SCHEMA_VERSION = 1;
