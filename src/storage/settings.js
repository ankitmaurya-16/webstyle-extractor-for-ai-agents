import { localGet, localSet } from '../platform/chrome.js';
import { EXPORT_FORMATS } from '../model/types.js';

const KEY = 'settings';
export const DEFAULT_SETTINGS = Object.freeze({ lastExportFormat: 'design-md' });

export async function getSettings() {
  try {
    const stored = (await localGet(KEY)) ?? {};
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!EXPORT_FORMATS.includes(settings.lastExportFormat))
      settings.lastExportFormat = 'design-md';
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(patch) {
  const current = await getSettings();
  await localSet(KEY, { ...current, ...patch });
}
