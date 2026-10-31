// A fake CdpClient (v2 spec 5.3) that records every command and lets tests script replies and
// failures per method.
import { vi } from 'vitest';

/**
 * @param {{handlers?: Record<string, (params: object, cdp: object) => unknown>}} [options]
 */
export function fakeCdp({ handlers = {} } = {}) {
  const listeners = new Map();
  const calls = [];
  const cdp = {
    calls,
    emit(event, params) {
      for (const fn of listeners.get(event) ?? []) fn(params);
    },
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
    send: vi.fn(async (method, params = {}) => {
      calls.push({ method, params });
      const handler = handlers[method];
      return handler ? handler(params, cdp) : {};
    }),
    on: vi.fn((event, handler) => {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
      return () => set.delete(handler);
    }),
    detach: vi.fn(async () => {}),
    /** Commands with this method, in order. */
    sent: (method) => calls.filter((c) => c.method === method),
  };
  return cdp;
}

/** Handlers for DOM lookups: every selector resolves to its own node id. */
export function domHandlers() {
  const ids = new Map();
  return {
    'DOM.getDocument': () => ({ root: { nodeId: 1 } }),
    'DOM.querySelector': ({ selector }) => {
      if (!ids.has(selector)) ids.set(selector, ids.size + 2);
      return { nodeId: ids.get(selector) };
    },
  };
}

/** A base raw snapshot as the basic capture returns it, light theme with dark media rules. */
export function baseRaw(overrides = {}) {
  return {
    url: 'https://example.com/',
    capturedAt: 1,
    colorScheme: 'light',
    viewport: { width: 1280, height: 720 },
    themeSignals: { darkMedia: true, darkSelectors: [], lightSelectors: [], activeMode: 'light' },
    stylesheets: { readable: 1, unreadable: 1 },
    representatives: [],
    stateSamples: [],
    ...overrides,
  };
}
