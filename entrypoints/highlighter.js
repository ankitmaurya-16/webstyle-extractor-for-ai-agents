import { createOverlay } from '../src/collect/overlay.js';
import { parseRgba, toHex } from '../src/collect/color.js';

// "Where is this used?" (F30): outlines matching elements in a fixed overlay. Page elements' own
// styles and attributes are never changed.
export default defineUnlistedScript(() => {
  if (self.__webstyleHighlighter) return true;
  const MAX_OUTLINES = 200;
  const ELEMENT_CAP = 4000;
  const RECOMPUTE_MS = 1000;
  let state = null;

  const STYLES =
    '.o { position: fixed; outline: 2px solid #7aa2f7; outline-offset: 1px; border-radius: 2px; background: rgb(122 162 247 / 0.08); }';
  const COLOR_PROPS = ['color', 'background-color', 'border-top-color', 'outline-color'];

  const normColor = (v) => {
    const c = parseRgba(v);
    return c && c.a > 0 ? toHex(c) : null;
  };
  const normShadow = (v) => String(v).replace(/\s+/g, ' ').trim();

  function matches(el, style, match) {
    const values = match.values;
    switch (match.property) {
      case 'color':
      case 'background-color':
      case 'border-color':
      case 'outline-color': {
        const props =
          match.property === 'color' && match.anyColor
            ? COLOR_PROPS
            : [match.property === 'border-color' ? 'border-top-color' : match.property];
        return props.some((p) => {
          if (p === 'border-top-color' && !(parseFloat(style.borderTopWidth) > 0)) return false;
          if (p === 'outline-color' && style.outlineStyle === 'none') return false;
          const hex = normColor(style.getPropertyValue(p));
          return hex !== null && values.includes(hex);
        });
      }
      case 'font-family':
        return values.includes(
          style.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase(),
        );
      case 'padding':
      case 'margin':
        return ['top', 'right', 'bottom', 'left'].some((s) =>
          values.includes(style.getPropertyValue(`${match.property}-${s}`)),
        );
      case 'border-width':
        return parseFloat(style.borderTopWidth) > 0 && values.includes(style.borderTopWidth);
      case 'border-radius':
        return values.includes(style.borderTopLeftRadius);
      case 'box-shadow':
        return values.includes(normShadow(style.boxShadow));
      case 'selector':
        return values.some((sel) => {
          try {
            return el.matches(sel);
          } catch {
            return false;
          }
        });
      case 'transition-duration':
        return style.transitionDuration.split(',').some((d) => values.includes(d.trim()));
      default:
        return values.includes(style.getPropertyValue(match.property));
    }
  }

  function find(match) {
    const found = [];
    const walker = document.createTreeWalker(
      document.body ?? document.documentElement,
      NodeFilter.SHOW_ELEMENT,
    );
    let n = 0;
    for (let el = walker.currentNode; el && n < ELEMENT_CAP; el = walker.nextNode()) {
      if (el.tagName === 'WEBSTYLE-OVERLAY') continue;
      n += 1;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (matches(el, style, match)) found.push(el);
    }
    return found;
  }

  function draw() {
    if (!state) return;
    const start = performance.now();
    state.boxes.forEach((box, i) => {
      const el = state.elements[i];
      if (!el?.isConnected) {
        box.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      box.style.display = '';
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    });
    state.lastDrawMs = performance.now() - start;
  }

  const schedule = () => {
    if (!state || state.frame) return;
    state.frame = requestAnimationFrame(() => {
      if (!state) return;
      state.frame = 0;
      draw();
    });
  };

  function render() {
    for (const b of state.boxes) b.remove();
    state.elements = find(state.match);
    state.boxes = state.elements.slice(0, MAX_OUTLINES).map(() => {
      const b = document.createElement('div');
      b.className = 'o';
      state.overlay.root.appendChild(b);
      return b;
    });
    draw();
    return state.elements.length;
  }

  function show(match) {
    clear();
    const overlay = createOverlay(document, STYLES);
    state = { overlay, match, elements: [], boxes: [], frame: 0, timer: 0, lastDrawMs: 0 };
    const count = render();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule, true);
    window.addEventListener('pagehide', clear, true);
    // Single-page apps re-render; recompute every second while active.
    state.timer = setInterval(() => state && render(), RECOMPUTE_MS);
    return { count };
  }

  function clear() {
    if (!state) return;
    cancelAnimationFrame(state.frame);
    clearInterval(state.timer);
    window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('resize', schedule, true);
    window.removeEventListener('pagehide', clear, true);
    state.overlay.remove();
    state = null;
  }

  self.__webstyleHighlighter = {
    show,
    clear,
    get active() {
      return Boolean(state);
    },
    get lastDrawMs() {
      return state?.lastDrawMs ?? 0;
    },
  };
  return true;
});
