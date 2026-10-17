// Component detection on the page (F5, F20): which elements are buttons, inputs, links,
// headings, cards, badges, nav bars, tabs, alerts and tables, and their default-state styles.
// Only styles, tags, roles and class names are read; text is used as a length at most.

import { isTransparent } from './aggregate.js';

const TEXT_INPUT_TYPES = new Set([
  'text', 'email', 'search', 'url', 'tel', 'password', 'number', 'date', 'datetime-local',
  'month', 'week', 'time', '',
]);

export function ownTextLength(element) {
  let length = 0;
  for (const child of element.childNodes) {
    if (child.nodeType === 3) length += child.nodeValue.trim().length;
  }
  return length;
}

export function isButton(element) {
  const tag = element.tagName;
  if (tag === 'BUTTON') return true;
  if (tag === 'INPUT') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    return type === 'button' || type === 'submit';
  }
  return element.getAttribute('role') === 'button';
}

export function isTextInput(element) {
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return TEXT_INPUT_TYPES.has((element.getAttribute('type') || '').toLowerCase());
}

/** A link inside running text: its parent has text of its own around it. */
export function isInlineLink(element, style) {
  if (element.tagName !== 'A' || !element.hasAttribute('href')) return false;
  if (element.getAttribute('role') === 'button') return false;
  if (!isTransparent(style.backgroundColor)) return false;
  const parent = element.parentElement;
  return parent !== null && ownTextLength(parent) > 0;
}

const classText = (el) => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
const hasClass = (el, pattern) => pattern.test(classText(el));

export function borderShorthand(style, side = 'top') {
  const width = style.getPropertyValue(`border-${side}-width`);
  const lineStyle = style.getPropertyValue(`border-${side}-style`);
  if (!(parseFloat(width) > 0) || lineStyle === 'none' || lineStyle === 'hidden') return 'none';
  return `${width} ${lineStyle} ${style.getPropertyValue(`border-${side}-color`)}`;
}

export function outlineShorthand(style) {
  if (style.outlineStyle === 'none' || !(parseFloat(style.outlineWidth) > 0)) return 'none';
  return `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
}

/** The recipe properties of an element in its current state. */
export function recipeStyles(style) {
  return {
    'background-color': style.backgroundColor,
    'background-image': style.backgroundImage,
    color: style.color,
    border: borderShorthand(style),
    'border-width': style.borderTopWidth,
    'border-radius': style.borderRadius,
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(' '),
    gap: style.gap === 'normal' ? '0px' : style.columnGap,
    height: style.height,
    'font-family': style.fontFamily,
    'font-size': style.fontSize,
    'font-weight': style.fontWeight,
    'line-height': style.lineHeight,
    'letter-spacing': style.letterSpacing,
    'text-transform': style.textTransform,
    'box-shadow': style.boxShadow,
    outline: outlineShorthand(style),
    'outline-offset': style.outlineOffset,
    opacity: style.opacity,
    transition: style.transitionDuration === '0s' ? 'none' : `${style.transitionDuration} ${style.transitionTimingFunction}`,
  };
}

const CARD_MIN = { width: 120, height: 80 };

/**
 * Decides the component kind of an element, or null.
 * @param {Element} el
 * @param {CSSStyleDeclaration} style
 * @param {DOMRect} rect
 * @param {{parentShown: string, sameSiblings: () => number}} ctx
 */
export function componentKind(el, style, rect, ctx) {
  const tag = el.tagName;
  const role = el.getAttribute('role');
  if (/^H[1-6]$/.test(tag)) return tag.toLowerCase();
  if (role === 'tablist') return 'tabs';
  if (role === 'table' || tag === 'TABLE') return 'table';
  if (tag === 'NAV' || role === 'navigation' || (tag === 'HEADER' && el.querySelectorAll('a').length >= 3 && isRow(style))) {
    return 'navbar';
  }
  if (isButton(el)) return 'button';
  if (isTextInput(el)) return 'input';
  if (isInlineLink(el, style)) return 'link';

  const hasFill = !isTransparent(style.backgroundColor) && style.backgroundColor !== ctx.parentShown;
  const hasBorder = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none';
  const hasShadow = style.boxShadow && style.boxShadow !== 'none';
  const radius = parseFloat(style.borderTopLeftRadius) || 0;

  if (role === 'alert' || (role === 'status' && hasFill) || hasClass(el, /\b(alert|notice|banner|callout|toast)\b/i)) {
    if (hasFill || hasBorder) return 'alert';
  }
  const fontSize = parseFloat(style.fontSize);
  if (
    rect.height <= 32 &&
    rect.width <= 200 &&
    (hasFill || hasBorder) &&
    radius >= 4 &&
    fontSize <= 14 &&
    ownTextLength(el) > 0 &&
    ownTextLength(el) <= 20 &&
    el.children.length <= 1
  ) {
    return 'badge';
  }
  if (
    (hasFill || hasBorder || hasShadow) &&
    radius > 0 &&
    rect.width >= CARD_MIN.width &&
    rect.height >= CARD_MIN.height &&
    el.querySelector('h1,h2,h3,h4,h5,h6,p') !== null &&
    (hasClass(el, /card/i) || ctx.sameSiblings() >= 2)
  ) {
    return 'card';
  }
  return null;
}

const isRow = (style) => style.display.includes('flex') && !style.flexDirection.startsWith('column');

export const badgeClassHint = (el) => hasClass(el, /\b(badge|tag|chip|pill)\b/i);

/** A signature for comparing sibling styles when detecting repeated cards. */
export function styleSignature(style) {
  return [style.backgroundColor, style.borderTopWidth, style.borderTopColor, style.borderRadius, style.boxShadow].join('|');
}

/** Extra recipe fields for composite kinds: nav links, tabs, tables. */
export function compositeStyles(kind, el, getStyle) {
  if (kind === 'navbar') {
    const link = el.querySelector('a:not([aria-current])') ?? el.querySelector('a');
    const active = el.querySelector('a[aria-current], [aria-current="page"]');
    const out = {};
    if (link) {
      const s = getStyle(link);
      out['link-color'] = s.color;
      out['link-font-size'] = s.fontSize;
      out['link-font-weight'] = s.fontWeight;
    }
    if (active) {
      const s = getStyle(active);
      out['active-color'] = s.color;
      out['active-background-color'] = s.backgroundColor;
      out['active-font-weight'] = s.fontWeight;
      out['active-border'] = borderShorthand(s, 'bottom');
    }
    return out;
  }
  if (kind === 'tabs') {
    const tabs = [...el.querySelectorAll('[role="tab"]')];
    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    const plain = tabs.find((t) => t !== selected);
    const out = {};
    const read = (prefix, t) => {
      const s = getStyle(t);
      out[`${prefix}color`] = s.color;
      out[`${prefix}background-color`] = s.backgroundColor;
      out[`${prefix}border`] = borderShorthand(s, 'bottom');
      out[`${prefix}padding`] = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' ');
      out[`${prefix}font-weight`] = s.fontWeight;
    };
    if (plain) read('tab-', plain);
    if (selected) read('selected-', selected);
    return out;
  }
  if (kind === 'table') {
    const th = el.querySelector('th, [role="columnheader"]');
    const rows = [...el.querySelectorAll('tbody tr, [role="row"]')].slice(0, 4);
    const cell = el.querySelector('td, [role="cell"]');
    const out = {};
    if (th) {
      const s = getStyle(th);
      out['header-background-color'] = s.backgroundColor;
      out['header-color'] = s.color;
      out['header-font-weight'] = s.fontWeight;
      out['header-font-size'] = s.fontSize;
    }
    if (cell) {
      const s = getStyle(cell);
      out['cell-padding'] = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].join(' ');
      out.divider = borderShorthand(s, 'bottom') !== 'none' ? borderShorthand(s, 'bottom') : borderShorthand(getStyle(cell.parentElement), 'bottom');
    }
    if (rows.length >= 3) {
      const bg = (r) => {
        const s = getStyle(r);
        if (!isTransparent(s.backgroundColor)) return s.backgroundColor;
        const c = r.firstElementChild;
        return c ? getStyle(c).backgroundColor : s.backgroundColor;
      };
      const a = bg(rows[0]);
      const b = bg(rows[1]);
      if (a !== b) out.zebra = b;
    }
    return out;
  }
  return {};
}
