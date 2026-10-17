// A temporary overlay layer for the picker and highlighter (v2 spec 2.1): one host element with
// all: initial and pointer-events: none, holding a closed shadow root. Removed on exit.

export function createOverlay(doc, styles) {
  const host = doc.createElement('webstyle-overlay');
  host.setAttribute(
    'style',
    'all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; display: block !important;',
  );
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = styles;
  root.appendChild(style);
  doc.documentElement.appendChild(host);
  return {
    root,
    remove() {
      host.remove();
    },
    get attached() {
      return host.isConnected;
    },
  };
}
