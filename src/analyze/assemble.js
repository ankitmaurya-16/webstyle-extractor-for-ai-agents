// Turns what a capture returned into the captures analysis reads. Shared by the panel and the
// CLI so both analyze exactly the same input (AC-F41.2). Pure.

import { buildOverrideRaw } from './themes.js';

/**
 * Adds the other theme from stylesheet overrides (Path A, AC-F13.2) when no emulated theme
 * capture exists for the base page.
 * @param {object[]} captures captures from one page run
 * @param {() => string} newId
 */
export function withOverrideCapture(captures, newId) {
  const base = captures.find((c) => c.kind === 'base');
  if (!base || captures.some((c) => c.kind === 'theme')) return captures;
  const override = buildOverrideRaw(base.raw);
  if (!override) return captures;
  return [
    ...captures,
    { ...base, id: newId(), mode: base.mode === 'dark' ? 'light' : 'dark', method: 'stylesheet-override', kind: 'theme', raw: override },
  ];
}

/** A Capture from a raw snapshot (v2 spec 6.1). */
export function toCapture(raw, newId, extra = {}) {
  return {
    id: newId(),
    pageUrl: raw.url,
    mode: raw.colorScheme === 'dark' ? 'dark' : 'light',
    viewportWidth: raw.viewport?.width ?? 0,
    method: 'computed',
    kind: 'base',
    capturedAt: raw.capturedAt,
    raw,
    ...extra,
  };
}
