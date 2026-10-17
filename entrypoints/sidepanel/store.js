// Zustand store: all panel state and every action. Components read and change state only through
// this store; they never call chrome.* or storage directly.

import { create } from 'zustand';
import { applyEdit } from '../../src/edit/apply-edit.js';
import {
  ANALYZE_TIMEOUT_MS,
  MSG,
  PENDING_EXTRACT_KEY,
  PENDING_EXTRACT_MAX_AGE_MS,
  extractRequest,
} from '../../src/messaging.js';
import {
  extensionVersion,
  getActiveTab,
  onSessionChange,
  onActiveTabChange,
  openTab,
  sendToBackground,
  sessionGet,
  sessionRemove,
} from '../../src/platform/chrome.js';
import { errorMessage } from '../../src/platform/errors.js';
import {
  deleteAllSnapshots,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  makeRecord,
  saveSnapshot,
} from '../../src/storage/snapshots.js';
import { getSettings, setSettings } from '../../src/storage/settings.js';
import { downloadName, exportFile, exportZip, zipName } from '../../src/export/index.js';
import { S } from './strings.js';

export const AUTOSAVE_MS = 500;

let createWorker = () =>
  new Worker(new URL('../../src/analyze/worker.js', import.meta.url), { type: 'module' });

/** Test hook: replace the analysis worker. */
export function setWorkerFactory(factory) {
  createWorker = factory;
}

// Non-serializable handles for the current run and autosave live outside the state.
const runtime = { worker: null, timer: null, saveTimer: null, unsubscribers: [] };

const initialState = {
  screen: 'home', // home | extracting | results | history | state
  tab: null, // { id, url, hostname }
  run: null, // { requestId, stage, mode, tabId, snapshotId }
  failure: null, // { code, detail, url, retryMode }
  record: null,
  resultsTab: 'colors',
  recent: [],
  history: [],
  historyLoaded: false,
  exportFormat: 'design-md',
  toasts: [],
  announcement: '',
  version: '0.0.0',
};

export const useStore = create((set, get) => ({
  ...initialState,

  async init() {
    let version = '0.0.0';
    try {
      version = extensionVersion();
    } catch {
      // Outside the extension, for example in component tests.
    }
    set({ version });
    await Promise.all([get().refreshTab(), get().loadRecent(), loadFormat(set)]);
    runtime.unsubscribers.push(
      onSessionChange(PENDING_EXTRACT_KEY, (value) => value && get().consumePending(value)),
      onActiveTabChange(() => get().refreshTab()),
    );
    const pending = await sessionGet(PENDING_EXTRACT_KEY).catch(() => undefined);
    if (pending) await get().consumePending(pending);
  },

  dispose() {
    for (const off of runtime.unsubscribers.splice(0)) off();
    stopRun();
    flushSave(get);
  },

  async refreshTab() {
    const tab = await getActiveTab().catch(() => undefined);
    set({ tab: tab ? describeTab(tab) : null });
  },

  /** Handles the shortcut flag set by the service worker (sequence flow 4). */
  async consumePending(pending) {
    await sessionRemove(PENDING_EXTRACT_KEY).catch(() => {});
    if (!pending || Date.now() - pending.at > PENDING_EXTRACT_MAX_AGE_MS) return;
    await get().extract({ mode: 'new', tabId: pending.tabId });
  },

  /**
   * Starts a run. mode 'new' creates a snapshot; 'rerun' replaces the open one (AC-F1.13).
   * Returns immediately when a run is already in progress (AC-F1.3).
   */
  async extract({ mode = 'new', tabId } = {}) {
    if (get().run) return;
    const requestId = crypto.randomUUID();
    const snapshotId = mode === 'rerun' && get().record ? get().record.id : null;
    set({
      run: { requestId, stage: 'reading', mode, snapshotId },
      screen: 'extracting',
      failure: null,
    });
    announce(set, S.progressNow(S.progress.reading));

    const current = () => get().run?.requestId === requestId;
    let targetId = tabId;
    let targetUrl;
    try {
      if (targetId === undefined) {
        const tab = await getActiveTab();
        targetId = tab?.id;
        targetUrl = tab?.url;
      }
      if (targetId === undefined) throw new Error('No active tab');
      if (tabId !== undefined) await get().refreshTab();
      const reply = await sendToBackground(extractRequest(targetId));
      if (!current()) return;
      if (!reply || reply.type !== MSG.SNAPSHOT) {
        fail(set, get, reply?.code ?? 'INJECTION_FAILED', reply?.detail, targetUrl, mode);
        return;
      }
      set({ run: { ...get().run, stage: 'analyzing' } });
      announce(set, S.progressNow(S.progress.analyzing));
      const design = await analyzeInWorker(requestId, reply.raw);
      if (!current()) return;

      set({ run: { ...get().run, stage: 'saving' } });
      announce(set, S.progressNow(S.progress.saving));
      const record = makeRecord(reply.raw, design, snapshotId ?? crypto.randomUUID());
      try {
        await saveSnapshot(record);
      } catch {
        get().toast('STORAGE_FAILED');
      }
      if (!current()) return;
      set({ record, screen: 'results', resultsTab: 'colors', run: null });
      announce(set, record.hostname);
      await get().loadRecent();
    } catch (error) {
      if (!current()) return;
      const code = error?.code === 'ANALYSIS_FAILED' ? 'ANALYSIS_FAILED' : 'INJECTION_FAILED';
      fail(set, get, code, errorMessage(error), targetUrl, mode);
    }
  },

  cancel() {
    stopRun();
    set({ run: null, screen: get().record && get().run?.mode === 'rerun' ? 'results' : 'home' });
  },

  retry() {
    const mode = get().failure?.retryMode ?? 'new';
    set({ failure: null });
    return get().extract({ mode });
  },

  goHome() {
    flushSave(get);
    set({ screen: 'home', failure: null });
    get().refreshTab();
    get().loadRecent();
  },

  setResultsTab(resultsTab) {
    set({ resultsTab });
  },

  async loadRecent() {
    try {
      const all = await listSnapshots();
      set({ recent: all.slice(0, 3), history: all, historyLoaded: true });
    } catch {
      set({ recent: [], historyLoaded: true });
    }
  },

  async openHistory() {
    flushSave(get);
    set({ screen: 'history' });
    await get().loadRecent();
  },

  async openSnapshot(id) {
    flushSave(get);
    const record = await getSnapshot(id).catch(() => undefined);
    if (!record) return;
    set({ record, screen: 'results', resultsTab: 'colors' });
  },

  async deleteSnapshot(id) {
    await deleteSnapshot(id).catch(() => get().toast('STORAGE_FAILED'));
    if (get().record?.id === id) {
      clearTimeout(runtime.saveTimer);
      runtime.saveTimer = null;
      set({ record: null, screen: get().screen === 'results' ? 'home' : get().screen });
    }
    await get().loadRecent();
  },

  async deleteAll() {
    await deleteAllSnapshots().catch(() => get().toast('STORAGE_FAILED'));
    clearTimeout(runtime.saveTimer);
    runtime.saveTimer = null;
    set({ record: null });
    await get().loadRecent();
  },

  /** Applies an edit to the edited copy and schedules the autosave (AC-F6.6, AC-F6.7). */
  edit(edit) {
    const record = get().record;
    if (!record) return { ok: false, error: 'NOT_FOUND' };
    const result = applyEdit(record.edited, edit);
    if (!result.ok) return result;
    set({ record: { ...record, edited: result.design } });
    scheduleSave(get);
    return result;
  },

  resetToExtracted() {
    const record = get().record;
    if (!record) return;
    set({ record: { ...record, edited: structuredClone(record.extracted) } });
    scheduleSave(get);
  },

  async setExportFormat(exportFormat) {
    set({ exportFormat });
    await setSettings({ lastExportFormat: exportFormat }).catch(() => {});
  },

  exportText(format = get().exportFormat) {
    const record = get().record;
    return record ? exportFile(format, record.edited, get().version) : '';
  },

  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      get().toast('COPIED');
    } catch {
      get().toast('CLIPBOARD_FAILED');
    }
  },

  downloadCurrent() {
    const record = get().record;
    if (!record) return;
    const format = get().exportFormat;
    saveBlob(
      new Blob([get().exportText(format)], { type: 'text/plain' }),
      downloadName(record.edited, format),
    );
  },

  downloadAll() {
    const record = get().record;
    if (!record) return;
    saveBlob(
      new Blob([exportZip(record.edited, get().version)], { type: 'application/zip' }),
      zipName(record.edited),
    );
  },

  openShortcuts() {
    openTab('chrome://extensions/shortcuts').catch(() => {});
  },

  openUrl(url) {
    openTab(url).catch(() => {});
  },

  /** kind: COPIED, STORAGE_FAILED or CLIPBOARD_FAILED */
  toast(kind) {
    const id = crypto.randomUUID();
    const text = kind === 'COPIED' ? S.copied : S.toasts[kind];
    set({
      toasts: [...get().toasts, { id, kind, text, duration: kind === 'COPIED' ? 1500 : 4000 }],
    });
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  /** Text for Copy details: code, Chrome's message, version and URL; never page content. */
  failureDetails() {
    const f = get().failure;
    if (!f) return '';
    return [
      `Error: ${f.code}`,
      `Message: ${f.detail ?? 'none'}`,
      `Version: ${get().version}`,
      `URL: ${f.url ?? get().tab?.url ?? 'unknown'}`,
    ].join('\n');
  },
}));

async function loadFormat(set) {
  const settings = await getSettings();
  set({ exportFormat: settings.lastExportFormat });
}

function describeTab(tab) {
  let hostname = null;
  try {
    if (tab.url) hostname = new URL(tab.url).hostname || null;
  } catch {
    hostname = null;
  }
  return { id: tab.id, url: tab.url ?? null, hostname };
}

function announce(set, text) {
  set({ announcement: text });
}

function fail(set, get, code, detail, url, mode) {
  stopRun();
  set({
    run: null,
    screen: 'state',
    failure: { code, detail, url: url ?? get().tab?.url, retryMode: mode },
  });
  announce(set, S.states[code]?.title ?? code);
}

function stopRun() {
  clearTimeout(runtime.timer);
  runtime.timer = null;
  if (runtime.worker) {
    runtime.worker.terminate();
    runtime.worker = null;
  }
}

/** Runs analysis in a fresh worker that is terminated afterwards (sequence flow 3). */
function analyzeInWorker(requestId, raw) {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    runtime.worker = worker;
    const failWith = (detail) => {
      stopRun();
      reject(Object.assign(new Error(detail), { code: 'ANALYSIS_FAILED' }));
    };
    runtime.timer = setTimeout(() => failWith('Analysis timed out'), ANALYZE_TIMEOUT_MS);
    worker.onmessage = (event) => {
      const message = event.data;
      // Messages from a cancelled or older run are ignored.
      if (!message || message.requestId !== requestId) return;
      if (message.type === MSG.RESULT) {
        stopRun();
        resolve(message.design);
      } else if (message.type === MSG.ERROR) {
        failWith(message.detail);
      }
    };
    worker.onerror = (event) => failWith(event?.message ?? 'Worker error');
    worker.postMessage({ type: MSG.ANALYZE, requestId, raw });
  });
}

function scheduleSave(get) {
  clearTimeout(runtime.saveTimer);
  runtime.saveTimer = setTimeout(() => {
    runtime.saveTimer = null;
    persist(get);
  }, AUTOSAVE_MS);
}

/** Writes a pending autosave now, for example when the panel is hidden. */
function flushSave(get) {
  if (!runtime.saveTimer) return;
  clearTimeout(runtime.saveTimer);
  runtime.saveTimer = null;
  persist(get);
}

export function flushPendingSave() {
  flushSave(useStore.getState);
}

function persist(get) {
  const record = get().record;
  if (record) saveSnapshot(record).catch(() => get().toast('STORAGE_FAILED'));
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Test hook: reset state between tests. */
export function resetStore() {
  stopRun();
  clearTimeout(runtime.saveTimer);
  runtime.saveTimer = null;
  for (const off of runtime.unsubscribers.splice(0)) off();
  useStore.setState({ ...initialState });
}
