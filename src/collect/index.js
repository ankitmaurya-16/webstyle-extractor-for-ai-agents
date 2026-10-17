// Page-side collector, bundled into the extractor. It only reads: computed styles, tag names,
// roles and text lengths. It never writes to the page and never reads form values or page text.

import {
  SampleMap,
  StatMap,
  isTransparent,
  parseMediaBreakpoints,
  rgbLuminance,
} from './aggregate.js';

/** @typedef {{elementCap: number, sliceSize: number, timeBudgetMs: number, scrollScreens: number}} CollectLimits */

/** @type {CollectLimits} */
export const DEFAULT_LIMITS = Object.freeze({
  elementCap: 4000,
  sliceSize: 200,
  timeBudgetMs: 1500,
  scrollScreens: 3,
});

// Yield well before the 50 ms long-task line even when a slice is slow.
const SLICE_TIME_MS = 25;
const MAX_CSS_VARIABLES = 400;

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'HEAD',
  'META',
  'LINK',
  'TITLE',
  'NOSCRIPT',
  'TEMPLATE',
  'BR',
  'WBR',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SOURCE',
  'TRACK',
  'PARAM',
  'CANVAS',
]);
const TEXT_INPUT_TYPES = new Set([
  'text',
  'email',
  'search',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  '',
]);
const SIDES = ['top', 'right', 'bottom', 'left'];
const SPACING_PROPS = [
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'row-gap',
  'column-gap',
];
const CORNERS = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
];

/**
 * @param {CollectLimits} [limits]
 * @returns {Promise<import('../model/types.js').RawSnapshot>}
 */
export async function collect(limits = DEFAULT_LIMITS) {
  const started = performance.now();
  const doc = document;
  const win = window;
  const viewport = { width: win.innerWidth, height: win.innerHeight };
  const maxTop = win.scrollY + viewport.height * (1 + limits.scrollScreens);
  const rootStyle = getComputedStyle(doc.documentElement);
  const rootFontSizePx = parseFloat(rootStyle.fontSize) || 16;

  // Colors are kept per context because text weight (characters) and fill weight (pixels) are
  // not comparable; analysis normalizes each context separately.
  const stats = {
    textColors: new StatMap(),
    backgroundColors: new StatMap(),
    borderColors: new StatMap(),
    fontFamilies: new StatMap(),
    fontSizes: new StatMap(),
    fontWeights: new StatMap(),
    lineHeights: new StatMap(),
    textStyles: new StatMap(),
    spacing: new StatMap(),
    radii: new StatMap(),
    shadows: new StatMap(),
  };
  const samples = new SampleMap();

  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
      // SVG internals are drawing primitives, not design tokens.
      if (
        node.namespaceURI === 'http://www.w3.org/2000/svg' &&
        node.tagName.toLowerCase() !== 'svg'
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let sampled = 0;
  let truncated = false;
  let node = walker.currentNode;
  let sliceCount = 0;
  let sliceStart = performance.now();

  while (node) {
    if (sampled >= limits.elementCap || performance.now() - started > limits.timeBudgetMs) {
      truncated = true;
      break;
    }
    const element = /** @type {Element} */ (node);
    const style = getComputedStyle(element);
    if (style.display === 'none') {
      node = nextSkippingChildren(walker);
      continue;
    }
    const rect = element.getBoundingClientRect();
    const top = rect.top + win.scrollY;
    if (
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      top <= maxTop
    ) {
      readElement(element, style, rect, stats, samples);
      sampled += 1;
    }

    node = walker.nextNode();
    sliceCount += 1;
    if (sliceCount >= limits.sliceSize || performance.now() - sliceStart > SLICE_TIME_MS) {
      await yieldToPage();
      sliceCount = 0;
      sliceStart = performance.now();
    }
  }

  const sheets = readStylesheets(doc, rootStyle);

  return {
    url: location.href,
    title: doc.title,
    capturedAt: Date.now(),
    viewport,
    rootFontSizePx,
    colorScheme: detectColorScheme(doc),
    elementsSampled: sampled,
    truncated,
    colors: [
      ...stats.backgroundColors.toStats(),
      ...stats.textColors.toStats(),
      ...stats.borderColors.toStats(),
    ],
    fontFamilies: stats.fontFamilies.toStats(),
    fontSizes: stats.fontSizes.toStats(),
    fontWeights: stats.fontWeights.toStats(),
    lineHeights: stats.lineHeights.toStats(),
    textStyles: stats.textStyles.toStats(),
    spacing: stats.spacing.toStats(),
    radii: stats.radii.toStats(),
    shadows: stats.shadows.toStats(),
    cssVariables: sheets.cssVariables,
    breakpoints: sheets.breakpoints,
    stylesheets: { readable: sheets.readable, unreadable: sheets.unreadable },
    samples: samples.toSamples(),
  };
}

function nextSkippingChildren(walker) {
  const sibling = walker.nextSibling();
  if (sibling) return sibling;
  while (walker.parentNode()) {
    const next = walker.nextSibling();
    if (next) return next;
  }
  return null;
}

function yieldToPage() {
  const scheduler = /** @type {any} */ (globalThis).scheduler;
  if (scheduler && typeof scheduler.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Length of the element's own text, used only as a weight. The text itself is not kept. */
function ownTextLength(element) {
  let length = 0;
  for (const child of element.childNodes) {
    if (child.nodeType === 3) length += child.nodeValue.trim().length;
  }
  return length;
}

function isButton(element) {
  const tag = element.tagName;
  if (tag === 'BUTTON') return true;
  if (tag === 'INPUT') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    return type === 'button' || type === 'submit';
  }
  return element.getAttribute('role') === 'button';
}

function isTextInput(element) {
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return TEXT_INPUT_TYPES.has((element.getAttribute('type') || '').toLowerCase());
}

/** A link inside running text: its parent has text of its own around it. */
function isInlineLink(element, style) {
  if (element.tagName !== 'A' || !element.hasAttribute('href')) return false;
  if (element.getAttribute('role') === 'button') return false;
  if (!isTransparent(style.backgroundColor)) return false; // styled as a button
  const parent = element.parentElement;
  return parent !== null && ownTextLength(parent) > 0;
}

function readElement(element, style, rect, stats, samples) {
  const interactive = isButton(element) || element.tagName === 'A' || element.tagName === 'SELECT';
  const extra = interactive ? ['interactive'] : [];
  const textLength = ownTextLength(element);

  if (textLength > 0) {
    if (!isTransparent(style.color))
      stats.textColors.add(style.color, textLength, ['text', ...extra], true);
    stats.fontFamilies.add(style.fontFamily, textLength, ['text']);
    stats.fontSizes.add(style.fontSize, textLength, ['text']);
    stats.fontWeights.add(style.fontWeight, textLength, ['text']);
    stats.lineHeights.add(style.lineHeight, textLength, ['text']);
    stats.textStyles.add(
      [style.fontSize, style.lineHeight, style.fontWeight, style.fontFamily].join('|'),
      textLength,
      [element.tagName.toLowerCase()],
    );
  }

  if (!isTransparent(style.backgroundColor)) {
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    stats.backgroundColors.add(style.backgroundColor, area, ['background', ...extra], true);
  }

  for (const side of SIDES) {
    const width = parseFloat(style.getPropertyValue(`border-${side}-width`));
    const lineStyle = style.getPropertyValue(`border-${side}-style`);
    const color = style.getPropertyValue(`border-${side}-color`);
    if (width > 0 && lineStyle !== 'none' && lineStyle !== 'hidden' && !isTransparent(color)) {
      const length = side === 'top' || side === 'bottom' ? rect.width : rect.height;
      stats.borderColors.add(color, length * width, ['border']);
    }
  }

  const autoMargins = isAutoCentered(element, style, rect);
  for (const prop of SPACING_PROPS) {
    if (autoMargins && (prop === 'margin-left' || prop === 'margin-right')) continue;
    const value = style.getPropertyValue(prop);
    const px = parseFloat(value);
    if (value.endsWith('px') && px > 0) stats.spacing.add(value, 1);
  }

  const corners = new Set(CORNERS.map((c) => style.getPropertyValue(c)));
  for (const corner of corners) {
    const first = corner.split(' ')[0];
    if (first && parseFloat(first) > 0) stats.radii.add(first, 1);
  }

  if (style.boxShadow && style.boxShadow !== 'none') stats.shadows.add(style.boxShadow, 1);

  const kind = sampleKind(element, style);
  if (kind) samples.add(kind, recipeStyles(style));
}

/**
 * margin: auto resolves to px in computed styles. Equal side margins that exactly fill the
 * parent's free space are centering, not spacing tokens.
 */
function isAutoCentered(element, style, rect) {
  const left = parseFloat(style.marginLeft);
  if (!(left > 0) || style.marginLeft !== style.marginRight) return false;
  const parent = element.parentElement;
  if (!parent) return false;
  const parentRect = parent.getBoundingClientRect();
  const parentStyle = getComputedStyle(parent);
  const inner =
    parentRect.width -
    parseFloat(parentStyle.paddingLeft) -
    parseFloat(parentStyle.paddingRight) -
    parseFloat(parentStyle.borderLeftWidth) -
    parseFloat(parentStyle.borderRightWidth);
  return Math.abs(inner - rect.width - 2 * left) < 1;
}

function sampleKind(element, style) {
  const tag = element.tagName;
  if (/^H[1-6]$/.test(tag)) return tag.toLowerCase();
  if (isButton(element)) return 'button';
  if (isTextInput(element)) return 'input';
  if (isInlineLink(element, style)) return 'link';
  return null;
}

function recipeStyles(style) {
  return {
    'background-color': style.backgroundColor,
    color: style.color,
    border: borderShorthand(style),
    'border-radius': style.borderRadius,
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(
      ' ',
    ),
    'font-family': style.fontFamily,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'line-height': style.lineHeight,
    'box-shadow': style.boxShadow,
  };
}

function borderShorthand(style) {
  const width = parseFloat(style.borderTopWidth);
  if (!(width > 0) || style.borderTopStyle === 'none') return 'none';
  return `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`;
}

function detectColorScheme(doc) {
  for (const element of [doc.body, doc.documentElement]) {
    if (!element) continue;
    const bg = getComputedStyle(element).backgroundColor;
    if (isTransparent(bg)) continue;
    const luminance = rgbLuminance(bg);
    if (luminance !== null) return luminance < 0.2 ? 'dark' : 'light';
  }
  const scheme = getComputedStyle(doc.documentElement).colorScheme;
  return scheme.includes('dark') && !scheme.includes('light') ? 'dark' : 'light';
}

function readStylesheets(doc, rootStyle) {
  let readable = 0;
  let unreadable = 0;
  const breakpointCounts = new Map();
  const variableNames = new Set();

  const visitRules = (rules, depth) => {
    if (depth > 8) return;
    for (const rule of rules) {
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) visitSheet(rule.styleSheet, depth + 1);
      } else if (rule instanceof CSSMediaRule) {
        for (const px of parseMediaBreakpoints(rule.conditionText ?? rule.media.mediaText)) {
          breakpointCounts.set(px, (breakpointCounts.get(px) ?? 0) + 1);
        }
        visitRules(rule.cssRules, depth + 1);
      } else if (rule instanceof CSSStyleRule) {
        if (
          variableNames.size < MAX_CSS_VARIABLES &&
          /(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selectorText)
        ) {
          for (const prop of rule.style) {
            if (prop.startsWith('--')) variableNames.add(prop);
          }
        }
        if (rule.cssRules?.length) visitRules(rule.cssRules, depth + 1);
      } else if (rule.cssRules) {
        visitRules(rule.cssRules, depth + 1);
      }
    }
  };

  const visitSheet = (sheet, depth) => {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      unreadable += 1; // cross-origin stylesheet without CORS
      return;
    }
    readable += 1;
    visitRules(rules, depth);
  };

  for (const sheet of doc.styleSheets) visitSheet(sheet, 0);
  for (const sheet of doc.adoptedStyleSheets ?? []) visitSheet(sheet, 0);

  const cssVariables = {};
  for (const name of [...variableNames].sort()) {
    const value = rootStyle.getPropertyValue(name).trim();
    if (value && value.length <= 200) cssVariables[name] = value;
  }

  const breakpoints = [...breakpointCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([px]) => px);

  return { readable, unreadable, cssVariables, breakpoints };
}
