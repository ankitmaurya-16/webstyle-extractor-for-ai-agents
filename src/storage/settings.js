// Settings in chrome.storage.local. Missing fields are filled with defaults on read (v2 spec 6.2).

import { localGet, localSet } from '../platform/chrome.js';
import { DEFAULT_EXPORT_SELECTION, EXPORT_FORMATS } from '../model/types.js';

const KEY = 'settings';

export const DEFAULT_SETTINGS = Object.freeze({
  lastExportFormat: 'design-md',
  exportSelection: DEFAULT_EXPORT_SELECTION,
  panelTheme: 'system',
  useSiteVariableNames: true,
  shadcnFormat: 'oklch',
  includeScreenshots: false,
  autoScroll: false,
  advancedEnabled: false,
  advancedDefaults: Object.freeze({ dark: true, states: true, widths: [375, 768, 1280], deepScan: true }),
  highlightEnabled: false,
});

/** Validates stored settings field by field, falling back to defaults. */
export function normalizeSettings(stored) {
  const s = { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
  if (!EXPORT_FORMATS.includes(s.lastExportFormat)) s.lastExportFormat = 'design-md';
  if (!Array.isArray(s.exportSelection)) s.exportSelection = DEFAULT_EXPORT_SELECTION;
  s.exportSelection = s.exportSelection.filter((f) => EXPORT_FORMATS.includes(f) || f === 'screenshots');
  if (!['system', 'dark', 'light'].includes(s.panelTheme)) s.panelTheme = 'system';
  if (!['oklch', 'hsl'].includes(s.shadcnFormat)) s.shadcnFormat = 'oklch';
  s.advancedDefaults = { ...DEFAULT_SETTINGS.advancedDefaults, ...(s.advancedDefaults ?? {}) };
  s.advancedDefaults.widths = (Array.isArray(s.advancedDefaults.widths) ? s.advancedDefaults.widths : [])
    .map(Number)
    .filter((w) => w >= 320 && w <= 1920)
    .slice(0, 4);
  for (const key of ['useSiteVariableNames', 'includeScreenshots', 'autoScroll', 'advancedEnabled', 'highlightEnabled']) {
    s[key] = Boolean(s[key]);
  }
  return s;
}

export async function getSettings() {
  try {
    return normalizeSettings(await localGet(KEY));
  } catch {
    return normalizeSettings(null);
  }
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await localSet(KEY, next);
  return next;
}
