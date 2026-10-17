// Reads stylesheet rules: breakpoints, custom properties with their theme scope, var() usage,
// theme signals, state rules, @font-face hosts, reduced-motion support and @layer names.
// Rules are only read; nothing is written to the page.

import { parseMediaBreakpoints } from './aggregate.js';
import { specificity, splitSelectorList, stripStates } from './specificity.js';

const MAX_DEFS = 3000;
const MAX_STATE_RULES = 2000;
const STATE_PROPS = [
  'background',
  'background-color',
  'background-image',
  'color',
  'border',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-width',
  'outline',
  'outline-color',
  'outline-width',
  'outline-style',
  'outline-offset',
  'box-shadow',
  'opacity',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'transform',
];

export const DARK_SELECTOR =
  /\.(?:dark|theme-dark|dark-mode|dark-theme)\b|\[data-(?:theme|mode|color-scheme|color-mode|bs-theme)\s*[~|^$*]?=\s*["']?dark["']?\s*\]/i;
export const LIGHT_SELECTOR =
  /\.(?:light|theme-light|light-mode|light-theme)\b|\[data-(?:theme|mode|color-scheme|color-mode|bs-theme)\s*[~|^$*]?=\s*["']?light["']?\s*\]/i;
const ROOTISH = /^(?::root|html|:host|body)$/i;

/** Classifies a selector for custom-property scope. */
export function selectorScope(selector, inDarkMedia) {
  const parts = splitSelectorList(selector);
  const kinds = parts.map((part) => {
    const dark = DARK_SELECTOR.test(part);
    const light = LIGHT_SELECTOR.test(part);
    const rest = part
      .replace(DARK_SELECTOR, '')
      .replace(LIGHT_SELECTOR, '')
      .replace(/:where\(\s*\)/g, '')
      .trim();
    const rootish = rest === '' || rest.split(/\s+/).every((p) => ROOTISH.test(p) || p === '*' || p === '>');
    if (!rootish) return 'other';
    if (dark) return 'dark-selector';
    if (light) return 'light-selector';
    return inDarkMedia ? 'dark-media' : 'root';
  });
  const first = kinds.find((k) => k !== 'other');
  return first ?? 'other';
}

/** Host name of a url() inside a CSS value, never the full URL. */
function urlHosts(src, base) {
  const hosts = [];
  for (const m of String(src).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    try {
      hosts.push(new URL(m[1], base).host);
    } catch {
      // Data URLs and malformed values have no host.
    }
  }
  return hosts;
}

/**
 * @param {{sheets: CSSStyleSheet[], texts?: string[], doc: Document, win: Window}} input
 */
export function readStylesheets({ sheets, texts = [], doc, win }) {
  const out = {
    readable: 0,
    unreadable: 0,
    breakpointCounts: new Map(),
    defs: [],
    usage: {},
    darkMedia: false,
    darkSelectors: new Set(),
    lightSelectors: new Set(),
    themeRootRules: [],
    stateRules: [],
    fontFaces: [],
    reducedMotion: false,
    layerNames: new Set(),
    order: 0,
  };
  const base = doc.baseURI;

  const mediaMatches = (condition) => {
    try {
      return win.matchMedia(condition).matches;
    } catch {
      return true;
    }
  };

  const visitRules = (rules, ctx, depth, href) => {
    if (depth > 10) return;
    for (const rule of rules) {
      out.order += 1;
      const type = rule.constructor?.name;
      if (rule instanceof CSSImportRule || type === 'CSSImportRule') {
        if (rule.styleSheet) visitSheet(rule.styleSheet, ctx, depth + 1);
      } else if (rule instanceof CSSMediaRule || type === 'CSSMediaRule') {
        const condition = rule.conditionText ?? rule.media?.mediaText ?? '';
        for (const px of parseMediaBreakpoints(condition)) {
          out.breakpointCounts.set(px, (out.breakpointCounts.get(px) ?? 0) + 1);
        }
        const dark = /prefers-color-scheme\s*:\s*dark/i.test(condition);
        if (dark) out.darkMedia = true;
        if (/prefers-reduced-motion/i.test(condition)) out.reducedMotion = true;
        visitRules(
          rule.cssRules,
          { ...ctx, dark: ctx.dark || dark, matches: ctx.matches && mediaMatches(condition) },
          depth + 1,
          href,
        );
      } else if (type === 'CSSLayerBlockRule') {
        if (rule.name) out.layerNames.add(rule.name);
        visitRules(rule.cssRules, ctx, depth + 1, href);
      } else if (type === 'CSSLayerStatementRule') {
        for (const name of rule.nameList ?? []) out.layerNames.add(name);
      } else if (rule instanceof CSSFontFaceRule || type === 'CSSFontFaceRule') {
        const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
        if (family) {
          out.fontFaces.push({
            family,
            weight: rule.style.getPropertyValue('font-weight') || '400',
            style: rule.style.getPropertyValue('font-style') || 'normal',
            hosts: urlHosts(rule.style.getPropertyValue('src'), href ?? base),
          });
        }
      } else if (rule instanceof CSSStyleRule || type === 'CSSStyleRule') {
        visitStyleRule(rule, ctx);
        if (rule.cssRules?.length) visitRules(rule.cssRules, ctx, depth + 1, href);
      } else if (rule.cssRules) {
        visitRules(rule.cssRules, ctx, depth + 1, href);
      }
    }
  };

  const visitStyleRule = (rule, ctx) => {
    const selector = rule.selectorText ?? '';
    const text = rule.style?.cssText ?? '';
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) out.usage[m[1]] = (out.usage[m[1]] ?? 0) + 1;

    const hasDark = DARK_SELECTOR.test(selector);
    const hasLight = LIGHT_SELECTOR.test(selector);
    if (hasDark) for (const s of matchingParts(selector, DARK_SELECTOR)) out.darkSelectors.add(s);
    if (hasLight) for (const s of matchingParts(selector, LIGHT_SELECTOR)) out.lightSelectors.add(s);

    const scope = selectorScope(selector, ctx.dark);
    if (scope !== 'other') {
      for (const prop of rule.style) {
        if (prop.startsWith('--') && out.defs.length < MAX_DEFS) {
          out.defs.push({ name: prop, value: rule.style.getPropertyValue(prop).trim(), scope, selector });
        }
      }
      if (scope !== 'root' || ctx.dark) {
        for (const prop of ['background-color', 'background', 'color']) {
          const value = rule.style.getPropertyValue(prop).trim();
          if (value) out.themeRootRules.push({ scope, selector, property: prop, value });
        }
      }
    }

    if (/:(hover|focus|focus-visible|active)\b/.test(selector) && out.stateRules.length < MAX_STATE_RULES) {
      const decls = {};
      for (const prop of STATE_PROPS) {
        const value = rule.style.getPropertyValue(prop).trim();
        if (value) decls[prop] = value;
      }
      if (Object.keys(decls).length === 0) return;
      for (const part of splitSelectorList(selector)) {
        const { base, states } = stripStates(part);
        if (states.length === 0) continue;
        out.stateRules.push({
          selector: part,
          base,
          states,
          spec: specificity(part),
          order: out.order,
          mediaMatches: ctx.matches,
          decls,
        });
      }
    }
  };

  const visitSheet = (sheet, ctx, depth) => {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      out.unreadable += 1; // cross-origin stylesheet without CORS
      return;
    }
    out.readable += 1;
    visitRules(rules, ctx, depth, sheet.href);
  };

  const rootCtx = { dark: false, matches: true };
  for (const sheet of sheets) visitSheet(sheet, rootCtx, 0);
  for (const text of texts) {
    // Deep-scan texts (F23) are parsed into a detached sheet; nothing touches the document.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text.replace(/@import[^;]+;/g, ''));
      out.readable += 1;
      visitRules(sheet.cssRules, rootCtx, 0, null);
    } catch {
      // Unparseable text is skipped.
    }
  }
  return out;
}

function matchingParts(selector, pattern) {
  const found = [];
  for (const part of splitSelectorList(selector)) {
    const m = pattern.exec(part);
    if (m) found.push(m[0]);
  }
  return found;
}

/**
 * Resolves var() references in a value from a lookup, with fallbacks and a cycle guard
 * (AC-F10.1).
 * @param {string} value
 * @param {(name: string) => string|undefined} lookup
 */
export function resolveVars(value, lookup, seen = new Set()) {
  let out = String(value);
  for (let guard = 0; guard < 20 && /var\(/.test(out); guard += 1) {
    const next = replaceFirstVar(out, lookup, seen);
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

function replaceFirstVar(value, lookup, seen) {
  const start = value.indexOf('var(');
  if (start < 0) return value;
  let depth = 0;
  let end = -1;
  for (let i = start + 3; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return value;
  const inner = value.slice(start + 4, end);
  const comma = topLevelComma(inner);
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const fallback = comma < 0 ? '' : inner.slice(comma + 1).trim();
  let replacement;
  if (seen.has(name)) {
    replacement = fallback;
  } else {
    const found = lookup(name);
    if (found !== undefined && found !== '') {
      const nextSeen = new Set(seen).add(name);
      replacement = resolveVars(found, lookup, nextSeen);
    } else {
      replacement = fallback;
    }
  }
  return value.slice(0, start) + replacement + value.slice(end + 1);
}

function topLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') depth -= 1;
    else if (s[i] === ',' && depth === 0) return i;
  }
  return -1;
}
