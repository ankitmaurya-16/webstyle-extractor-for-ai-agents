// Page-side collector, bundled into the extractor. It reads computed styles, tag names, roles,
// class names, ARIA attributes and font metadata, and uses text only as a character count. It
// never writes to the page and never reads form values or page text.

import { SampleMap, StatMap, isTransparent } from './aggregate.js';
import {
  DARK_CANVAS,
  LIGHT_CANVAS,
  canvasColorParser,
  composite,
  luminance,
  parseRgba,
  toHex,
} from './color.js';
import { DARK_SELECTOR, LIGHT_SELECTOR, readStylesheets, resolveVars } from './stylesheets.js';
import { compareSpecificity } from './specificity.js';
import { uniqueSelector } from './selectors.js';
import {
  badgeClassHint,
  componentKind,
  compositeStyles,
  isButton,
  ownTextLength,
  recipeStyles,
  styleSignature,
} from './components.js';
import { autoScroll } from './scroll.js';
import { frameworkSignals, iconSignals } from '../detect/signals.js';

/** @typedef {{elementCap: number, sliceSize: number, timeBudgetMs: number, scrollScreens: number}} CollectLimits */

/** @type {CollectLimits} */
export const DEFAULT_LIMITS = Object.freeze({
  elementCap: 4000,
  sliceSize: 200,
  timeBudgetMs: 1500,
  scrollScreens: 3,
});
export const FRAME_ELEMENT_CAP = 1000;
export const COMPONENT_ELEMENT_CAP = 1500;
const SLICE_TIME_MS = 25;
const MAX_CLASS_TOKENS = 5000;
const MAX_REPRESENTATIVES = 3;
const GRADIENT_WEIGHT = 0.25;

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'TEMPLATE', 'BR', 'WBR',
  'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'SOURCE', 'TRACK', 'PARAM', 'CANVAS',
]);
const SIDES = ['top', 'right', 'bottom', 'left'];
const SPACING_PROPS = [
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
];
const CORNERS = [
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-right-radius', 'border-bottom-left-radius',
];
const STATEFUL_KINDS = new Set(['button', 'link', 'input', 'tabs', 'card', 'navbar']);
const GRADIENT_FN = /(repeating-)?(linear|radial|conic)-gradient\(/i;

/**
 * @typedef {object} CollectOptions
 * @property {CollectLimits} [limits]
 * @property {string|null} [rootSelector] walk only this subtree (F26)
 * @property {boolean} [autoScroll] scroll to load lazy content first (F22)
 * @property {string[]} [sheetTexts] stylesheet texts from deep scan (F23)
 */

/**
 * @param {CollectOptions} [options]
 * @returns {Promise<object|null>} RawSnapshotV2, or null for a frame too small to read
 */
export async function collect(options = {}) {
  const win = window;
  const doc = document;
  const inFrame = win.top !== win;
  if (inFrame && (win.innerWidth < 100 || win.innerHeight < 100)) return null;

  let autoScrolled = false;
  if (options.autoScroll && !inFrame) autoScrolled = await autoScroll(win);

  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  if (inFrame) limits.elementCap = Math.min(limits.elementCap, FRAME_ELEMENT_CAP);
  let root = doc.documentElement;
  if (options.rootSelector) {
    root = doc.querySelector(options.rootSelector);
    if (!root) throw new Error('Picked element is gone');
    limits.elementCap = Math.min(limits.elementCap, COMPONENT_ELEMENT_CAP);
  }

  const started = performance.now();
  const viewport = { width: win.innerWidth, height: win.innerHeight };
  const maxTop = options.rootSelector ? Infinity : win.scrollY + viewport.height * (1 + limits.scrollScreens);
  const rootStyle = getComputedStyle(doc.documentElement);
  const rootFontSizePx = parseFloat(rootStyle.fontSize) || 16;
  const parseColor = (() => {
    const fallback = canvasColorParser();
    return (value) => parseRgba(value, fallback);
  })();

  // ---- Stylesheets (document, adopted and open shadow roots) ----
  const shadowRoots = [];
  const sheets = [...doc.styleSheets, ...(doc.adoptedStyleSheets ?? [])];
  const sheetData = readStylesheets({ sheets, texts: options.sheetTexts ?? [], doc, win });

  // ---- Canvas and theme ----
  const colorSchemeProperty = rootStyle.colorScheme || 'normal';
  const bodyStyle = doc.body ? getComputedStyle(doc.body) : rootStyle;
  const rootBg = parseColor(rootStyle.backgroundColor);
  const bodyBg = parseColor(bodyStyle.backgroundColor);
  let canvas = rootBg && rootBg.a > 0 ? rootBg : bodyBg && bodyBg.a > 0 ? bodyBg : null;
  const schemeDark = colorSchemeProperty.includes('dark') && !colorSchemeProperty.includes('light');
  if (!canvas) canvas = schemeDark ? DARK_CANVAS : LIGHT_CANVAS;
  else if (canvas.a < 1) canvas = composite(canvas, schemeDark ? DARK_CANVAS : LIGHT_CANVAS);
  const activeMode = luminance(canvas) < 0.2 ? 'dark' : 'light';

  // ---- Accumulators ----
  const colors = new ColorAccumulator();
  const stats = {
    fontFamilies: new StatMap(),
    fontSizes: new StatMap(),
    fontWeights: new StatMap(),
    lineHeights: new StatMap(),
    letterSpacings: new StatMap(),
    textTransforms: new StatMap(),
    spacing: new StatMap(),
    radii: new StatMap(),
    shadows: new StatMap(),
    borderWidths: new StatMap(),
    borderStyles: new StatMap(),
    opacities: new StatMap(),
    durations: new StatMap(),
    easings: new StatMap(),
    transitionProperties: new StatMap(),
    containers: new StatMap(),
    gridColumns: new StatMap(),
    gaps: new StatMap(),
    iconSizes: new StatMap(),
    iconStrokes: new StatMap(),
  };
  const textStyles = new Map();
  const contrast = new Map();
  const zIndices = new Map();
  const gradients = new Map();
  const samples = new SampleMap(8);
  const classCounts = new Map();
  const svgHits = { lucide: 0, heroicons: 0, fontawesome: 0 };
  let dataSlots = 0;
  let gradientText = 0;

  // ---- Effective backgrounds (F9) ----
  const shownCache = new Map();
  const imageCache = new Map();
  const styleCache = new Map();
  const styleOf = (el) => {
    let s = styleCache.get(el);
    if (!s) {
      s = getComputedStyle(el);
      styleCache.set(el, s);
    }
    return s;
  };
  const parentOf = (el) => el.parentElement ?? el.parentNode?.host ?? null;
  /** The opaque color an element shows: its background over everything behind it. */
  const shown = (el) => {
    if (!el || el === doc.documentElement) return canvas;
    let c = shownCache.get(el);
    if (c) return c;
    const own = parseColor(styleOf(el).backgroundColor) ?? { r: 0, g: 0, b: 0, a: 0 };
    const behind = shown(parentOf(el));
    c = own.a <= 0 ? behind : own.a >= 1 ? own : composite(own, behind);
    shownCache.set(el, c);
    return c;
  };
  /** Whether a background image (not a gradient) sits behind this element's content. */
  const overImage = (el) => {
    if (!el || el === doc.documentElement) return false;
    if (imageCache.has(el)) return imageCache.get(el);
    const own = parseColor(styleOf(el).backgroundColor);
    const image = styleOf(el).backgroundImage;
    let result;
    if (own && own.a >= 1) result = false;
    else if (image && image !== 'none' && /url\(/.test(image)) result = true;
    else result = overImage(parentOf(el));
    imageCache.set(el, result);
    return result;
  };

  /** Records a color use with its backdrop (AC-F9.1). */
  const addColor = (value, weight, contexts, backdrop, imageBehind) => {
    if (isTransparent(value)) return;
    const rgba = parseColor(value);
    if (!rgba || rgba.a <= 0) return;
    const effective = rgba.a >= 1 ? rgba : composite(rgba, backdrop);
    colors.add(value, rgba, weight, contexts, toHex(effective), toHex(backdrop), imageBehind && rgba.a < 1);
  };

  // ---- Walk ----
  const sampleElements = new Map(); // sample key -> elements (for states and representatives)
  let sampled = 0;
  let truncated = false;
  let sliceCount = 0;
  let sliceStart = performance.now();
  const stack = [root];

  while (stack.length > 0) {
    if (sampled >= limits.elementCap || performance.now() - started > limits.timeBudgetMs) {
      truncated = true;
      break;
    }
    const el = stack.pop();
    if (!el || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName)) continue;
    const isSvgChild = el.namespaceURI === 'http://www.w3.org/2000/svg' && el.tagName.toLowerCase() !== 'svg';
    if (isSvgChild) continue;
    const style = styleOf(el);
    if (style.display === 'none') continue;

    // Children in reverse so they pop in document order; open shadow roots after light children.
    if (el.shadowRoot && el.shadowRoot.mode === 'open') {
      shadowRoots.push(el.shadowRoot);
      for (let i = el.shadowRoot.children.length - 1; i >= 0; i -= 1) stack.push(el.shadowRoot.children[i]);
    }
    if (el.tagName.toLowerCase() !== 'svg') {
      for (let i = el.children.length - 1; i >= 0; i -= 1) stack.push(el.children[i]);
    }

    const rect = el.getBoundingClientRect();
    const top = rect.top + win.scrollY;
    if (
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      top <= maxTop
    ) {
      readElement(el, style, rect);
      sampled += 1;
    }

    sliceCount += 1;
    if (sliceCount >= limits.sliceSize || performance.now() - sliceStart > SLICE_TIME_MS) {
      await yieldToPage();
      sliceCount = 0;
      sliceStart = performance.now();
    }
  }

  function readElement(el, style, rect) {
    const tag = el.tagName.toLowerCase();
    const interactive = isButton(el) || tag === 'a' || tag === 'select';
    const extra = interactive ? ['interactive'] : [];
    const textLength = tag === 'svg' ? 0 : ownTextLength(el);
    const behind = shown(parentOf(el));
    const self = shown(el);
    const imageBehind = overImage(parentOf(el));
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);

    for (const cls of el.classList ?? []) {
      if (classCounts.has(cls)) classCounts.set(cls, classCounts.get(cls) + 1);
      else if (classCounts.size < MAX_CLASS_TOKENS) classCounts.set(cls, 1);
    }
    if (el.hasAttribute('data-slot')) dataSlots += 1;

    if (tag === 'svg') {
      readIcon(el, rect);
      return;
    }

    // Text
    if (textLength > 0) {
      addColor(style.color, textLength, ['text', ...extra], self, overImage(el));
      stats.fontFamilies.add(style.fontFamily, textLength, ['text']);
      stats.fontSizes.add(style.fontSize, textLength, ['text']);
      stats.fontWeights.add(style.fontWeight, textLength, ['text']);
      stats.lineHeights.add(style.lineHeight, textLength, ['text']);
      const fontSize = parseFloat(style.fontSize) || 16;
      const lsPx = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0;
      const lsEm = Math.round((lsPx / fontSize) * 1000) / 1000;
      stats.letterSpacings.add(String(lsEm), textLength, ['text']);
      stats.textTransforms.add(style.textTransform, textLength, ['text']);
      const tags = textTags(el, tag);
      const key = [style.fontFamily, style.fontSize, style.lineHeight, style.fontWeight, lsEm, style.textTransform].join('|');
      let ts = textStyles.get(key);
      if (!ts) {
        ts = {
          family: style.fontFamily,
          sizePx: fontSize,
          lineHeightPx: style.lineHeight === 'normal' ? null : parseFloat(style.lineHeight) || null,
          fontWeight: Number(style.fontWeight) || 400,
          letterSpacingEm: lsEm,
          textTransform: style.textTransform,
          tags: new Set(),
          count: 0,
          usage: 0,
        };
        textStyles.set(key, ts);
      }
      for (const t of tags) ts.tags.add(t);
      ts.count += 1;
      ts.usage += textLength;

      const text = parseColor(style.color);
      if (text && text.a > 0) {
        const effText = toHex(text.a >= 1 ? text : composite(text, self));
        const cKey = [effText, toHex(self), fontSize, Number(style.fontWeight) || 400].join('|');
        const entry = contrast.get(cKey);
        if (entry) entry.count += 1;
        else contrast.set(cKey, { effectiveText: effText, effectiveBg: toHex(self), sizePx: fontSize, fontWeight: Number(style.fontWeight) || 400, count: 1 });
      }
    }

    // Fill
    addColor(style.backgroundColor, area, ['background', ...extra], behind, imageBehind);
    const image = style.backgroundImage;
    if (image && image !== 'none' && GRADIENT_FN.test(image)) {
      readGradients(image, area, behind);
      if (style.backgroundClip === 'text' || style.webkitBackgroundClip === 'text') gradientText += 1;
    }

    // Borders and outline
    for (const side of SIDES) {
      const width = parseFloat(style.getPropertyValue(`border-${side}-width`));
      const lineStyle = style.getPropertyValue(`border-${side}-style`);
      if (width > 0 && lineStyle !== 'none' && lineStyle !== 'hidden') {
        const length = side === 'top' || side === 'bottom' ? rect.width : rect.height;
        addColor(style.getPropertyValue(`border-${side}-color`), length * width, ['border'], self, imageBehind);
        stats.borderWidths.add(`${Math.round(width * 100) / 100}px`, 1);
        stats.borderStyles.add(lineStyle, 1);
      }
    }
    if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) {
      addColor(style.outlineColor, (rect.width + rect.height) * 2, ['outline'], behind, imageBehind);
    }

    // Spacing (auto-centering margins excluded)
    const autoMargins = isAutoCentered(el, style, rect);
    for (const prop of SPACING_PROPS) {
      if (autoMargins && (prop === 'margin-left' || prop === 'margin-right')) continue;
      const value = style.getPropertyValue(prop);
      if (value.endsWith('px') && parseFloat(value) > 0) stats.spacing.add(value, 1);
    }

    // Layout structure (F16)
    const display = style.display;
    const isFlex = display.includes('flex');
    const isGrid = display.includes('grid');
    if (isFlex || isGrid) {
      for (const gap of new Set([style.rowGap, style.columnGap])) {
        if (gap && gap !== 'normal' && parseFloat(gap) > 0) stats.gaps.add(gap, 1);
      }
      if (isGrid) {
        const tracks = style.gridTemplateColumns.replace(/\[[^\]]*\]/g, ' ').trim();
        if (tracks && tracks !== 'none') {
          const count = splitTracks(tracks).length;
          if (count >= 1) stats.gridColumns.add(String(count), 1);
        }
      } else if (!style.flexDirection.startsWith('column') && el.children.length >= 2) {
        const widths = [...el.children].map((c) => c.getBoundingClientRect().width).filter((w) => w > 0);
        if (widths.length >= 2 && Math.max(...widths) - Math.min(...widths) <= 2) {
          stats.gridColumns.add(String(widths.length), 1);
        }
      }
    }
    const maxWidth = style.maxWidth;
    if (maxWidth && maxWidth !== 'none' && !maxWidth.endsWith('%')) {
      const fs = parseFloat(style.fontSize) || 16;
      const px = /ch$/.test(maxWidth) ? parseFloat(maxWidth) * fs * 0.5 : /em$/.test(maxWidth) ? parseFloat(maxWidth) * fs : parseFloat(maxWidth);
      const ml = parseFloat(style.marginLeft);
      const mr = parseFloat(style.marginRight);
      if (px >= 320 && Math.abs(ml - mr) <= 1) {
        const prose = px >= 480 && px <= 800 && el.querySelector(':scope > p') !== null;
        stats.containers.add(`${Math.round(px)}px`, area, prose ? ['prose'] : []);
      }
    }

    // Radii and shadows
    const corners = new Set(CORNERS.map((c) => style.getPropertyValue(c)));
    for (const corner of corners) {
      const first = corner.split(' ')[0];
      if (first && parseFloat(first) > 0) stats.radii.add(first, 1);
    }
    if (style.boxShadow && style.boxShadow !== 'none') stats.shadows.add(style.boxShadow, 1);

    // Opacity, z-index (F17)
    const opacity = Number(style.opacity);
    if (opacity > 0 && opacity < 1) {
      const rounded = Math.round(opacity * 20) / 20;
      const disabled = el.matches(':disabled, [aria-disabled="true"]');
      stats.opacities.add(String(rounded), 1, disabled ? ['disabled'] : []);
    }
    if (style.position !== 'static' && /^-?\d+$/.test(style.zIndex)) readZIndex(el, style, rect, Number(style.zIndex));

    // Motion (F14)
    readMotion(style);

    // Components
    const kind = componentKind(el, style, rect, {
      parentShown: toRgbString(behind),
      sameSiblings: () => sameSiblingCount(el, style),
    });
    if (kind) {
      const styles = { ...recipeStyles(style), ...compositeStyles(kind, el, styleOf) };
      const hint = kind === 'badge' && badgeClassHint(el) ? 'class' : '';
      const key = samples.add(kind, styles, hint);
      if (STATEFUL_KINDS.has(kind) || kind.startsWith('h')) {
        const list = sampleElements.get(key) ?? [];
        if (list.length < MAX_REPRESENTATIVES) {
          list.push({ el, kind, rect });
          sampleElements.set(key, list);
        }
      }
    }
  }

  function readIcon(el, rect) {
    const size = Math.round(Math.max(rect.width, rect.height));
    const cls = el.classList;
    if (cls.contains('lucide')) svgHits.lucide += 1;
    if (cls.contains('svg-inline--fa')) svgHits.fontawesome += 1;
    const stroke = el.getAttribute('stroke-width') ?? styleOf(el).strokeWidth;
    if (
      el.getAttribute('data-slot') === 'icon' &&
      (el.getAttribute('viewBox') ?? '').trim() === '0 0 24 24' &&
      String(stroke) === '1.5'
    ) {
      svgHits.heroicons += 1;
    }
    if (size > 0 && size <= 48) {
      stats.iconSizes.add(`${size}px`, 1);
      const strokeNum = parseFloat(stroke);
      if (strokeNum > 0 && el.getAttribute('stroke') !== 'none') stats.iconStrokes.add(String(strokeNum), 1);
    }
  }

  function readZIndex(el, style, rect, value) {
    const hints = new Set();
    const role = el.getAttribute('role');
    if ((style.position === 'sticky' || style.position === 'fixed') && rect.top <= 1 && el.querySelector('nav, a') && rect.height < viewport.height / 2) {
      hints.add('sticky-header');
    }
    if (role === 'dialog' || el.getAttribute('aria-modal') === 'true' || el.tagName === 'DIALOG') hints.add('dialog');
    if (role === 'menu' || role === 'listbox') hints.add('menu');
    if (style.position === 'fixed' && (role === 'status' || el.hasAttribute('aria-live'))) hints.add('toast');
    if (role === 'tooltip') hints.add('tooltip');
    const bg = parseColor(style.backgroundColor);
    if (style.position === 'fixed' && rect.width >= viewport.width * 0.9 && rect.height >= viewport.height * 0.9 && bg && bg.a > 0 && bg.a < 1) {
      hints.add('overlay');
    }
    const entry = zIndices.get(value) ?? { value, count: 0, hints: new Set() };
    entry.count += 1;
    for (const h of hints) entry.hints.add(h);
    zIndices.set(value, entry);
  }

  function readMotion(style) {
    const props = style.transitionProperty.split(',').map((s) => s.trim());
    const durations = style.transitionDuration.split(',').map((s) => s.trim());
    const easings = splitTopLevel(style.transitionTimingFunction);
    props.forEach((prop, i) => {
      const d = toMs(durations[i % durations.length]);
      if (!(d > 0) || prop === 'none') return;
      stats.durations.add(String(d), 1, ['transition']);
      stats.easings.add(easings[i % easings.length] ?? 'ease', 1, ['transition']);
      stats.transitionProperties.add(prop, 1);
    });
    if (style.animationName && style.animationName !== 'none') {
      const d = toMs(style.animationDuration.split(',')[0]);
      if (d > 0) {
        stats.durations.add(String(d), 1, ['animation']);
        stats.easings.add(splitTopLevel(style.animationTimingFunction)[0] ?? 'ease', 1, ['animation']);
      }
    }
  }

  function readGradients(image, area, backdrop) {
    for (const layer of splitTopLevel(image)) {
      const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/is.exec(layer.trim());
      if (!m) continue;
      const args = splitTopLevel(m[3]);
      const stops = [];
      for (const arg of args) {
        const parts = splitColorAndPosition(arg);
        if (!parts) continue;
        const rgba = parseColor(parts.color);
        if (!rgba) continue;
        stops.push({ color: toHex(rgba), position: parts.position });
        addColor(parts.color, (area * GRADIENT_WEIGHT) / Math.max(1, args.length), ['gradient'], backdrop, false);
      }
      if (stops.length < 2) continue;
      const css = layer.trim().replace(/\s+/g, ' ');
      const entry = gradients.get(css) ?? { css, type: m[2].toLowerCase(), repeating: Boolean(m[1]), stops, count: 0, usage: 0 };
      entry.count += 1;
      entry.usage += area;
      gradients.set(css, entry);
    }
  }

  function sameSiblingCount(el, style) {
    const parent = el.parentElement;
    if (!parent) return 0;
    const sig = styleSignature(style);
    let n = 0;
    for (const sib of parent.children) {
      if (sib !== el && sib.tagName === el.tagName && styleSignature(styleOf(sib)) === sig) n += 1;
      if (n >= 2) break;
    }
    return n;
  }

  // ---- Shadow root stylesheets (AC-F22.1) ----
  if (shadowRoots.length > 0) {
    const shadowSheets = shadowRoots.flatMap((r) => [...r.styleSheets, ...(r.adoptedStyleSheets ?? [])]);
    const extra = readStylesheets({ sheets: shadowSheets, doc, win });
    mergeSheetData(sheetData, extra);
  }

  // ---- Variables (F10) ----
  const { variableDefs, cssVariables } = buildVariables(sheetData, rootStyle);

  // ---- States (F12, stylesheet path) and representatives ----
  const stateSamples = [];
  const representatives = [];
  for (const [key, list] of sampleElements) {
    for (const { el, kind, rect } of list) {
      const selector = uniqueSelector(el);
      if (selector) {
        representatives.push({
          kind,
          variant: key,
          selector,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewport.height && rect.right <= viewport.width,
        });
      }
    }
    const el = list[0]?.el;
    if (!el) continue;
    for (const s of stateStyles(el, sheetData.stateRules)) {
      stateSamples.push({ kind: list[0].kind, variant: key, state: s.state, styles: s.styles, source: 'stylesheet' });
    }
  }

  // ---- Fonts (F19) ----
  const fontFaces = readFontFaces(doc, sheetData.fontFaces);

  // ---- Signals (F11, F21) ----
  const varNames = variableDefs.map((d) => d.name);
  const themeOklch = variableDefs.some((d) => /^oklch\(/i.test(d.value));
  const frameworkHits = frameworkSignals({
    classCounts,
    varNames,
    dataSlots,
    layerNames: [...sheetData.layerNames],
    themeOklch,
  });
  const familyValues = stats.fontFamilies.toStats().map((s) => s.value);
  const iconHits = iconSignals({ classCounts, fontFamilies: familyValues, svg: svgHits });

  const breakpoints = [...sheetData.breakpointCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([px]) => px);
  const darkActive =
    activeMode === 'dark' ||
    [...sheetData.darkSelectors].some((sel) => safeMatches(doc.documentElement, sel) || safeMatches(doc.body, sel));

  return {
    url: location.href,
    title: doc.title,
    capturedAt: Date.now(),
    viewport,
    rootFontSizePx,
    colorScheme: darkActive ? 'dark' : 'light',
    elementsSampled: sampled,
    truncated,
    colors: colors.toStats(),
    fontFamilies: stats.fontFamilies.toStats(),
    fontSizes: stats.fontSizes.toStats(),
    fontWeights: stats.fontWeights.toStats(),
    lineHeights: stats.lineHeights.toStats(),
    letterSpacings: stats.letterSpacings.toStats(),
    textTransforms: stats.textTransforms.toStats(),
    textStyles: [...textStyles.values()]
      .map((t) => ({ ...t, tags: [...t.tags].sort(), usage: Math.round(t.usage) }))
      .sort((a, b) => b.usage - a.usage),
    spacing: stats.spacing.toStats(),
    radii: stats.radii.toStats(),
    shadows: stats.shadows.toStats(),
    borderWidths: stats.borderWidths.toStats(),
    borderStyles: stats.borderStyles.toStats(),
    opacities: stats.opacities.toStats(),
    zIndices: [...zIndices.values()].map((z) => ({ ...z, hints: [...z.hints].sort() })).sort((a, b) => a.value - b.value),
    durations: stats.durations.toStats(),
    easings: stats.easings.toStats(),
    transitionProperties: stats.transitionProperties.toStats(),
    reducedMotion: sheetData.reducedMotion,
    gradients: [...gradients.values()].map((g) => ({ ...g, usage: Math.round(g.usage) })).sort((a, b) => b.usage - a.usage),
    gradientText,
    containers: stats.containers.toStats(),
    gridColumns: stats.gridColumns.toStats(),
    gaps: stats.gaps.toStats(),
    fontFaces,
    cssVariables,
    variableDefs,
    variableUsage: sheetData.usage,
    themeSignals: {
      darkMedia: sheetData.darkMedia,
      darkSelectors: [...sheetData.darkSelectors].sort(),
      lightSelectors: [...sheetData.lightSelectors].sort(),
      activeMode: darkActive ? 'dark' : 'light',
      colorSchemeProperty,
    },
    themeRootRules: sheetData.themeRootRules.slice(0, 200),
    frameworkSignals: frameworkHits,
    iconSignals: iconHits,
    iconSizes: stats.iconSizes.toStats(),
    iconStrokes: stats.iconStrokes.toStats(),
    contrastSamples: [...contrast.values()].sort((a, b) => b.count - a.count).slice(0, 400),
    stateSamples,
    representatives,
    breakpoints,
    stylesheets: { readable: sheetData.readable, unreadable: sheetData.unreadable },
    samples: samples.toSamples(),
    canvasHex: toHex(canvas),
    devicePixelRatio: win.devicePixelRatio || 1,
    frameCount: inFrame ? 0 : countFrames(doc, win),
    coverage: { frames: { read: 0, skipped: 0 }, shadowRoots: shadowRoots.length, autoScrolled },
  };

  // ---- helpers bound to this run ----
  function stateStyles(el, rules) {
    const byState = new Map();
    for (const rule of rules) {
      if (!rule.mediaMatches) continue;
      if (!safeMatches(el, rule.base)) continue;
      for (const state of rule.states) {
        const list = byState.get(state) ?? [];
        list.push(rule);
        byState.set(state, list);
      }
    }
    const style = styleOf(el);
    const defaults = recipeStyles(style);
    const results = [];
    for (const [state, list] of byState) {
      list.sort((a, b) => compareSpecificity(a.spec, b.spec) || a.order - b.order);
      const decls = {};
      for (const rule of list) Object.assign(decls, rule.decls);
      const lookup = (name) => style.getPropertyValue(name).trim() || undefined;
      const resolved = {};
      for (const [prop, value] of Object.entries(decls)) resolved[prop] = resolveVars(value, lookup);
      const styles = toRecipeProps(resolved, style);
      const diff = {};
      for (const [prop, value] of Object.entries(styles)) {
        if (normalizeForCompare(value, parseColor) !== normalizeForCompare(defaults[prop], parseColor)) diff[prop] = value;
      }
      if (Object.keys(diff).length > 0) results.push({ state, styles: diff });
    }
    return results;
  }
}

class ColorAccumulator {
  constructor() {
    this.map = new Map();
  }

  add(value, rgba, weight, contexts, effectiveHex, backdropHex, overImage) {
    const key = `${value}|${contexts.join(',')}`;
    let e = this.map.get(key);
    if (!e) {
      e = { value, count: 0, weight: 0, contexts: new Set(contexts), pairs: new Map(), imageWeight: 0, maxWeight: 0 };
      this.map.set(key, e);
    }
    e.count += 1;
    e.weight += weight;
    e.maxWeight = Math.max(e.maxWeight, weight);
    const pair = `${effectiveHex}|${backdropHex}`;
    e.pairs.set(pair, (e.pairs.get(pair) ?? 0) + weight + 1e-6);
    if (overImage) e.imageWeight += weight;
  }

  toStats() {
    return [...this.map.values()]
      .map((e) => {
        const [effectiveHex, backdropHex] = [...e.pairs.entries()].sort((a, b) => b[1] - a[1])[0][0].split('|');
        return {
          value: e.value,
          count: e.count,
          weight: Math.round(e.weight * 100) / 100,
          contexts: [...e.contexts].sort(),
          effectiveHex,
          backdropHex,
          overImageShare: e.weight > 0 ? Math.round((e.imageWeight / e.weight) * 100) / 100 : 0,
          // Largest single use; for fills this is the biggest element's area (overlay role).
          maxWeight: Math.round(e.maxWeight),
        };
      })
      .sort((a, b) => b.weight - a.weight || b.count - a.count || (a.value < b.value ? -1 : 1));
  }
}

/** Visible iframes at least 100 x 100 px, so skipped frames can be counted (AC-F22.6). */
function countFrames(doc, win) {
  let n = 0;
  for (const f of doc.querySelectorAll('iframe, frame')) {
    const r = f.getBoundingClientRect();
    if (r.width >= 100 && r.height >= 100 && getComputedStyle(f).visibility !== 'hidden' && r.top < win.innerHeight * 4) n += 1;
  }
  return n;
}

function textTags(el, tag) {
  const tags = [tag];
  if (tag === 'a' && el.closest('nav, [role="navigation"]')) tags.push('nav-link');
  if (badgeClassHint(el)) tags.push('badge');
  return tags;
}

function isAutoCentered(element, style, rect) {
  const left = parseFloat(style.marginLeft);
  if (!(left > 0) || style.marginLeft !== style.marginRight) return false;
  const parent = element.parentElement;
  if (!parent) return false;
  const parentRect = parent.getBoundingClientRect();
  const ps = getComputedStyle(parent);
  const inner =
    parentRect.width -
    parseFloat(ps.paddingLeft) -
    parseFloat(ps.paddingRight) -
    parseFloat(ps.borderLeftWidth) -
    parseFloat(ps.borderRightWidth);
  return Math.abs(inner - rect.width - 2 * left) < 1;
}

function yieldToPage() {
  const scheduler = /** @type {any} */ (globalThis).scheduler;
  if (scheduler && typeof scheduler.yield === 'function') return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function toMs(value) {
  const v = String(value ?? '').trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ms') ? n : Math.round(n * 1000);
}

/** Splits a comma-separated CSS list without breaking inside parentheses. */
export function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of String(value ?? '')) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitTracks(tracks) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of tracks) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

/** Splits a gradient argument into its color and optional position, or null for directions. */
export function splitColorAndPosition(arg) {
  const a = arg.trim();
  if (/^(to\s|from\s|at\s|circle|ellipse|closest|farthest|-?[\d.]+(deg|turn|rad|grad)\b)/i.test(a)) return null;
  const fn = /^((?:rgba?|hsla?|oklch|oklab|lab|lch|color|hwb)\([^)]*\))\s*(.*)$/i.exec(a);
  if (fn) return { color: fn[1], position: fn[2].trim() || null };
  const word = /^(#[0-9a-f]{3,8}|[a-z]+)\s*(.*)$/i.exec(a);
  if (word && !/^(to|at|in)$/i.test(word[1])) return { color: word[1], position: word[2].trim() || null };
  return null;
}

function toRgbString({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function safeMatches(el, selector) {
  if (!el) return false;
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function normalizeForCompare(value, parseColor) {
  if (value === undefined) return '';
  const rgba = parseColor(value);
  return rgba ? toHex(rgba) : String(value).replace(/\s+/g, ' ').trim();
}

/** Maps state-rule declarations onto recipe properties, filling shorthands from the element. */
function toRecipeProps(decls, style) {
  const out = {};
  const bg = decls['background-color'] ?? decls.background;
  if (bg) {
    if (GRADIENT_FN.test(bg)) out['background-image'] = bg;
    else out['background-color'] = bg.split(/\s+(?![^(]*\))/)[0];
  }
  if (decls['background-image']) out['background-image'] = decls['background-image'];
  if (decls.color) out.color = decls.color;
  const borderColor = decls['border-color'] ?? decls['border-top-color'] ?? decls['border-bottom-color'];
  if (decls.border) out.border = decls.border;
  else if (borderColor) {
    out.border = `${decls['border-width'] ?? style.borderTopWidth} ${style.borderTopStyle === 'none' ? 'solid' : style.borderTopStyle} ${borderColor}`;
  }
  if (decls.outline || decls['outline-color'] || decls['outline-width'] || decls['outline-style']) {
    const parts = (decls.outline ?? '').split(/\s+(?![^(]*\))/).filter(Boolean);
    const width = decls['outline-width'] ?? parts.find((p) => /^[\d.]+(px|em|rem)$|^(thin|medium|thick)$/.test(p)) ?? style.outlineWidth;
    const lineStyle = decls['outline-style'] ?? parts.find((p) => /^(solid|dashed|dotted|double|auto|none)$/.test(p)) ?? 'solid';
    const color = decls['outline-color'] ?? parts.find((p) => !/^[\d.]+(px|em|rem)$|^(thin|medium|thick|solid|dashed|dotted|double|auto|none)$/.test(p)) ?? style.outlineColor;
    out.outline = lineStyle === 'none' ? 'none' : `${width} ${lineStyle} ${color}`;
  }
  if (decls['outline-offset']) out['outline-offset'] = decls['outline-offset'];
  if (decls['box-shadow']) out['box-shadow'] = decls['box-shadow'];
  if (decls.opacity) out.opacity = decls.opacity;
  return out;
}

function mergeSheetData(into, extra) {
  into.readable += extra.readable;
  into.unreadable += extra.unreadable;
  for (const [k, v] of extra.breakpointCounts) into.breakpointCounts.set(k, (into.breakpointCounts.get(k) ?? 0) + v);
  into.defs.push(...extra.defs);
  for (const [k, v] of Object.entries(extra.usage)) into.usage[k] = (into.usage[k] ?? 0) + v;
  into.darkMedia ||= extra.darkMedia;
  for (const s of extra.darkSelectors) into.darkSelectors.add(s);
  for (const s of extra.lightSelectors) into.lightSelectors.add(s);
  into.themeRootRules.push(...extra.themeRootRules);
  into.stateRules.push(...extra.stateRules);
  into.fontFaces.push(...extra.fontFaces);
  into.reducedMotion ||= extra.reducedMotion;
  for (const n of extra.layerNames) into.layerNames.add(n);
}

/**
 * Root and theme-scope custom properties with resolved values. Root values come from the
 * computed root style; theme-scope values are resolved through var() chains (AC-F10.1).
 */
function buildVariables(sheetData, rootStyle) {
  const defs = [];
  const byScope = { root: new Map(), 'dark-media': new Map(), 'dark-selector': new Map(), 'light-selector': new Map() };
  for (const d of sheetData.defs) byScope[d.scope]?.set(d.name, d);
  const rootRaw = (name) => byScope.root.get(name)?.value;
  const computed = (name) => rootStyle.getPropertyValue(name).trim() || undefined;

  for (const [scope, map] of Object.entries(byScope)) {
    for (const d of map.values()) {
      let value;
      if (scope === 'root') {
        value = resolveVars(d.value, (n) => rootRaw(n) ?? computed(n));
      } else {
        value = resolveVars(d.value, (n) => map.get(n)?.value ?? rootRaw(n) ?? computed(n));
      }
      if (value && value.length <= 300) defs.push({ name: d.name, value, scope, selector: d.selector });
    }
  }
  // Custom properties the browser lists on the computed root style, for sites whose sheets are
  // unreadable (AC-F10.10).
  const known = new Set(defs.map((d) => `${d.scope}|${d.name}`));
  for (let i = 0; i < rootStyle.length; i += 1) {
    const name = rootStyle[i];
    if (!name?.startsWith('--') || known.has(`root|${name}`)) continue;
    const value = computed(name);
    if (value && value.length <= 300) defs.push({ name, value, scope: 'root', selector: ':root (computed)' });
  }
  const usage = sheetData.usage;
  defs.sort((a, b) => (usage[b.name] ?? 0) - (usage[a.name] ?? 0) || (a.name < b.name ? -1 : 1));
  const kept = defs.slice(0, 3000);
  const cssVariables = {};
  for (const d of kept) if (d.scope === 'root' && !(d.name in cssVariables)) cssVariables[d.name] = d.value;
  return { variableDefs: kept, cssVariables };
}

function readFontFaces(doc, ruleFaces) {
  const families = new Map();
  const ownHost = location.host;
  const linkHosts = [...doc.querySelectorAll('link[rel~="stylesheet"][href]')]
    .map((l) => {
      try {
        return new URL(l.getAttribute('href'), doc.baseURI).host;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const providerOf = (hosts) => {
    for (const host of hosts) {
      if (/fonts\.(googleapis|gstatic)\.com$/.test(host)) return { provider: 'google-fonts', providerHost: host };
      if (/(use|p)\.typekit\.net$/.test(host)) return { provider: 'adobe-fonts', providerHost: host };
    }
    if (hosts.includes(ownHost)) return { provider: 'self-hosted', providerHost: ownHost };
    if (hosts.length) return { provider: 'other', providerHost: hosts[0] };
    return null;
  };
  const entry = (family) => {
    let f = families.get(family);
    if (!f) {
      f = { family, weights: new Set(), styles: new Set(), hosts: new Set(), loaded: false };
      families.set(family, f);
    }
    return f;
  };
  for (const face of ruleFaces) {
    const f = entry(face.family);
    f.weights.add(face.weight);
    f.styles.add(face.style);
    for (const h of face.hosts) f.hosts.add(h);
  }
  try {
    for (const face of doc.fonts ?? []) {
      const family = face.family.replace(/["']/g, '').trim();
      const f = entry(family);
      f.weights.add(face.weight);
      f.styles.add(face.style);
      if (face.status === 'loaded') f.loaded = true;
    }
  } catch {
    // document.fonts may be unavailable in some frames.
  }
  const googleLinked = linkHosts.some((h) => /fonts\.googleapis\.com$/.test(h));
  const adobeLinked = linkHosts.some((h) => /typekit\.net$/.test(h));
  return [...families.values()]
    .map((f) => {
      const known = providerOf([...f.hosts]);
      const fallback = googleLinked
        ? { provider: 'google-fonts', providerHost: 'fonts.googleapis.com' }
        : adobeLinked
          ? { provider: 'adobe-fonts', providerHost: 'use.typekit.net' }
          : { provider: 'unknown', providerHost: null };
      const weights = [...f.weights].flatMap(expandWeight).sort((a, b) => a - b);
      return {
        family: f.family,
        weights: [...new Set(weights)],
        styles: [...f.styles].sort(),
        ...(known ?? fallback),
        loaded: f.loaded,
      };
    })
    .sort((a, b) => (a.family < b.family ? -1 : 1));
}

function expandWeight(w) {
  const s = String(w).trim();
  if (s === 'normal') return [400];
  if (s === 'bold') return [700];
  const range = s.split(/\s+/).map(Number).filter(Number.isFinite);
  if (range.length === 2) return [range[0], range[1]];
  return range.length ? [range[0]] : [400];
}

export { DARK_SELECTOR, LIGHT_SELECTOR };
