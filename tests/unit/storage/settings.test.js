import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getSettings,
  normalizeSettings,
  setSettings,
} from '../../../src/storage/settings.js';
import { DEFAULT_EXPORT_SELECTION } from '../../../src/model/types.js';
import { fakeChrome } from '../helpers.js';

beforeEach(() => {
  globalThis.chrome = fakeChrome();
});
afterEach(() => {
  delete globalThis.chrome;
});

describe('settings v2', () => {
  it('fills missing fields with the documented defaults', async () => {
    const s = await getSettings();
    expect(s).toEqual({
      lastExportFormat: 'design-md',
      exportSelection: DEFAULT_EXPORT_SELECTION,
      panelTheme: 'system',
      useSiteVariableNames: true,
      shadcnFormat: 'oklch',
      includeScreenshots: false,
      autoScroll: false,
      advancedEnabled: false,
      advancedDefaults: { dark: true, states: true, widths: [375, 768, 1280], deepScan: true },
      highlightEnabled: false,
    });
  });

  it('keeps a v1 settings record and adds the v2 fields', async () => {
    await globalThis.chrome.storage.local.set({ settings: { lastExportFormat: 'tailwind-v4' } });
    const s = await getSettings();
    expect(s.lastExportFormat).toBe('tailwind-v4');
    expect(s.panelTheme).toBe('system');
    expect(s.highlightEnabled).toBe(false);
  });

  it('replaces invalid values field by field', () => {
    const s = normalizeSettings({
      lastExportFormat: 'pdf',
      exportSelection: ['design-md', 'nope', 'screenshots'],
      panelTheme: 'blue',
      shadcnFormat: 'rgb',
      autoScroll: 'yes',
      highlightEnabled: 0,
      advancedDefaults: { dark: false, widths: [100, 375, '768', 5000, 1024, 1280, 1440] },
    });
    expect(s).toMatchObject({
      lastExportFormat: 'design-md',
      exportSelection: ['design-md', 'screenshots'],
      panelTheme: 'system',
      shadcnFormat: 'oklch',
      autoScroll: true,
      highlightEnabled: false,
      advancedDefaults: {
        dark: false,
        states: true,
        deepScan: true,
        widths: [375, 768, 1024, 1280],
      },
    });
  });

  it('treats a non-object record as missing', () => {
    expect(normalizeSettings('garbage')).toEqual(normalizeSettings(null));
    expect(normalizeSettings({ exportSelection: 'all' }).exportSelection).toEqual(
      DEFAULT_EXPORT_SELECTION,
    );
  });

  it('AC-F42.5 setSettings merges a patch, normalizes and saves the whole record', async () => {
    const next = await setSettings({ panelTheme: 'light' });
    expect(next.panelTheme).toBe('light');
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith({ settings: next });
    await setSettings({ highlightEnabled: true });
    expect(await getSettings()).toMatchObject({ panelTheme: 'light', highlightEnabled: true });
  });

  it('falls back to defaults when storage throws', async () => {
    globalThis.chrome.storage.local.get = async () => {
      throw new Error('quota');
    };
    expect(await getSettings()).toEqual(normalizeSettings(null));
  });

  it('defaults are frozen', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.advancedDefaults)).toBe(true);
  });
});
