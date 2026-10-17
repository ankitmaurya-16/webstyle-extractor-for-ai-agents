import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { analyze } from '../../../src/analyze/index.js';
import { listSnapshots, getSnapshot, resetConnection } from '../../../src/storage/snapshots.js';
import { resetStore, setWorkerFactory, useStore } from '../../../entrypoints/sidepanel/store.js';
import { fakeChrome, loadRaw } from '../helpers.js';

/** A fake analysis worker that answers like src/analyze/worker.js, after `delay` ms. */
function fakeWorker({ delay = 0, fail = false, silent = false } = {}) {
  const worker = {
    terminated: false,
    onmessage: null,
    terminate() {
      this.terminated = true;
    },
    postMessage(message) {
      if (silent) return;
      setTimeout(() => {
        if (this.terminated) return;
        const reply = fail
          ? { type: 'ERROR', requestId: message.requestId, code: 'ANALYSIS_FAILED', detail: 'boom' }
          : { type: 'RESULT', requestId: message.requestId, design: analyze(message.raw) };
        this.onmessage?.({ data: { type: 'PROGRESS', requestId: 'stale', stage: 'normalize' } });
        this.onmessage?.({ data: reply });
      }, delay);
    },
  };
  return worker;
}

let chrome;
let workers;
const store = () => useStore.getState();

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  resetStore();
  chrome = fakeChrome();
  globalThis.chrome = chrome;
  workers = [];
  setWorkerFactory(() => {
    const w = fakeWorker();
    workers.push(w);
    return w;
  });
  chrome.runtime.sendMessage.mockImplementation(async () => ({
    type: 'SNAPSHOT',
    raw: { ...loadRaw('classic'), capturedAt: Date.now() },
  }));
});

afterEach(() => {
  vi.useRealTimers();
  resetStore();
  delete globalThis.chrome;
});

describe('panel store', () => {
  it('runs Extract to Results and saves the snapshot (flow 1)', async () => {
    await store().extract();
    expect(store().screen).toBe('results');
    expect(store().resultsTab).toBe('colors');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT', tabId: 7 });
    const list = await listSnapshots();
    expect(list.map((s) => s.id)).toEqual([store().record.id]);
    expect(workers[0].terminated).toBe(true);
  });

  it('AC-F1.3 starts one run only while a run is in progress', async () => {
    const first = store().extract();
    const second = store().extract();
    const third = store().extract();
    await Promise.all([first, second, third]);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('AC-F1.12 a cancelled run saves nothing and ignores late replies', async () => {
    let answer;
    chrome.runtime.sendMessage.mockImplementation(() => new Promise((r) => (answer = r)));
    const run = store().extract();
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    store().cancel();
    answer({ type: 'SNAPSHOT', raw: loadRaw('classic') });
    await run;
    expect(store().screen).toBe('home');
    expect(store().record).toBeNull();
    expect(await listSnapshots()).toEqual([]);
  });

  it('AC-F1.13 Re-run keeps the snapshot id; Extract creates a new one', async () => {
    await store().extract({ mode: 'new' });
    const id = store().record.id;
    await store().extract({ mode: 'rerun' });
    expect(store().record.id).toBe(id);
    await store().extract({ mode: 'new' });
    expect(store().record.id).not.toBe(id);
    expect(await listSnapshots()).toHaveLength(2);
  });

  it.each([
    ['RESTRICTED_PAGE'],
    ['FILE_ACCESS'],
    ['NO_ACCESS'],
    ['EMPTY_PAGE'],
    ['TIMEOUT'],
    ['PAGE_CHANGED'],
  ])('shows the state screen for %s', async (code) => {
    chrome.runtime.sendMessage.mockResolvedValue({ type: 'EXTRACT_ERROR', code, detail: 'x' });
    await store().extract();
    expect(store().screen).toBe('state');
    expect(store().failure.code).toBe(code);
    expect(store().run).toBeNull();
  });

  it('ANALYSIS_FAILED saves nothing (flow 3)', async () => {
    setWorkerFactory(() => fakeWorker({ fail: true }));
    await store().extract();
    expect(store().failure.code).toBe('ANALYSIS_FAILED');
    expect(await listSnapshots()).toEqual([]);
  });

  it('times out analysis after 10 s and terminates the worker', async () => {
    vi.useFakeTimers();
    const silent = fakeWorker({ silent: true });
    setWorkerFactory(() => silent);
    const run = store().extract();
    await vi.advanceTimersByTimeAsync(10_000);
    await run;
    expect(store().failure.code).toBe('ANALYSIS_FAILED');
    expect(silent.terminated).toBe(true);
  });

  it('Copy details has code, message, version and URL but no page content', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      type: 'EXTRACT_ERROR',
      code: 'INJECTION_FAILED',
      detail: 'Chrome said no',
    });
    await store().init();
    await store().extract();
    expect(store().failureDetails()).toBe(
      'Error: INJECTION_FAILED\nMessage: Chrome said no\nVersion: 1.0.0\nURL: https://example.com/page',
    );
  });

  it('AC-F1.2 a fresh pendingExtract starts a run without a click; a stale one is ignored', async () => {
    await store().init();
    await chrome.storage.session.set({
      pendingExtract: { tabId: 9, windowId: 1, at: Date.now() - 60_000 },
    });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    await chrome.storage.session.set({ pendingExtract: { tabId: 9, windowId: 1, at: Date.now() } });
    await vi.waitFor(() => expect(store().screen).toBe('results'));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EXTRACT', tabId: 9 });
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('pendingExtract');
  });

  it('AC-F6.7 saves edits to IndexedDB within 500 ms', async () => {
    await store().extract();
    const token = store().record.edited.colors[1];
    vi.useFakeTimers();
    expect(store().edit({ kind: 'rename', tokenId: token.id, name: 'ink' }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    await vi.waitFor(async () => {
      const saved = await getSnapshot(store().record.id);
      expect(saved.edited.colors.find((c) => c.id === token.id).name).toBe('ink');
    });
    expect(
      (await getSnapshot(store().record.id)).extracted.colors.find((c) => c.id === token.id).name,
    ).toBe(token.name);
  });

  it('AC-F6.1 an invalid edit changes nothing', async () => {
    await store().extract();
    const before = store().record;
    expect(
      store().edit({ kind: 'rename', tokenId: before.edited.colors[0].id, name: 'Bad Name' }),
    ).toEqual({ ok: false, error: 'INVALID_NAME' });
    expect(store().record).toBe(before);
  });

  it('AC-F6.8 Reset to extracted replaces the edited copy with the extracted copy', async () => {
    await store().extract();
    store().edit({ kind: 'exclude', tokenId: store().record.edited.colors[0].id });
    expect(store().record.edited).not.toEqual(store().record.extracted);
    store().resetToExtracted();
    expect(store().record.edited).toEqual(store().record.extracted);
  });

  it('AC-F7.2 the export text updates immediately after an edit', async () => {
    await store().extract();
    const before = store().exportText('css-vars');
    const token = store().record.edited.colors.find((c) => c.name === 'gray-900');
    store().edit({ kind: 'rename', tokenId: token.id, name: 'ink' });
    const after = store().exportText('css-vars');
    expect(before).toContain('--color-gray-900');
    expect(after).toContain('--color-ink: #111827;');
  });

  it('AC-F7.3 Copy shows Copied, or a toast suggesting Download when the write fails', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await store().copy('hello');
    await store().copy('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(store().toasts.map((t) => [t.kind, t.text, t.duration])).toEqual([
      ['COPIED', 'Copied', 1500],
      ['CLIPBOARD_FAILED', 'Copy failed. Use Download instead.', 4000],
    ]);
    vi.unstubAllGlobals();
  });

  it('shows STORAGE_FAILED but keeps results when the save fails', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('quota');
      },
    };
    resetConnection();
    await store().extract();
    expect(store().screen).toBe('results');
    expect(store().toasts.map((t) => t.kind)).toContain('STORAGE_FAILED');
  });

  it('AC-F8.6 Recent holds the three newest snapshots', async () => {
    for (let i = 0; i < 4; i += 1) await store().extract({ mode: 'new' });
    expect(store().recent).toHaveLength(3);
    expect(store().history).toHaveLength(4);
  });

  it('AC-F8.3 opening a snapshot shows its edited copy', async () => {
    await store().extract();
    const id = store().record.id;
    const token = store().record.edited.colors[0];
    store().edit({ kind: 'rename', tokenId: token.id, name: 'paper' });
    store().goHome();
    await vi.waitFor(async () =>
      expect((await getSnapshot(id)).edited.colors[0].name).toBe('paper'),
    );
    await store().openSnapshot(id);
    expect(store().screen).toBe('results');
    expect(store().record.edited.colors[0].name).toBe('paper');
  });

  it('AC-F7.9 restores the remembered export format on init', async () => {
    await chrome.storage.local.set({ settings: { lastExportFormat: 'dtcg' } });
    await store().init();
    expect(store().exportFormat).toBe('dtcg');
    await store().setExportFormat('css-vars');
    expect((await chrome.storage.local.get('settings')).settings.lastExportFormat).toBe('css-vars');
  });
});
