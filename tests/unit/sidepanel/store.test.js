import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  getSnapshot,
  listSnapshots,
  resetConnection,
  saveSnapshot,
} from '../../../src/storage/snapshots.js';
import { getSettings } from '../../../src/storage/settings.js';
import { t } from '../../../src/i18n.js';
import {
  MAX_PAGES,
  flushPendingSave,
  resetStore,
  setWorkerFactory,
  useStore,
} from '../../../entrypoints/sidepanel/store.js';
import { loadRaw } from '../helpers.js';
import {
  capturesReply,
  fakeChromeV2,
  fakeServiceWorker,
  fakeWorker,
  loadWorkerHandler,
  seedV1Database,
  v1Record,
} from './fakes.js';

const CLASSIC = loadRaw('classic');
const PAGE_1 = CLASSIC.url;
const PAGE_2 = 'http://127.0.0.1:4173/classic-about.html';

let chrome;
let sw;
let handlers;
let workers;
let workerOptions;
let nextRaw;
const store = () => useStore.getState();

function setTab(url, id = 7) {
  chrome.tabs.query.mockResolvedValue([{ id, url, windowId: 1 }]);
  chrome.tabs.get.mockImplementation(async (tabId) => ({ id: tabId, url, windowId: 1 }));
}

beforeAll(async () => {
  await loadWorkerHandler();
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  resetStore();
  chrome = fakeChromeV2();
  globalThis.chrome = chrome;
  nextRaw = (msg) => ({ ...CLASSIC, url: msg.tabUrl ?? CLASSIC.url });
  handlers = {
    EXTRACT: async (msg) => {
      const tab = await chrome.tabs.get(msg.tabId);
      return capturesReply(msg, { ...nextRaw(msg), url: tab.url });
    },
  };
  sw = fakeServiceWorker(chrome, handlers);
  workers = [];
  workerOptions = {};
  setWorkerFactory(() => {
    const w = fakeWorker(workerOptions);
    workers.push(w);
    return w;
  });
  setTab(PAGE_1);
});

afterEach(() => {
  vi.useRealTimers();
  resetStore();
  delete globalThis.chrome;
});

async function extractNew() {
  await store().extract({ intent: 'new' });
  expect(store().screen).toBe('results');
  return store().record;
}

describe('extraction intents', () => {
  it('AC-F1.1 Extract posts EXTRACT on the panel port and saves a v2 snapshot', async () => {
    const record = await extractNew();
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'panel' });
    const [msg] = sw.ofType('EXTRACT');
    expect(msg).toMatchObject({
      tabId: 7,
      intent: 'new',
      autoScroll: false,
      advanced: null,
      screenshots: false,
    });
    expect(typeof msg.requestId).toBe('string');
    expect(record).toMatchObject({
      schemaVersion: 2,
      kind: 'page',
      pages: [PAGE_1],
      edits: [],
      staleEdits: 0,
    });
    expect(record.extracted).toEqual(record.edited);
    expect((await listSnapshots()).map((s) => s.id)).toEqual([record.id]);
    expect(workers[0].terminated).toBe(true);
    expect(workers[0].messages[0]).toMatchObject({
      type: 'ANALYZE',
      edits: [],
      options: { useSiteVariableNames: true },
    });
  });

  it('AC-F1.3 starts one run only while a run is in progress', async () => {
    await Promise.all([store().extract(), store().extract(), store().extract()]);
    expect(sw.ofType('EXTRACT')).toHaveLength(1);
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('AC-F1.12 cancel posts CANCEL, saves nothing and ignores the late reply', async () => {
    let release;
    handlers.EXTRACT = (msg) =>
      new Promise((resolve) => (release = () => resolve(capturesReply(msg))));
    const running = store().extract();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(store().screen).toBe('extracting');
    const { requestId } = store().run;
    store().cancel();
    expect(store().screen).toBe('home');
    await vi.waitFor(() => expect(sw.ofType('CANCEL')).toEqual([{ type: 'CANCEL', requestId }]));
    release();
    await running;
    await new Promise((r) => setTimeout(r, 20));
    expect(store().record).toBeNull();
    expect(await listSnapshots()).toHaveLength(0);
  });

  it('AC-F1.8 an EXTRACT_ERROR reply shows the state screen and Retry runs the same intent', async () => {
    let calls = 0;
    handlers.EXTRACT = (msg) => {
      calls += 1;
      return calls === 1
        ? { type: 'EXTRACT_ERROR', requestId: msg.requestId, code: 'NO_ACCESS' }
        : capturesReply(msg);
    };
    await store().extract({ intent: 'new' });
    expect(store().screen).toBe('state');
    expect(store().failure).toMatchObject({ code: 'NO_ACCESS', retry: { intent: 'new' } });
    await store().retry();
    expect(store().screen).toBe('results');
  });

  it('AC-F13.3 adds a Path A stylesheet-override capture when the base raw has a dark override', async () => {
    nextRaw = () => loadRaw('dark-media');
    setTab(loadRaw('dark-media').url);
    const record = await extractNew();
    const analyzeMsg = workers[0].messages[0];
    expect(analyzeMsg.captures.map((c) => [c.kind, c.mode, c.method])).toEqual([
      ['base', 'light', 'computed'],
      ['theme', 'dark', 'stylesheet-override'],
    ]);
    expect(record.captures).toHaveLength(2);
    expect(record.edited.meta.modes).toEqual(expect.arrayContaining(['light', 'dark']));
  });

  it('AC-F13.3 does not add Path A when the base has no override or emulation captured the theme', async () => {
    await extractNew();
    expect(workers[0].messages[0].captures).toHaveLength(1);

    const darkMedia = loadRaw('dark-media');
    handlers.EXTRACT = (msg) => {
      const reply = capturesReply(msg, darkMedia);
      reply.captures.push({
        ...reply.captures[0],
        id: 'emulated',
        mode: 'dark',
        method: 'emulated',
        kind: 'theme',
      });
      return reply;
    };
    useStore.setState({ screen: 'home' });
    await store().extract({ intent: 'new' });
    const methods = workers.at(-1).messages[0].captures.map((c) => c.method);
    expect(methods).toEqual(['computed', 'emulated']);
  });

  it('AC-F26.6 a component intent sends the root selector without auto-scroll or advanced capture', async () => {
    useStore.setState({
      capture: { autoScroll: true, advanced: true, screenshots: false },
      debuggerGranted: true,
    });
    await store().extract({ intent: 'component', rootSelector: 'main > .card:nth-of-type(2)' });
    const [msg] = sw.ofType('EXTRACT');
    expect(msg).toMatchObject({
      intent: 'component',
      rootSelector: 'main > .card:nth-of-type(2)',
      autoScroll: false,
      advanced: null,
    });
    expect(store().record).toMatchObject({
      kind: 'component',
      rootSelector: 'main > .card:nth-of-type(2)',
    });
  });

  it('AC-F23.1 advanced capture sends the advanced defaults only when the debugger is granted', async () => {
    useStore.setState({
      capture: { autoScroll: false, advanced: true, screenshots: false },
      debuggerGranted: false,
    });
    await store().extract();
    expect(sw.ofType('EXTRACT')[0].advanced).toBeNull();
    useStore.setState({ debuggerGranted: true, screen: 'home' });
    await store().extract();
    expect(sw.ofType('EXTRACT')[1].advanced).toEqual(store().settings.advancedDefaults);
    expect(store().record.id).not.toBe(sw.ofType('EXTRACT')[0].requestId);
  });

  it('AC-F23.4 EXTRACT_PROGRESS on the port moves the stage list', async () => {
    let hold;
    handlers.EXTRACT = (msg, port) =>
      new Promise((resolve) => {
        port.postMessage({ type: 'EXTRACT_PROGRESS', requestId: msg.requestId, stage: 'reading' });
        hold = () => resolve(capturesReply(msg));
      });
    const running = store().extract();
    await vi.waitFor(() => expect(hold).toBeTypeOf('function'));
    await vi.waitFor(() => expect(store().run.stage).toBe('reading'));
    store().onProgress({ requestId: 'other', stage: 'saving' });
    expect(store().run.stage).toBe('reading');
    hold();
    await running;
    expect(store().screen).toBe('results');
  });

  it('a disconnected port fails the run instead of hanging', async () => {
    handlers.EXTRACT = (_msg, port) => {
      port.disconnect();
      return null;
    };
    await store().extract();
    expect(store().screen).toBe('state');
    expect(store().failure.code).toBe('INJECTION_FAILED');
  });
});

describe('multi-page snapshots (F25)', () => {
  async function twoPages() {
    await extractNew();
    setTab(PAGE_2);
    await store().refreshTab();
    await store().extract({ intent: 'add-page' });
    expect(store().screen).toBe('results');
    return store().record;
  }

  it('AC-F25.3 add-page appends the page, makes a site snapshot and keeps the id', async () => {
    const first = (await extractNew()).id;
    setTab(PAGE_2);
    await store().extract({ intent: 'add-page' });
    const record = store().record;
    expect(record.id).toBe(first);
    expect(record.kind).toBe('site');
    expect(record.pages).toEqual([PAGE_1, PAGE_2]);
    expect(sw.ofType('EXTRACT')[1]).toMatchObject({ intent: 'add-page', snapshotId: first });
    expect(workers.at(-1).messages[0].captures.map((c) => c.pageUrl)).toEqual([PAGE_1, PAGE_2]);
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('AC-F25.2 a host outside the same-site rule asks before adding, and Add anyway proceeds', async () => {
    await extractNew();
    setTab('https://other.example.org/page');
    await store().extract({ intent: 'add-page' });
    expect(store().dialog).toEqual({
      kind: 'cross-site',
      host: 'other.example.org',
      snapshotHost: '127.0.0.1',
    });
    expect(sw.ofType('EXTRACT')).toHaveLength(1);
    await store().confirmCrossSite();
    expect(store().dialog).toBeNull();
    expect(sw.ofType('EXTRACT')).toHaveLength(2);
    expect(store().record.pages).toHaveLength(2);
  });

  it('AC-F25.2 hostnames sharing their last two labels are the same site', async () => {
    nextRaw = () => ({ ...CLASSIC, url: 'https://www.example.com/' });
    setTab('https://www.example.com/');
    await extractNew();
    expect(store().record.hostname).toBe('www.example.com');
    setTab('https://blog.example.com/post');
    await store().extract({ intent: 'add-page' });
    expect(store().dialog).toBeNull();
    expect(store().record.pages).toEqual([
      'https://www.example.com/',
      'https://blog.example.com/post',
    ]);
  });

  it('AC-F25.9 a snapshot holds at most 20 pages; the 21st shows a message', async () => {
    const record = await extractNew();
    const pages = Array.from({ length: MAX_PAGES }, (_, i) => `${PAGE_1}?p=${i}`);
    useStore.setState({ record: { ...record, pages } });
    setTab(`${PAGE_1}?p=21`);
    await store().extract({ intent: 'add-page' });
    expect(sw.ofType('EXTRACT')).toHaveLength(1);
    expect(store().toasts.at(-1)).toMatchObject({
      kind: 'TOO_MANY_PAGES',
      text: t('toast_too_many_pages'),
    });
  });

  it('AC-F25.5 re-run replaces only the current page and replays the edit log', async () => {
    await twoPages();
    const colorId = store().record.edited.colors[0].id;
    expect(store().edit({ kind: 'rename', tokenId: colorId, name: 'my-brand' }).ok).toBe(true);
    setTab(PAGE_1);
    await store().extract({ intent: 'rerun' });
    const record = store().record;
    expect(record.pages).toEqual([PAGE_2, PAGE_1]);
    expect(record.captures.filter((c) => c.pageUrl === PAGE_1)).toHaveLength(1);
    expect(record.captures.filter((c) => c.pageUrl === PAGE_2)).toHaveLength(1);
    expect(record.kind).toBe('site');
    expect(record.edits).toEqual([{ kind: 'rename', tokenId: colorId, name: 'my-brand' }]);
    expect(record.edited.colors.find((c) => c.id === colorId).name).toBe('my-brand');
    expect(record.extracted.colors.find((c) => c.id === colorId).name).not.toBe('my-brand');
    expect(workers.at(-1).messages[0].edits).toEqual(record.edits);
  });

  it('AC-F25.6 removing a page re-analyzes; the last page cannot be removed', async () => {
    await twoPages();
    const analyses = workers.length;
    await store().removePage(PAGE_2);
    expect(workers.length).toBe(analyses + 1);
    expect(store().record.pages).toEqual([PAGE_1]);
    expect(store().record.captures.every((c) => c.pageUrl === PAGE_1)).toBe(true);
    expect(store().screen).toBe('results');
    expect((await getSnapshot(store().record.id)).pages).toEqual([PAGE_1]);
    await store().removePage(PAGE_1);
    expect(workers.length).toBe(analyses + 1);
    expect(store().record.pages).toEqual([PAGE_1]);
  });

  it('AC-F25.7 Allow on this site requests exactly <origin>/* and lists the site', async () => {
    useStore.setState({
      tab: { id: 7, url: 'https://shop.example.com/a/b?c=1', hostname: 'shop.example.com' },
    });
    expect(store().siteAllowed()).toBe(false);
    await expect(store().allowSite()).resolves.toBe(true);
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://shop.example.com/*'],
    });
    expect(store().allowedSites).toEqual(['https://shop.example.com/*']);
    expect(store().siteAllowed()).toBe(true);
  });

  it('AC-F25.7 the permission request runs synchronously inside the click', () => {
    useStore.setState({
      tab: { id: 7, url: 'https://shop.example.com/', hostname: 'shop.example.com' },
    });
    store().allowSite();
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    store().toggleAdvanced(true);
    expect(chrome.permissions.request).toHaveBeenLastCalledWith({ permissions: ['debugger'] });
  });

  it('AC-F25.8 Settings removes an allowed site', async () => {
    chrome.permissionsGranted.origins.add('https://shop.example.com/*');
    await store().refreshPermissions();
    expect(store().allowedSites).toEqual(['https://shop.example.com/*']);
    await store().removeSite('https://shop.example.com/*');
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://shop.example.com/*'],
    });
    expect(store().allowedSites).toEqual([]);
  });
});

describe('edit log', () => {
  it('AC-F6.6 edits append to the log and autosave', async () => {
    const record = await extractNew();
    const [a, b] = record.edited.colors;
    expect(store().edit({ kind: 'rename', tokenId: a.id, name: 'my-brand' }).ok).toBe(true);
    expect(store().edit({ kind: 'exclude', tokenId: b.id }).ok).toBe(true);
    expect(store().edit({ kind: 'rename', tokenId: 'color:#000001', name: 'x' }).ok).toBe(false);
    expect(store().record.edits).toEqual([
      { kind: 'rename', tokenId: a.id, name: 'my-brand' },
      { kind: 'exclude', tokenId: b.id },
    ]);
    flushPendingSave();
    await vi.waitFor(async () => expect((await getSnapshot(record.id)).edits).toHaveLength(2));
  });

  it('AC-F13.5 setRole records the mode being viewed', async () => {
    const record = await extractNew();
    useStore.setState({ mode: 'dark' });
    store().edit({ kind: 'setRole', tokenId: record.edited.colors[0].id, role: 'accent' });
    expect(store().record.edits.at(-1)).toMatchObject({
      kind: 'setRole',
      role: 'accent',
      mode: 'dark',
    });
  });

  it('AC-F25.5 stale edits are counted after re-analysis and can be cleared', async () => {
    const record = await extractNew();
    const colorId = record.edited.colors[0].id;
    const stale = { kind: 'rename', tokenId: 'color:#123457', name: 'gone' };
    const kept = { kind: 'rename', tokenId: colorId, name: 'my-brand' };
    useStore.setState({ record: { ...record, edits: [kept, stale] } });
    await store().extract({ intent: 'rerun' });
    expect(store().record.staleEdits).toBe(1);
    expect(store().record.edits).toEqual([kept, stale]);
    store().clearStaleEdits();
    expect(store().record.edits).toEqual([kept]);
    expect(store().record.staleEdits).toBe(0);
    expect(store().record.edited.colors.find((c) => c.id === colorId).name).toBe('my-brand');
  });

  it('AC-F6.5 Reset to extracted clears the edit log', async () => {
    const record = await extractNew();
    store().edit({ kind: 'rename', tokenId: record.edited.colors[0].id, name: 'my-brand' });
    store().resetToExtracted();
    expect(store().record.edits).toEqual([]);
    expect(store().record.staleEdits).toBe(0);
    expect(store().record.edited).toEqual(store().record.extracted);
    expect(store().record.edited).not.toBe(store().record.extracted);
    flushPendingSave();
    await vi.waitFor(async () => expect((await getSnapshot(record.id)).edits).toEqual([]));
  });
});

describe('export and settings', () => {
  it('AC-F7.6 export selection toggles and persists', async () => {
    await store().loadSettings();
    const before = store().settings.exportSelection;
    expect(before).toContain('dtcg');
    await store().toggleExportSelection('dtcg');
    expect(store().settings.exportSelection).not.toContain('dtcg');
    await store().toggleExportSelection('screenshots');
    expect(store().settings.exportSelection).toContain('screenshots');
    expect((await getSettings()).exportSelection).toEqual(store().settings.exportSelection);
    await store().toggleExportSelection('dtcg');
    expect(store().settings.exportSelection).toContain('dtcg');
  });

  it('AC-F7.7 the last export format persists', async () => {
    await store().setExportFormat('tailwind-v4');
    expect(store().exportFormat).toBe('tailwind-v4');
    expect((await getSettings()).lastExportFormat).toBe('tailwind-v4');
    resetStore();
    await store().loadSettings();
    expect(store().exportFormat).toBe('tailwind-v4');
  });

  it('exportText renders the chosen format from the edited copy', async () => {
    const record = await extractNew();
    store().edit({ kind: 'rename', tokenId: record.edited.colors[0].id, name: 'my-brand' });
    expect(store().exportText('design-md')).toMatch(/^# Design system: 127\.0\.0\.1/);
    expect(store().exportText('css-vars')).toContain('--color-my-brand');
  });

  it('settings updates are normalized and saved; capture switches follow them', async () => {
    await store().updateSettings({ panelTheme: 'light', autoScroll: 1, shadcnFormat: 'rgb' });
    expect(store().settings).toMatchObject({
      panelTheme: 'light',
      autoScroll: true,
      shadcnFormat: 'oklch',
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ settings: store().settings });
    await store().updateSettings({ includeScreenshots: true });
    await store().loadSettings();
    expect(store().capture).toEqual({ autoScroll: true, advanced: false, screenshots: true });
  });

  it('AC-F42.5 the panel theme choice persists in Settings', async () => {
    await store().updateSettings({ panelTheme: 'dark' });
    resetStore();
    expect(store().settings.panelTheme).toBe('system');
    await store().loadSettings();
    expect(store().settings.panelTheme).toBe('dark');
  });
});

describe('toasts and dialogs', () => {
  it('AC-F23.1 a declined debugger permission shows DEBUGGER_DENIED and leaves Advanced off', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    await expect(store().toggleAdvanced(true)).resolves.toBe(false);
    expect(store().capture.advanced).toBe(false);
    expect(store().toasts.at(-1)).toMatchObject({
      kind: 'DEBUGGER_DENIED',
      text: 'Advanced capture needs permission to use Chrome’s debugger. Basic extraction still works.'.replace(
        '’',
        "'",
      ),
    });
  });

  it('AC-F23.1 a granted debugger permission turns Advanced on and remembers it', async () => {
    await expect(store().toggleAdvanced(true)).resolves.toBe(true);
    expect(store().capture.advanced).toBe(true);
    expect(store().debuggerGranted).toBe(true);
    await vi.waitFor(async () => expect((await getSettings()).advancedEnabled).toBe(true));
    await store().revokeDebugger();
    expect(store().capture.advanced).toBe(false);
    expect(chrome.permissions.remove).toHaveBeenCalledWith({ permissions: ['debugger'] });
  });

  it('AC-F25.7 a declined site permission shows SITE_ACCESS_DENIED', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    useStore.setState({
      tab: { id: 7, url: 'https://shop.example.com/', hostname: 'shop.example.com' },
    });
    await expect(store().allowSite()).resolves.toBe(false);
    expect(store().toasts.at(-1)).toMatchObject({
      kind: 'SITE_ACCESS_DENIED',
      text: 'Without access to this site, click the toolbar icon on each page instead.',
    });
  });

  it('AC-F40.3 an invalid import opens a dialog with the first problem', async () => {
    await store().importFile({ text: async () => '{not json' });
    expect(store().dialog).toMatchObject({ kind: 'import-error', code: 'IMPORT_INVALID' });
    expect(store().dialog.problem).toMatch(/JSON/);
    await store().importFile({
      text: async () =>
        JSON.stringify({
          format: 'webstyle-snapshots',
          version: 2,
          exportedAt: 1,
          snapshots: [{}],
        }),
    });
    expect(store().dialog).toMatchObject({ kind: 'import-error', code: 'IMPORT_INVALID' });
    expect(store().dialog.problem).toMatch(/^snapshots\.0/);
  });

  it('AC-F40.4 a newer file opens the IMPORT_TOO_NEW dialog', async () => {
    await store().importFile({
      text: async () =>
        JSON.stringify({ format: 'webstyle-snapshots', version: 3, exportedAt: 1, snapshots: [] }),
    });
    expect(store().dialog).toMatchObject({ kind: 'import-error', code: 'IMPORT_TOO_NEW' });
  });

  it('AC-F40.6 importing an exported snapshot with an existing id saves a copy', async () => {
    const record = await extractNew();
    const { exportSnapshots } = await import('../../../src/io/index.js');
    const text = exportSnapshots([await getSnapshot(record.id)]);
    await store().importFile({ text: async () => text });
    expect(store().dialog).toBeNull();
    const list = await listSnapshots();
    expect(list).toHaveLength(2);
    expect(list.some((s) => s.title.endsWith(' (imported)'))).toBe(true);
    expect(store().toasts.at(-1).kind).toBe('IMPORTED');
  });

  it('shows the one-time migration notice with the migrated and dropped counts', async () => {
    await seedV1Database([v1Record('a'), v1Record('b', { capturedAt: Date.UTC(2026, 5, 2) })]);
    await store().init();
    const notice = store().toasts.find((x) => x.kind === 'MIGRATED');
    expect(notice.text).toBe(t('migration_notice', 2, 2));
    expect(notice.text).toMatch(/^Upgraded 2 snapshots/);
    expect(store().history.map((h) => h.id)).toEqual(['b', 'a']);
    resetStore();
    await store().init();
    expect(store().toasts.find((x) => x.kind === 'MIGRATED')).toBeUndefined();
  });
});

describe('element picker (F26)', () => {
  beforeEach(async () => {
    useStore.setState({ tab: { id: 7, url: PAGE_1, hostname: '127.0.0.1' } });
  });

  it('AC-F26.3 Pick element shows the picking screen and sends PICK_START', async () => {
    store().startPick();
    expect(store().screen).toBe('picking');
    await vi.waitFor(() =>
      expect(sw.ofType('PICK_START')).toEqual([{ type: 'PICK_START', tabId: 7 }]),
    );
    store().pickKey('ArrowUp');
    await vi.waitFor(() =>
      expect(sw.ofType('PICK_KEY')).toEqual([{ type: 'PICK_KEY', tabId: 7, key: 'ArrowUp' }]),
    );
    expect(store().screen).toBe('picking');
  });

  it('AC-F26.1 PICK_HOVER updates the current element', () => {
    store().startPick();
    store().onPickerMessage({ type: 'PICK_HOVER', tag: 'button', width: 120.4, height: 36 });
    expect(store().picking).toEqual({ tag: 'button', width: 120.4, height: 36 });
  });

  it('AC-F26.3 PICK_CANCELLED returns to the previous screen without a message', () => {
    useStore.setState({ screen: 'results', record: { id: 'x' } });
    store().startPick();
    store().onPickerMessage({ type: 'PICK_CANCELLED' });
    expect(store().screen).toBe('results');
    expect(store().picking).toBeNull();
    expect(store().toasts).toEqual([]);
  });

  it('AC-F26.4 cancelling from the panel sends PICK_STOP', async () => {
    store().startPick();
    store().cancelPick();
    expect(store().screen).toBe('home');
    await vi.waitFor(() =>
      expect(sw.ofType('PICK_STOP')).toEqual([{ type: 'PICK_STOP', tabId: 7 }]),
    );
  });

  it('AC-F26.7 PICK_RESULT runs a component extraction and saves a component snapshot', async () => {
    store().startPick();
    store().onPickerMessage({
      type: 'PICK_RESULT',
      selector: '#hero > button',
      rect: {},
      tag: 'button',
      role: 'button',
    });
    await vi.waitFor(() => expect(store().screen).toBe('results'));
    expect(sw.ofType('EXTRACT')[0]).toMatchObject({
      intent: 'component',
      rootSelector: '#hero > button',
    });
    expect(store().record.kind).toBe('component');
  });

  it('ignores picker messages when not picking, and malformed results', () => {
    store().onPickerMessage({ type: 'PICK_RESULT', selector: '#x' });
    expect(store().run).toBeNull();
    store().startPick();
    store().onPickerMessage({ type: 'PICK_RESULT', selector: 42 });
    expect(store().run).toBeNull();
    store().onPickerMessage(null);
    expect(store().screen).toBe('picking');
  });

  it('picker messages reach the store through runtime.onMessage after init', async () => {
    await store().init();
    store().startPick();
    chrome.runtime.onMessage.emit(
      { type: 'PICK_HOVER', tag: 'a', width: 10, height: 10 },
      {},
      () => {},
    );
    expect(store().picking.tag).toBe('a');
  });

  it('AC-F26.4 PICK_FAILED shows a toast and returns to the previous screen', async () => {
    handlers.PICK_START = () => ({ type: 'EXTRACT_ERROR', code: 'PICK_FAILED' });
    store().startPick();
    await vi.waitFor(() => expect(store().screen).toBe('home'));
    expect(store().toasts.at(-1)).toMatchObject({
      kind: 'PICK_FAILED',
      text: "Couldn't start the element picker on this page.",
    });
  });
});

describe('highlight (F30)', () => {
  let tokenId;
  beforeEach(async () => {
    const record = await extractNew();
    tokenId = record.edited.colors[0].id;
    useStore.setState({ tab: { id: 7, url: PAGE_1, hostname: '127.0.0.1' } });
  });

  it('AC-F30.3 shows the match count and AC-F30.5 clears on a second click', async () => {
    await store().highlightToken(tokenId);
    const [show] = sw.ofType('HIGHLIGHT_SHOW');
    expect(show).toMatchObject({ tabId: 7, tokenId, match: { property: 'color' } });
    expect(store().highlight).toEqual({ tokenId, count: 3 });
    await store().highlightToken(tokenId);
    expect(store().highlight).toBeNull();
    await vi.waitFor(() =>
      expect(sw.ofType('HIGHLIGHT_CLEAR')).toEqual([{ type: 'HIGHLIGHT_CLEAR', tabId: 7 }]),
    );
  });

  it('AC-F30.5 leaving Results clears the outlines', async () => {
    await store().highlightToken(tokenId);
    store().goHome();
    expect(store().highlight).toBeNull();
    await vi.waitFor(() => expect(sw.ofType('HIGHLIGHT_CLEAR')).toHaveLength(1));
  });

  it('AC-F30.8 no visible match shows HIGHLIGHT_EMPTY', async () => {
    handlers.HIGHLIGHT_SHOW = (msg) => ({
      type: 'HIGHLIGHT_COUNT',
      count: 0,
      tokenId: msg.tokenId,
    });
    await store().highlightToken(tokenId);
    expect(store().highlight).toBeNull();
    expect(store().toasts.at(-1)).toMatchObject({
      kind: 'HIGHLIGHT_EMPTY',
      text: 'No matching elements are visible on this page.',
    });
  });

  it('AC-F30.7 missing access shows the toolbar-icon hint', async () => {
    handlers.HIGHLIGHT_SHOW = (msg) => ({
      type: 'HIGHLIGHT_COUNT',
      count: 0,
      error: 'NO_ACCESS',
      tokenId: msg.tokenId,
    });
    await store().highlightToken(tokenId);
    expect(store().toasts.at(-1)).toMatchObject({
      kind: 'HIGHLIGHT_NO_ACCESS',
      text: t('toast_highlight_no_access'),
    });
  });
});

/** Drops the store's port so the next request connects to the newest fake service worker. */
function resetPort() {
  const port = chrome.runtime.ports.at(-1);
  port.panel.onDisconnect.emit();
}

describe('panel port lifecycle', () => {
  it('dispose disconnects the port so the service worker cleans up', async () => {
    await extractNew();
    const pair = chrome.runtime.ports[0];
    expect(pair.isOpen()).toBe(true);
    store().dispose();
    expect(pair.panel.disconnect).toHaveBeenCalled();
    expect(pair.isOpen()).toBe(false);
  });

  it('reconnects after the service worker restarts', async () => {
    await extractNew();
    resetPort();
    useStore.setState({ screen: 'home' });
    await store().extract();
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(2);
    expect(store().screen).toBe('results');
  });

  it('opens the snapshot saved in history', async () => {
    const record = await extractNew();
    await saveSnapshot({ ...record, id: 'other', capturedAt: record.capturedAt - 1 });
    store().goHome();
    await store().openSnapshot('other');
    expect(store().record.id).toBe('other');
    expect(store().screen).toBe('results');
  });
});
