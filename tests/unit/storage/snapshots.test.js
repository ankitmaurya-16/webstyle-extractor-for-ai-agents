import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { analyze } from '../../../src/analyze/index.js';
import {
  deleteAllSnapshots,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  makeRecord,
  resetConnection,
  saveSnapshot,
} from '../../../src/storage/snapshots.js';
import { getSettings, setSettings } from '../../../src/storage/settings.js';
import { fakeChrome, loadRaw } from '../helpers.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
});

function record(id, capturedAt, name = 'classic') {
  const raw = { ...loadRaw(name), capturedAt };
  return makeRecord(raw, analyze(raw), id);
}

describe('snapshot storage', () => {
  it('AC-F8.1 saves a SnapshotRecord with raw, extracted and edited copies', async () => {
    const r = record('a', 1000);
    await saveSnapshot(r);
    const stored = await getSnapshot('a');
    expect(stored).toMatchObject({
      id: 'a',
      schemaVersion: 1,
      hostname: '127.0.0.1',
      capturedAt: 1000,
    });
    expect(stored.raw.elementsSampled).toBeGreaterThan(0);
    expect(stored.extracted).toEqual(stored.edited);
    expect(stored.extracted).not.toBe(stored.edited);
  });

  it('AC-F8.2 lists newest first with the top five colors by usage', async () => {
    await saveSnapshot(record('old', 1000));
    await saveSnapshot(record('new', 3000, 'dark'));
    await saveSnapshot(record('mid', 2000));
    const list = await listSnapshots();
    expect(list.map((s) => s.id)).toEqual(['new', 'mid', 'old']);
    expect(list[0].topColors).toHaveLength(5);
    const dark = record('x', 1, 'dark').edited.colors;
    const top = [...dark].sort((a, b) => b.usageShare - a.usageShare)[0].hex;
    expect(list[0].topColors[0]).toBe(top);
  });

  it('AC-F8.4 deletes one snapshot, or all and reports how many', async () => {
    await saveSnapshot(record('a', 1));
    await saveSnapshot(record('b', 2));
    await saveSnapshot(record('c', 3));
    await deleteSnapshot('b');
    expect((await listSnapshots()).map((s) => s.id)).toEqual(['c', 'a']);
    expect(await deleteAllSnapshots()).toBe(2);
    expect(await listSnapshots()).toEqual([]);
  });

  it('AC-F1.13 saving with an existing id replaces that snapshot', async () => {
    await saveSnapshot(record('same', 1));
    await saveSnapshot(record('same', 2, 'dark'));
    const list = await listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].capturedAt).toBe(2);
  });

  it('keeps one record of the largest fixture under 500 KB', () => {
    const size = new TextEncoder().encode(JSON.stringify(record('big', 1, 'large'))).length;
    expect(size).toBeLessThan(500 * 1024);
  });
});

describe('settings', () => {
  afterEach(() => delete globalThis.chrome);

  it('AC-F7.9 remembers the last export format in chrome.storage.local', async () => {
    globalThis.chrome = fakeChrome();
    expect((await getSettings()).lastExportFormat).toBe('design-md');
    await setSettings({ lastExportFormat: 'tailwind-v4' });
    expect(globalThis.chrome.storage.local.set).toHaveBeenCalledWith({
      settings: { lastExportFormat: 'tailwind-v4' },
    });
    expect((await getSettings()).lastExportFormat).toBe('tailwind-v4');
  });

  it('falls back to DESIGN.md for an unknown stored format', async () => {
    globalThis.chrome = fakeChrome();
    await globalThis.chrome.storage.local.set({ settings: { lastExportFormat: 'nope' } });
    expect((await getSettings()).lastExportFormat).toBe('design-md');
  });
});
