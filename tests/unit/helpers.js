import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { analyze } from '../../src/analyze/index.js';
import { buildOverrideRaw } from '../../src/analyze/themes.js';

export const FIXTURE_NAMES = ['classic', 'dark', 'utility', 'cross-origin', 'large'];

/** A Capture around a raw snapshot, the way the panel builds one (v2 spec 6.1). */
export function captureOf(raw, extra = {}) {
  return {
    id: extra.id ?? `capture-${raw.url}-${extra.kind ?? 'base'}-${extra.mode ?? raw.colorScheme ?? 'light'}`,
    pageUrl: raw.url,
    mode: raw.colorScheme === 'dark' ? 'dark' : 'light',
    viewportWidth: raw.viewport?.width ?? 1280,
    method: 'computed',
    kind: 'base',
    capturedAt: raw.capturedAt,
    raw,
    ...extra,
  };
}

/**
 * Captures for one raw snapshot as the panel sends them to analysis: the base capture plus the
 * stylesheet-override capture of the other theme when the stylesheets define one (Path A).
 */
export function capturesFor(raw, { pathA = true } = {}) {
  const base = captureOf(raw);
  const override = pathA ? buildOverrideRaw(raw) : null;
  if (!override) return [base];
  return [base, captureOf(override, { mode: base.mode === 'dark' ? 'light' : 'dark', method: 'stylesheet-override', kind: 'theme' })];
}

/** Analyzes one raw snapshot the way the extension does. */
export function analyzeRaw(raw, options = {}) {
  return analyze(capturesFor(raw, options), options);
}

/** Analyzes a captured fixture by name, for example 'classic' or 'frameworks-tailwind'. */
export const analyzeFixture = (name, options) => analyzeRaw(loadRaw(name), options);

export function loadRaw(name) {
  // Resolved from the project root because jsdom tests give import.meta.url an http origin.
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `tests/unit/fixtures/${name}.raw.json`), 'utf8'),
  );
}

/** Minimal RawSnapshot with overrides. */
export function rawSnapshot(overrides = {}) {
  return {
    url: 'https://example.com/',
    title: 'Example',
    capturedAt: Date.UTC(2026, 9, 18),
    viewport: { width: 1280, height: 720 },
    rootFontSizePx: 16,
    colorScheme: 'light',
    elementsSampled: 100,
    truncated: false,
    colors: [],
    fontFamilies: [],
    fontSizes: [],
    fontWeights: [],
    lineHeights: [],
    textStyles: [],
    spacing: [],
    radii: [],
    shadows: [],
    cssVariables: {},
    breakpoints: [],
    stylesheets: { readable: 1, unreadable: 0 },
    samples: [],
    ...overrides,
  };
}

export const stat = (value, weight, contexts = ['text'], count = 1) => ({
  value,
  weight,
  count,
  contexts,
});

/** An event source like chrome.tabs.onUpdated, with emit for tests. */
export function fakeEvent() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    hasListeners: () => listeners.size > 0,
    emit: (...args) => [...listeners].forEach((fn) => fn(...args)),
  };
}

/** A fake chrome global with the APIs the extension uses. */
export function fakeChrome() {
  const session = new Map();
  const local = new Map();
  const onChanged = fakeEvent();
  const chrome = {
    tabs: {
      get: vi.fn(async (id) => ({ id, url: 'https://example.com/', windowId: 1 })),
      query: vi.fn(async () => [{ id: 7, url: 'https://example.com/page', windowId: 1 }]),
      create: vi.fn(async () => ({})),
      onUpdated: fakeEvent(),
      onRemoved: fakeEvent(),
      onActivated: fakeEvent(),
    },
    scripting: { executeScript: vi.fn() },
    runtime: {
      sendMessage: vi.fn(),
      getManifest: () => ({ version: '1.0.0' }),
      onMessage: fakeEvent(),
    },
    sidePanel: { setPanelBehavior: vi.fn(async () => {}), open: vi.fn(async () => {}) },
    commands: { onCommand: fakeEvent() },
    storage: {
      session: {
        get: vi.fn(async (key) => (session.has(key) ? { [key]: session.get(key) } : {})),
        set: vi.fn(async (items) => {
          for (const [k, v] of Object.entries(items)) {
            const oldValue = session.get(k);
            session.set(k, v);
            onChanged.emit({ [k]: { oldValue, newValue: v } }, 'session');
          }
        }),
        remove: vi.fn(async (key) => session.delete(key)),
      },
      local: {
        get: vi.fn(async (key) => (local.has(key) ? { [key]: local.get(key) } : {})),
        set: vi.fn(async (items) => Object.entries(items).forEach(([k, v]) => local.set(k, v))),
      },
      onChanged,
    },
  };
  return chrome;
}
