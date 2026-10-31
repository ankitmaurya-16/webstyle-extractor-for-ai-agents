// Fakes for the v2 panel, service worker and storage tests: a chrome global with the v2 APIs
// (ports, permissions, i18n, debugger), a fake service worker behind the panel port, and an
// analysis worker that runs the real src/analyze/worker.js handler synchronously.

import { vi } from 'vitest';
import { openDB } from 'idb';
import { captureOf, fakeChrome, fakeEvent, loadRaw, rawSnapshot, stat } from '../helpers.js';

/** A runtime.Port pair: `panel` is what connect() returns, `server` is the service worker side. */
export function fakePortPair(name = 'panel') {
  const toServer = fakeEvent();
  const toPanel = fakeEvent();
  const panelDisconnect = fakeEvent();
  const serverDisconnect = fakeEvent();
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    serverDisconnect.emit();
  };
  const panel = {
    name,
    onMessage: toPanel,
    onDisconnect: panelDisconnect,
    postMessage: vi.fn((m) => {
      if (!open) throw new Error('Attempting to use a disconnected port object');
      queueMicrotask(() => toServer.emit(structuredClone(m)));
    }),
    disconnect: vi.fn(close),
  };
  const server = {
    name,
    onMessage: toServer,
    onDisconnect: serverDisconnect,
    postMessage: vi.fn((m) => {
      if (!open) throw new Error('Attempting to use a disconnected port object');
      queueMicrotask(() => toPanel.emit(structuredClone(m)));
    }),
    disconnect: vi.fn(() => {
      open = false;
      panelDisconnect.emit();
    }),
  };
  return { panel, server, close, isOpen: () => open };
}

/** fakeChrome() plus the v2 APIs: connect/onConnect, permissions, i18n, debugger, captureVisibleTab. */
export function fakeChromeV2({ permissions = [], origins = [] } = {}) {
  const chrome = fakeChrome();
  const granted = { permissions: new Set(permissions), origins: new Set(origins) };
  chrome.runtime.onConnect = fakeEvent();
  chrome.runtime.ports = [];
  chrome.runtime.connect = vi.fn(({ name } = {}) => {
    const pair = fakePortPair(name);
    chrome.runtime.ports.push(pair);
    chrome.runtime.onConnect.emit(pair.server);
    return pair.panel;
  });
  chrome.permissions = {
    request: vi.fn(async (req) => {
      for (const p of req.permissions ?? []) granted.permissions.add(p);
      for (const o of req.origins ?? []) granted.origins.add(o);
      return true;
    }),
    remove: vi.fn(async (req) => {
      for (const p of req.permissions ?? []) granted.permissions.delete(p);
      for (const o of req.origins ?? []) granted.origins.delete(o);
      return true;
    }),
    contains: vi.fn(
      async (req) =>
        [...(req.permissions ?? [])].every((p) => granted.permissions.has(p)) &&
        [...(req.origins ?? [])].every((o) => granted.origins.has(o)),
    ),
    getAll: vi.fn(async () => ({
      permissions: ['activeTab', 'scripting', 'sidePanel', 'storage', ...granted.permissions],
      origins: [...granted.origins],
    })),
  };
  chrome.permissionsGranted = granted;
  chrome.tabs.captureVisibleTab = vi.fn(async () => 'data:image/png;base64,AAAA');
  chrome.storage.local.remove = vi.fn(async () => {});
  chrome.debugger = {
    attach: vi.fn(async () => {}),
    detach: vi.fn(async () => {}),
    sendCommand: vi.fn(async () => ({})),
    onEvent: fakeEvent(),
    onDetach: fakeEvent(),
  };
  return chrome;
}

/**
 * Answers the panel port like the service worker would. `reply(msg)` returns the message posted
 * back for EXTRACT (or a promise of one); PICK_START answers PICK_READY and HIGHLIGHT_SHOW answers
 * `highlightCount`, both overridable.
 */
export function fakeServiceWorker(chrome, handlers = {}) {
  const received = [];
  chrome.runtime.onConnect.addListener((port) => {
    port.onMessage.addListener(async (msg) => {
      received.push(msg);
      const handler = handlers[msg.type];
      let reply;
      if (handler) reply = await handler(msg, port);
      else if (msg.type === 'PICK_START') reply = { type: 'PICK_READY', tabId: msg.tabId };
      else if (msg.type === 'HIGHLIGHT_SHOW')
        reply = { type: 'HIGHLIGHT_COUNT', count: 3, tokenId: msg.tokenId };
      if (reply) {
        try {
          port.postMessage(reply);
        } catch {
          // The panel disconnected before the reply.
        }
      }
    });
  });
  return { received, ofType: (type) => received.filter((m) => m.type === type) };
}

/** A CAPTURES reply for a fixture raw, with its url and capturedAt changed when given. */
export function capturesReply(msg, raw = loadRaw('classic'), extra = {}) {
  const page = {
    ...raw,
    capturedAt: extra.capturedAt ?? Date.now(),
    ...(extra.url ? { url: extra.url } : {}),
  };
  return {
    type: 'CAPTURES',
    requestId: msg.requestId,
    captures: [
      captureOf(page, { id: `cap-${Math.random().toString(36).slice(2)}` }),
      ...(extra.captures ?? []),
    ],
    warnings: extra.warnings ?? [],
    screenshots: extra.screenshots ?? [],
  };
}

let workerHandler = null;

/** Loads src/analyze/worker.js once with a fake `self` and keeps its onmessage handler. */
export async function loadWorkerHandler() {
  if (workerHandler) return workerHandler;
  const had = 'self' in globalThis;
  const previous = globalThis.self;
  const fakeSelf = { postMessage: () => {} };
  globalThis.self = fakeSelf;
  try {
    await import('../../../src/analyze/worker.js');
  } finally {
    if (had) globalThis.self = previous;
    else delete globalThis.self;
  }
  workerHandler = fakeSelf.onmessage;
  return workerHandler;
}

/**
 * A Worker stand-in that runs the real worker handler. `fail` answers ERROR and `silent` never
 * answers; `delay` defers the run so tests can cancel or race it.
 */
export function fakeWorker({ delay = 0, fail = false, silent = false } = {}) {
  const worker = {
    terminated: false,
    onmessage: null,
    onerror: null,
    messages: [],
    terminate: vi.fn(() => {
      worker.terminated = true;
    }),
    postMessage(message) {
      worker.messages.push(message);
      if (silent) return;
      setTimeout(() => {
        if (worker.terminated) return;
        if (fail) {
          worker.onmessage?.({
            data: {
              type: 'ERROR',
              requestId: message.requestId,
              code: 'ANALYSIS_FAILED',
              detail: 'boom',
            },
          });
          return;
        }
        const replies = [];
        const had = 'self' in globalThis;
        const previous = globalThis.self;
        globalThis.self = { postMessage: (m) => replies.push(structuredClone(m)) };
        try {
          workerHandler({ data: structuredClone(message) });
        } finally {
          if (had) globalThis.self = previous;
          else delete globalThis.self;
        }
        for (const data of replies) {
          if (worker.terminated) return;
          worker.onmessage?.({ data });
        }
      }, delay);
    },
  };
  return worker;
}

/** A schemaVersion 1 record as v1.x stored it: a raw snapshot and two v1 designs. */
export function v1Record(id = 'v1-a', { capturedAt = Date.UTC(2026, 5, 1) } = {}) {
  const raw = rawSnapshot({
    url: 'https://old.example.com/',
    title: 'Old site',
    capturedAt,
    colors: [stat('#2563eb', 40, ['background']), stat('#111827', 60, ['text'])],
    fontFamilies: [stat('Inter, sans-serif', 100)],
    fontSizes: [stat('16px', 100)],
    spacing: [stat('8px', 50, ['padding']), stat('16px', 50, ['padding'])],
  });
  const design = {
    meta: { hostname: 'old.example.com', capturedAt },
    colors: [
      { id: 'c1', hex: '#2563eb', name: 'blue-600', roles: ['primary'], excluded: false },
      { id: 'c2', hex: '#111827', name: 'gray-900', roles: ['text'], excluded: false },
      { id: 'c3', hex: '#abcdef', name: 'blue-200', roles: [], excluded: false },
    ],
    typography: { families: [], sizes: [] },
    spacing: { tokens: [] },
    radii: [],
    shadows: [],
    breakpoints: [],
  };
  const edited = structuredClone(design);
  edited.colors[0].name = 'brand';
  // c3 is not on the page any more, so its rename cannot be carried over.
  edited.colors[2].name = 'sky';
  return {
    id,
    schemaVersion: 1,
    url: raw.url,
    hostname: 'old.example.com',
    title: raw.title,
    capturedAt,
    raw,
    extracted: design,
    edited,
  };
}

/** Creates the v1 database (version 1, one store) holding `records`, then closes it. */
export async function seedV1Database(records) {
  const database = await openDB('webstyle', 1, {
    upgrade(db) {
      const store = db.createObjectStore('snapshots', { keyPath: 'id' });
      store.createIndex('byCapturedAt', 'capturedAt');
      store.createIndex('byHostname', 'hostname');
    },
  });
  for (const r of records) await database.put('snapshots', r);
  database.close();
}
