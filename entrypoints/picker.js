import { uniqueSelector } from '../src/collect/selectors.js';
import { createOverlay } from '../src/collect/overlay.js';

// Element picker (F26). Clicks are captured so the page's own handlers never run; Escape cancels,
// arrows move to the parent or first child, Enter confirms. Everything is removed on exit.
export default defineUnlistedScript(() => {
  if (self.__webstylePicker) return true;
  let state = null;

  const send = (message) => {
    try {
      chrome.runtime.sendMessage(message);
    } catch {
      // The extension was reloaded; nothing to tell.
    }
  };

  const STYLES = `
    .box { position: fixed; border: 2px solid #7aa2f7; border-radius: 2px; background: rgb(122 162 247 / 0.12); box-sizing: border-box; }
    .label { position: fixed; font: 12px/16px ui-monospace, monospace; color: #0a0a0b; background: #7aa2f7; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
  `;

  function describe(el) {
    const r = el.getBoundingClientRect();
    const cls =
      typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/)[0]}`
        : '';
    return {
      tag: `${el.tagName.toLowerCase()}${cls}`,
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }

  function draw() {
    if (!state?.current) return;
    const r = state.current.getBoundingClientRect();
    Object.assign(state.box.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    const info = describe(state.current);
    state.label.textContent = `${info.tag} · ${info.width} x ${info.height}`;
    Object.assign(state.label.style, {
      left: `${Math.max(0, r.left)}px`,
      top: `${Math.max(0, r.top - 22)}px`,
    });
  }

  function setCurrent(el) {
    if (!el || el === document.documentElement || el.tagName === 'WEBSTYLE-OVERLAY') return;
    state.current = el;
    draw();
    send({ type: 'PICK_HOVER', ...describe(el) });
  }

  const block = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  function onMove(event) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (el && el !== state.current) setCurrent(el);
  }

  function onClick(event) {
    block(event);
    const el = document.elementFromPoint(event.clientX, event.clientY) ?? state.current;
    if (el) setCurrent(el);
    confirm();
  }

  function key(name) {
    if (!state) return false;
    if (name === 'Escape') cancel();
    else if (
      name === 'ArrowUp' &&
      state.current?.parentElement &&
      state.current.parentElement !== document.documentElement
    )
      setCurrent(state.current.parentElement);
    else if (name === 'ArrowDown' && state.current?.firstElementChild)
      setCurrent(state.current.firstElementChild);
    else if (name === 'Enter') confirm();
    else return false;
    return true;
  }

  function onKey(event) {
    if (key(event.key)) block(event);
  }

  function confirm() {
    const el = state?.current;
    if (!el) return;
    const selector = uniqueSelector(el);
    const r = el.getBoundingClientRect();
    stop();
    if (!selector) {
      send({ type: 'PICK_CANCELLED', reason: 'no-selector' });
      return;
    }
    send({
      type: 'PICK_RESULT',
      selector,
      rect: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
    });
  }

  function cancel() {
    stop();
    send({ type: 'PICK_CANCELLED' });
  }

  const listeners = [
    ['mousemove', onMove],
    ['click', onClick],
    ['mousedown', block],
    ['mouseup', block],
    ['pointerdown', block],
    ['pointerup', block],
    ['auxclick', block],
    ['contextmenu', block],
    ['keydown', onKey],
    ['scroll', () => draw()],
    ['resize', () => draw()],
    ['pagehide', () => stop()],
  ];

  function start() {
    if (state) return true;
    const overlay = createOverlay(document, STYLES);
    const box = document.createElement('div');
    box.className = 'box';
    const label = document.createElement('div');
    label.className = 'label';
    overlay.root.append(box, label);
    state = { overlay, box, label, current: null };
    for (const [type, fn] of listeners) window.addEventListener(type, fn, true);
    // Without a mouse, start at the element in the middle of the viewport (AC-F26.11).
    setCurrent(
      document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2) ?? document.body,
    );
    return true;
  }

  function stop() {
    if (!state) return;
    for (const [type, fn] of listeners) window.removeEventListener(type, fn, true);
    state.overlay.remove();
    state = null;
  }

  self.__webstylePicker = {
    start,
    stop,
    key,
    get active() {
      return Boolean(state);
    },
  };
  return true;
});
