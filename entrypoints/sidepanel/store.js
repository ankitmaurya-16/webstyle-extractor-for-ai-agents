// Zustand store: all panel state and every action. Components read and change state only through
// this store; they never call chrome.* or storage directly.

import { create } from 'zustand';
import { applyEdit } from '../../src/edit/apply-edit.js';
import {
  ANALYZE_TIMEOUT_MS,
  MSG,
  PANEL_PORT,
  PENDING_EXTRACT_KEY,
  PENDING_EXTRACT_MAX_AGE_MS,
  extractRequest,
} from '../../src/messaging.js';
import {
  connectPanelPort,
  extensionVersion,
  getActiveTab,
  getAllPermissions,
  getTab,
  isFirefox,
  onActiveTabChange,
  onRuntimeMessage,
  onSessionChange,
  openTab,
  originPattern,
  removePermissions,
  requestPermissions,
  sessionGet,
  sessionRemove,
} from '../../src/platform/chrome.js';
import { errorMessage } from '../../src/platform/errors.js';
import {
  base64ToBlob,
  blobToBytes,
  blobToDataUrl,
  cropScreenshots,
} from '../../src/platform/screenshots.js';
import {
  deleteAllSnapshots,
  deleteProject,
  deleteSnapshot,
  getScreenshots,
  getSnapshot,
  listProjects,
  listSnapshots,
  makeRecord,
  saveProject,
  saveScreenshots,
  saveSnapshot,
  takeMigrationNotice,
} from '../../src/storage/snapshots.js';
import { getSettings, normalizeSettings, setSettings } from '../../src/storage/settings.js';
import {
  downloadName,
  exportFile,
  exportFiles,
  exportZip,
  zipName,
} from '../../src/export/index.js';
import { buildOverrideRaw } from '../../src/analyze/themes.js';
import { planStages } from '../../src/advanced/plan.js';
import { primaryModeOf } from '../../src/model/design.js';
import { highlightMatch } from '../../src/model/highlight.js';
import { sameSite } from '../../src/model/site.js';
import { exportSnapshots, exportFileName, importSnapshots } from '../../src/io/index.js';
import { exportDiffMd } from '../../src/diff/diff-md.js';
import { exportMappingMd } from '../../src/mapping/mapping-md.js';
import {
  defaultFileMap,
  ensurePermission,
  fileSystemSupported,
  mapFiles,
  writeToProject,
} from '../../src/project/index.js';
import { t } from '../../src/i18n.js';

export const AUTOSAVE_MS = 500;
export const MAX_PAGES = 20;
export const SOURCE_URL = 'https://github.com/ankitmaurya-16/webstyle-extractor-for-ai-agents';

let createWorker = () =>
  new Worker(new URL('../../src/analyze/worker.js', import.meta.url), { type: 'module' });

/** Test hook: replace the analysis worker. */
export function setWorkerFactory(factory) {
  createWorker = factory;
}

// Non-serializable handles live outside the state: the port, pending replies, the worker, timers,
// directory handles and screenshot object URLs.
const runtime = {
  port: null,
  pending: new Map(),
  worker: null,
  timer: null,
  saveTimer: null,
  starting: false,
  unsubscribers: [],
  objectUrls: [],
};

const TOAST_KEYS = {
  COPIED: 'copied',
  STORAGE_FAILED: 'toast_storage_failed',
  CLIPBOARD_FAILED: 'toast_clipboard_failed',
  DEBUGGER_DENIED: 'toast_debugger_denied',
  SITE_ACCESS_DENIED: 'toast_site_access_denied',
  PICK_FAILED: 'toast_pick_failed',
  HIGHLIGHT_EMPTY: 'toast_highlight_empty',
  HIGHLIGHT_NO_ACCESS: 'toast_highlight_no_access',
  FS_PERMISSION_DENIED: 'toast_fs_permission_denied',
  TOO_MANY_PAGES: 'toast_too_many_pages',
};

const initialState = {
  screen: 'home', // home | extracting | results | history | state | settings | picking | diff | map
  returnScreen: 'home',
  tab: null, // { id, url, hostname }
  settings: normalizeSettings(null),
  capture: { autoScroll: false, advanced: false, screenshots: false },
  debuggerGranted: false,
  allowedSites: [],
  projects: [],
  run: null, // { requestId, intent, stage, stages, snapshotId, tabId }
  failure: null, // { code, detail, url, retry }
  record: null,
  mode: 'light',
  resultsTab: 'colors',
  screenshots: [], // [{ recipeId, mode, url }]
  dismissed: {}, // banner ids per snapshot
  recent: [],
  history: [],
  historyLoaded: false,
  exportFormat: 'design-md',
  toasts: [],
  dialog: null, // { kind, ... }
  picking: null, // { tag, width, height } while the picker runs
  highlight: null, // { tokenId, count }
  diff: null, // { a, b, result }
  announcement: '',
  version: '0.0.0',
  firefox: false,
  fsSupported: false,
  sortLowFirst: false, // "Low confidence first" on the token lists (AC-F28.5)
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
    set({ version, firefox: isFirefox(), fsSupported: !isFirefox() && fileSystemSupported() });
    await Promise.all([
      get().refreshTab(),
      get().loadRecent(),
      get().loadSettings(),
      get().refreshPermissions(),
      get().loadProjects(),
    ]);
    try {
      runtime.unsubscribers.push(
        onSessionChange(PENDING_EXTRACT_KEY, (value) => value && get().consumePending(value)),
        onActiveTabChange(() => get().refreshTab()),
        onRuntimeMessage((message) => get().onPickerMessage(message)),
      );
    } catch {
      // No chrome.* in component tests.
    }
    const notice = await takeMigrationNotice().catch(() => null);
    if (notice)
      get().toast('MIGRATED', t('migration_notice', notice.snapshots, notice.droppedEdits));
    const pending = await sessionGet(PENDING_EXTRACT_KEY).catch(() => undefined);
    if (pending) await get().consumePending(pending);
  },

  dispose() {
    for (const off of runtime.unsubscribers.splice(0)) off();
    stopWorker();
    flushSave(get);
    runtime.port?.disconnect();
    runtime.port = null;
  },

  async refreshTab() {
    const tab = await getActiveTab().catch(() => undefined);
    set({ tab: tab ? describeTab(tab) : null });
  },

  async loadSettings() {
    const settings = await getSettings();
    set({
      settings,
      exportFormat: settings.lastExportFormat,
      capture: {
        autoScroll: settings.autoScroll,
        advanced: settings.advancedEnabled,
        screenshots: settings.includeScreenshots,
      },
    });
  },

  async updateSettings(patch) {
    const settings = await setSettings(patch).catch(() =>
      normalizeSettings({ ...get().settings, ...patch }),
    );
    set({ settings });
    return settings;
  },

  async refreshPermissions() {
    try {
      const all = await getAllPermissions();
      set({
        debuggerGranted: (all.permissions ?? []).includes('debugger'),
        allowedSites: (all.origins ?? []).filter((o) => o !== 'https://*/*' && o !== 'http://*/*'),
      });
    } catch {
      set({ debuggerGranted: false, allowedSites: [] });
    }
  },

  async loadProjects() {
    const projects = await listProjects().catch(() => []);
    set({ projects });
  },

  // ---------------------------------------------------------------- capture options (Home)

  setCapture(patch) {
    set({ capture: { ...get().capture, ...patch } });
  },

  /** Turning Advanced capture on asks for the debugger permission inside the click (AC-F23.1). */
  toggleAdvanced(on) {
    if (!on) {
      set({ capture: { ...get().capture, advanced: false } });
      return Promise.resolve(false);
    }
    if (get().debuggerGranted) {
      set({ capture: { ...get().capture, advanced: true } });
      return Promise.resolve(true);
    }
    return get()
      .grantDebugger()
      .then((granted) => {
        set({ capture: { ...get().capture, advanced: granted } });
        return granted;
      });
  },

  grantDebugger() {
    let request;
    try {
      request = requestPermissions({ permissions: ['debugger'] });
    } catch {
      request = Promise.resolve(false);
    }
    return request
      .then((granted) => {
        set({ debuggerGranted: Boolean(granted) });
        if (!granted) get().toast('DEBUGGER_DENIED');
        else get().updateSettings({ advancedEnabled: true });
        return Boolean(granted);
      })
      .catch(() => {
        get().toast('DEBUGGER_DENIED');
        return false;
      });
  },

  async revokeDebugger() {
    await removePermissions({ permissions: ['debugger'] }).catch(() => {});
    set({ debuggerGranted: false, capture: { ...get().capture, advanced: false } });
    await get().updateSettings({ advancedEnabled: false });
  },

  /** "Allow on this site" (F25): optional host access for one origin, inside the click. */
  allowSite(url = get().tab?.url) {
    const origin = originPattern(url);
    if (!origin) return Promise.resolve(false);
    let request;
    try {
      request = requestPermissions({ origins: [origin] });
    } catch {
      request = Promise.resolve(false);
    }
    return request
      .then(async (granted) => {
        if (!granted) get().toast('SITE_ACCESS_DENIED');
        await get().refreshPermissions();
        return Boolean(granted);
      })
      .catch(() => {
        get().toast('SITE_ACCESS_DENIED');
        return false;
      });
  },

  async removeSite(origin) {
    await removePermissions({ origins: [origin] }).catch(() => {});
    await get().refreshPermissions();
  },

  siteAllowed(url = get().tab?.url) {
    const origin = originPattern(url);
    return Boolean(origin && get().allowedSites.includes(origin));
  },

  // ---------------------------------------------------------------- extraction

  /** Handles the shortcut flag set by the service worker. */
  async consumePending(pending) {
    await sessionRemove(PENDING_EXTRACT_KEY).catch(() => {});
    if (!pending || Date.now() - pending.at > PENDING_EXTRACT_MAX_AGE_MS) return;
    await get().extract({ intent: 'new', tabId: pending.tabId });
  },

  /**
   * Starts a run (v2 spec 7.2). intent 'new' creates a snapshot; 'rerun' replaces the open one's
   * captures for this page; 'add-page' appends a page (F25); 'component' reads one picked
   * element (F26). Returns immediately when a run is already in progress.
   * @param {{intent?: string, tabId?: number, rootSelector?: string, advanced?: boolean, confirmed?: boolean}} [options]
   */
  async extract({ intent = 'new', tabId, rootSelector = null, advanced, confirmed = false } = {}) {
    // The tab lookup below awaits before `run` is set, so a synchronous flag keeps a double
    // click or a shortcut during the lookup from starting a second run (AC-F1.3).
    if (get().run || runtime.starting) return;
    const { capture, settings, debuggerGranted, record } = get();
    const useAdvanced =
      (advanced ?? capture.advanced) && debuggerGranted && !get().firefox && intent !== 'component';
    const options = {
      autoScroll: intent === 'component' ? false : capture.autoScroll,
      advanced: useAdvanced ? settings.advancedDefaults : null,
      screenshots: capture.screenshots,
    };

    let target;
    runtime.starting = true;
    try {
      target =
        tabId !== undefined ? await getTabSafe(tabId) : await getActiveTab().catch(() => undefined);
      if (tabId !== undefined && !target) target = { id: tabId };
      if (target?.id && tabId !== undefined) await get().refreshTab();
    } finally {
      runtime.starting = false;
    }
    if (!target?.id) {
      fail(set, get, 'NO_ACCESS', 'No active tab', undefined, { intent });
      return;
    }

    if (intent === 'add-page' && record) {
      if (record.pages.length >= MAX_PAGES) {
        get().toast('TOO_MANY_PAGES');
        return;
      }
      const host = describeTab(target).hostname;
      if (!confirmed && host && !sameSite(host, record.hostname)) {
        set({ dialog: { kind: 'cross-site', host, snapshotHost: record.hostname } });
        return;
      }
    }

    const requestId = crypto.randomUUID();
    const stages = [
      ...(options.autoScroll ? ['scrolling'] : []),
      'reading',
      ...(options.advanced ? advancedStages(options.advanced, target) : []),
      'analyzing',
      'saving',
    ];
    const snapshotId = (intent === 'rerun' || intent === 'add-page') && record ? record.id : null;
    set({
      run: {
        requestId,
        intent,
        stage: stages[0],
        stages,
        snapshotId,
        tabId: target.id,
        rootSelector,
      },
      returnScreen: get().screen === 'results' ? 'results' : 'home',
      screen: 'extracting',
      failure: null,
      picking: null,
    });
    announce(set, t('stage_now', stageLabel(stages[0])));
    const current = () => get().run?.requestId === requestId;

    try {
      const reply = await sendExtract(get, set, {
        ...extractRequest(target.id, { ...options, requestId, intent, snapshotId, rootSelector }),
      });
      if (!current()) return;
      if (!reply || reply.type !== MSG.CAPTURES) {
        fail(set, get, reply?.code ?? 'INJECTION_FAILED', reply?.detail, target.url, {
          intent,
          rootSelector,
        });
        return;
      }

      // Path A: the other theme from stylesheet overrides when emulation did not capture it.
      const captures = [...reply.captures];
      const base = captures.find((c) => c.kind === 'base');
      if (base && !captures.some((c) => c.kind === 'theme')) {
        const override = buildOverrideRaw(base.raw);
        if (override) {
          captures.push({
            ...base,
            id: crypto.randomUUID(),
            mode: base.mode === 'dark' ? 'light' : 'dark',
            method: 'stylesheet-override',
            kind: 'theme',
            raw: override,
          });
        }
      }

      const previous = snapshotId ? record : null;
      let allCaptures = captures;
      if (previous && intent === 'add-page') allCaptures = [...previous.captures, ...captures];
      if (previous && intent === 'rerun') {
        const pageUrl = base?.pageUrl;
        allCaptures = [...previous.captures.filter((c) => c.pageUrl !== pageUrl), ...captures];
      }
      const edits = previous?.edits ?? [];

      setStage(set, get, 'analyzing');
      const { extracted, edited, staleEdits } = await analyzeInWorker(
        requestId,
        allCaptures,
        edits,
        {
          useSiteVariableNames: settings.useSiteVariableNames,
          advanced: Boolean(options.advanced),
          deepScan: Boolean(options.advanced?.deepScan),
          partial: reply.warnings ?? [],
        },
      );
      if (!current()) return;

      setStage(set, get, 'saving');
      const id = snapshotId ?? crypto.randomUUID();
      const kind =
        intent === 'component'
          ? 'component'
          : previous?.kind === 'site' || intent === 'add-page'
            ? 'site'
            : 'page';
      const next = makeRecord({
        id,
        kind,
        captures: allCaptures,
        extracted,
        edited,
        edits,
        staleEdits,
        previous,
      });
      if (kind === 'component') next.rootSelector = rootSelector;
      if ((reply.warnings ?? []).length) next.captureWarnings = reply.warnings;
      if (options.screenshots && (reply.screenshots ?? []).length === 0)
        next.screenshotFailed = true;

      if ((reply.screenshots ?? []).length) {
        try {
          const shots = await cropScreenshots(reply.screenshots, edited.components, id);
          if (shots.length) {
            await saveScreenshots(shots);
            next.screenshotIds = [
              ...new Set([...(next.screenshotIds ?? []), ...shots.map((s) => s.id)]),
            ];
          }
        } catch {
          next.screenshotFailed = true;
        }
      }
      try {
        await saveSnapshot(next);
      } catch {
        get().toast('STORAGE_FAILED');
      }
      if (!current()) return;
      set({
        record: next,
        screen: 'results',
        resultsTab: 'colors',
        run: null,
        mode: primaryModeOf(next.edited),
      });
      await get().loadScreenshots();
      announce(set, next.hostname);
      await get().loadRecent();
    } catch (error) {
      if (!current()) return;
      const code = error?.code === 'ANALYSIS_FAILED' ? 'ANALYSIS_FAILED' : 'INJECTION_FAILED';
      fail(set, get, code, errorMessage(error), target.url, { intent, rootSelector });
    }
  },

  confirmCrossSite() {
    set({ dialog: null });
    return get().extract({ intent: 'add-page', confirmed: true });
  },

  onProgress(message) {
    const run = get().run;
    if (!run || message.requestId !== run.requestId) return;
    const stage = message.stage;
    if (!run.stages.includes(stage)) {
      // The list guessed the other theme; the service worker reports which one it captured.
      const other = stage === 'light' ? 'dark' : stage === 'dark' ? 'light' : null;
      if (!other || !run.stages.includes(other)) return;
      set({ run: { ...run, stages: run.stages.map((s) => (s === other ? stage : s)) } });
    }
    setStage(set, get, stage);
  },

  cancel() {
    const run = get().run;
    if (run) postPort(get, set, { type: MSG.CANCEL, requestId: run.requestId });
    stopWorker();
    set({
      run: null,
      screen:
        get().record && run?.intent !== 'new' && run?.intent !== 'component' ? 'results' : 'home',
    });
  },

  retry() {
    const retry = get().failure?.retry ?? { intent: 'new' };
    set({ failure: null });
    return get().extract(retry);
  },

  runBasic() {
    const retry = get().failure?.retry ?? { intent: 'new' };
    set({ failure: null });
    return get().extract({ ...retry, advanced: false });
  },

  goHome() {
    flushSave(get);
    clearHighlightNow(get, set);
    set({ screen: 'home', failure: null, diff: null });
    get().refreshTab();
    get().loadRecent();
  },

  goBack() {
    const screen = get().screen;
    if (screen === 'map') return set({ screen: 'results' });
    if (screen === 'diff')
      return set({ screen: get().diff?.from === 'results' ? 'results' : 'history', diff: null });
    if (screen === 'picking') return get().cancelPick();
    return get().goHome();
  },

  setResultsTab(resultsTab) {
    set({ resultsTab });
  },

  setMode(mode) {
    set({ mode });
  },

  setSortLowFirst(sortLowFirst) {
    set({ sortLowFirst: Boolean(sortLowFirst) });
  },

  dismissBanner(id) {
    const record = get().record;
    if (!record) return;
    const list = get().dismissed[record.id] ?? [];
    set({ dismissed: { ...get().dismissed, [record.id]: [...list, id] } });
  },

  closeDialog() {
    set({ dialog: null });
  },

  // ---------------------------------------------------------------- history

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
    clearHighlightNow(get, set);
    set({ screen: 'history' });
    await get().loadRecent();
  },

  async openSnapshot(id) {
    flushSave(get);
    const record = await getSnapshot(id).catch(() => undefined);
    if (!record) return;
    set({ record, screen: 'results', resultsTab: 'colors', mode: primaryModeOf(record.edited) });
    await get().loadScreenshots();
  },

  async loadScreenshots() {
    for (const url of runtime.objectUrls.splice(0)) URL.revokeObjectURL?.(url);
    const record = get().record;
    if (!record || !(record.screenshotIds ?? []).length) return set({ screenshots: [] });
    try {
      const rows = await getScreenshots(record.id);
      const screenshots = rows.map((r) => {
        const url = URL.createObjectURL(r.blob);
        runtime.objectUrls.push(url);
        return { recipeId: r.recipeId, mode: r.mode, url, width: r.width, height: r.height };
      });
      set({ screenshots });
    } catch {
      set({ screenshots: [] });
    }
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

  async deleteMany(ids) {
    for (const id of ids) await get().deleteSnapshot(id);
  },

  async deleteAll() {
    await deleteAllSnapshots().catch(() => get().toast('STORAGE_FAILED'));
    clearTimeout(runtime.saveTimer);
    runtime.saveTimer = null;
    set({ record: null });
    await get().loadRecent();
  },

  /** Removes one page from a site snapshot and re-analyzes; the last page stays (AC-F25.4). */
  async removePage(pageUrl) {
    const record = get().record;
    if (!record || record.pages.length <= 1 || get().run) return;
    const captures = record.captures.filter((c) => c.pageUrl !== pageUrl);
    const requestId = crypto.randomUUID();
    set({
      run: {
        requestId,
        intent: 'remove-page',
        stage: 'analyzing',
        stages: ['analyzing', 'saving'],
        snapshotId: record.id,
      },
      screen: 'extracting',
      returnScreen: 'results',
    });
    try {
      const { extracted, edited, staleEdits } = await analyzeInWorker(
        requestId,
        captures,
        record.edits,
        {
          useSiteVariableNames: get().settings.useSiteVariableNames,
        },
      );
      const next = makeRecord({
        id: record.id,
        kind: record.kind,
        captures,
        extracted,
        edited,
        edits: record.edits,
        staleEdits,
        previous: record,
      });
      await saveSnapshot(next).catch(() => get().toast('STORAGE_FAILED'));
      set({ record: next, run: null, screen: 'results' });
      await get().loadRecent();
    } catch (error) {
      fail(set, get, 'ANALYSIS_FAILED', errorMessage(error), record.url, { intent: 'rerun' });
    }
  },

  // ---------------------------------------------------------------- editing

  /** Applies an edit to the edited copy, appends it to the log and schedules the autosave. */
  edit(edit) {
    const record = get().record;
    if (!record) return { ok: false, error: 'NOT_FOUND' };
    const withMode =
      edit.kind === 'setRole' || edit.kind === 'clearRole' ? { mode: get().mode, ...edit } : edit;
    const result = applyEdit(record.edited, withMode);
    if (!result.ok) return result;
    set({
      record: { ...record, edited: result.design, edits: [...(record.edits ?? []), withMode] },
    });
    scheduleSave(get);
    return result;
  },

  resetToExtracted() {
    const record = get().record;
    if (!record) return;
    set({
      record: { ...record, edited: structuredClone(record.extracted), edits: [], staleEdits: 0 },
    });
    scheduleSave(get);
  },

  /** Drops edits that no longer apply to the current analysis (v2 spec 6.3). */
  clearStaleEdits() {
    const record = get().record;
    if (!record) return;
    let design = structuredClone(record.extracted);
    const kept = [];
    for (const edit of record.edits ?? []) {
      const result = applyEdit(design, edit);
      if (result.ok) {
        design = result.design;
        kept.push(edit);
      }
    }
    set({ record: { ...record, edits: kept, staleEdits: 0 } });
    scheduleSave(get);
  },

  // ---------------------------------------------------------------- export

  async setExportFormat(exportFormat) {
    set({ exportFormat });
    await get().updateSettings({ lastExportFormat: exportFormat });
  },

  async toggleExportSelection(format) {
    const current = get().settings.exportSelection;
    const exportSelection = current.includes(format)
      ? current.filter((f) => f !== format)
      : [...current, format];
    await get().updateSettings({ exportSelection });
  },

  exportContext() {
    const { record, settings } = get();
    return {
      mapping: record?.mapping ?? null,
      // A component snapshot exports only what the component uses (AC-F26.8).
      kind: record?.kind ?? 'page',
      shadcnFormat: settings.shadcnFormat,
      screenshots: get().screenshots.map((s) => ({ recipeId: s.recipeId, mode: s.mode })),
    };
  },

  exportText(format = get().exportFormat) {
    const record = get().record;
    return record ? exportFile(format, record.edited, get().version, get().exportContext()) : '';
  },

  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      get().toast('COPIED');
    } catch {
      get().toast('CLIPBOARD_FAILED');
    }
  },

  copyPrompt() {
    return get().copy(get().exportText('prompt'));
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

  async selectedFiles() {
    const { record, settings, version } = get();
    const includeScreenshots = settings.exportSelection.includes('screenshots');
    const ctx = get().exportContext();
    if (includeScreenshots) ctx.screenshots = await screenshotPayload(record.id, 'bytes');
    if (settings.exportSelection.includes('styleguide') && includeScreenshots) {
      ctx.screenshotData = await screenshotPayload(record.id, 'dataUrl');
    }
    const formats = settings.exportSelection.filter((f) => f !== 'screenshots');
    return {
      files: exportFiles(record.edited, version, { formats, ctx, includeScreenshots }),
      formats,
      ctx,
      includeScreenshots,
    };
  },

  async downloadAll() {
    const record = get().record;
    if (!record) return;
    const { formats, ctx, includeScreenshots } = await get().selectedFiles();
    saveBlob(
      new Blob([exportZip(record.edited, get().version, { formats, ctx, includeScreenshots })], {
        type: 'application/zip',
      }),
      zipName(record.edited),
    );
  },

  // ---------------------------------------------------------------- projects (F37)

  /** Links a folder. showDirectoryPicker must run inside the click, so nothing awaits first. */
  linkProject() {
    let picking;
    try {
      picking = globalThis.showDirectoryPicker({ mode: 'readwrite', id: 'webstyle-project' });
    } catch {
      return Promise.resolve(null);
    }
    return picking
      .then(async (handle) => {
        const project = {
          id: crypto.randomUUID(),
          name: handle.name,
          handle,
          fileMap: defaultFileMap(),
          lastWrittenAt: null,
        };
        await saveProject(project);
        await get().loadProjects();
        return project;
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') get().toast('FS_PERMISSION_DENIED');
        return null;
      });
  },

  async unlinkProject(id) {
    await deleteProject(id).catch(() => {});
    await get().loadProjects();
  },

  async updateFileMap(id, fileMap) {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    await saveProject({ ...project, fileMap });
    await get().loadProjects();
  },

  /** Writes the selected formats into a linked folder (AC-F37.3 to AC-F37.7). */
  writeProject(id) {
    const project = get().projects.find((p) => p.id === id);
    if (!project || !get().record) return Promise.resolve();
    // The permission request is the first call so it stays inside the click.
    return ensurePermission(project.handle)
      .then(async (granted) => {
        if (!granted) {
          get().toast('FS_PERMISSION_DENIED');
          return;
        }
        const { files } = await get().selectedFiles();
        const results = await writeToProject(project.handle, mapFiles(files, project.fileMap));
        await saveProject({ ...project, lastWrittenAt: Date.now() });
        await get().loadProjects();
        const failed = results.filter((r) => r.status === 'failed');
        set({
          dialog: {
            kind: failed.length ? 'write-failed' : 'write-summary',
            project: project.name,
            results,
          },
        });
      })
      .catch(() => get().toast('FS_PERMISSION_DENIED'));
  },

  // ---------------------------------------------------------------- import and export (F40)

  async exportSnapshotsToFile(ids, { includeScreenshots = false } = {}) {
    const records = [];
    for (const id of ids) {
      const record = await getSnapshot(id).catch(() => undefined);
      if (record) records.push(record);
    }
    if (!records.length) return;
    let screenshots;
    if (includeScreenshots) {
      screenshots = [];
      for (const r of records) {
        const rows = await getScreenshots(r.id).catch(() => []);
        for (const row of rows) {
          screenshots.push({
            snapshotId: r.id,
            id: row.id,
            recipeId: row.recipeId,
            mode: row.mode,
            base64: await blobToDataUrl(row.blob),
          });
        }
      }
    }
    saveBlob(
      new Blob([exportSnapshots(records, { screenshots })], { type: 'application/json' }),
      exportFileName(records),
    );
  },

  async importFile(file) {
    let text;
    try {
      text = await file.text();
    } catch {
      set({
        dialog: {
          kind: 'import-error',
          code: 'IMPORT_INVALID',
          problem: 'the file could not be read',
        },
      });
      return;
    }
    try {
      const existingIds = new Set(get().history.map((h) => h.id));
      const { snapshots, screenshots } = importSnapshots(text, { existingIds });
      for (const record of snapshots) await saveSnapshot(record);
      if (screenshots.length) {
        await saveScreenshots(
          screenshots.map((s) => ({
            snapshotId: s.snapshotId,
            id: s.id,
            recipeId: s.recipeId,
            mode: s.mode,
            state: 'default',
            blob: base64ToBlob(s.base64),
          })),
        );
      }
      await get().loadRecent();
      get().toast('IMPORTED', t('toast_imported', snapshots.length));
    } catch (error) {
      set({
        dialog: {
          kind: 'import-error',
          code: error?.code ?? 'IMPORT_INVALID',
          problem: error?.message ?? '',
        },
      });
    }
  },

  // ---------------------------------------------------------------- picker (F26)

  startPick() {
    const tab = get().tab;
    if (!tab?.id || get().run) return;
    set({
      returnScreen: get().screen === 'results' ? 'results' : 'home',
      screen: 'picking',
      picking: { tag: null, width: 0, height: 0 },
    });
    requestPort(
      get,
      set,
      { type: MSG.PICK_START, tabId: tab.id },
      (reply) => reply.type === MSG.PICK_READY || reply.type === MSG.EXTRACT_ERROR,
    ).then((reply) => {
      if (reply?.type === MSG.EXTRACT_ERROR) {
        set({ screen: get().returnScreen, picking: null });
        get().toast('PICK_FAILED');
      }
    });
  },

  pickKey(key) {
    const tab = get().tab;
    if (tab?.id) postPort(get, set, { type: 'PICK_KEY', tabId: tab.id, key });
  },

  cancelPick() {
    const tab = get().tab;
    if (tab?.id) postPort(get, set, { type: MSG.PICK_STOP, tabId: tab.id });
    set({ screen: get().returnScreen ?? 'home', picking: null });
  },

  onPickerMessage(message) {
    if (!message || typeof message !== 'object' || get().screen !== 'picking') return;
    if (message.type === MSG.PICK_HOVER)
      set({ picking: { tag: message.tag, width: message.width, height: message.height } });
    else if (message.type === MSG.PICK_CANCELLED)
      set({ screen: get().returnScreen ?? 'home', picking: null });
    else if (message.type === MSG.PICK_RESULT && typeof message.selector === 'string') {
      set({ picking: null });
      get().extract({ intent: 'component', rootSelector: message.selector, tabId: get().tab?.id });
    }
  },

  // ---------------------------------------------------------------- highlight (F30)

  async highlightToken(tokenId) {
    const { record, tab, highlight } = get();
    if (!record || !tab?.id) return;
    if (highlight?.tokenId === tokenId) return clearHighlightNow(get, set);
    const match = highlightMatch(record.edited, tokenId);
    if (!match) return;
    const reply = await requestPort(
      get,
      set,
      { type: MSG.HIGHLIGHT_SHOW, tabId: tab.id, tokenId, match },
      (r) => r.type === MSG.HIGHLIGHT_COUNT && r.tokenId === tokenId,
    );
    if (!reply) return;
    if (reply.error && reply.error !== 'INJECTION_FAILED') {
      get().toast('HIGHLIGHT_NO_ACCESS');
      return;
    }
    if (!reply.count) {
      get().toast('HIGHLIGHT_EMPTY');
      set({ highlight: null });
      return;
    }
    set({ highlight: { tokenId, count: reply.count } });
  },

  clearHighlight() {
    clearHighlightNow(get, set);
  },

  // ---------------------------------------------------------------- diff (F39) and map (F38)

  async compare(idA, idB, from = 'history') {
    const [a, b] = await Promise.all([getSnapshot(idA), getSnapshot(idB)]);
    if (!a || !b) return;
    const [first, second] = a.capturedAt <= b.capturedAt ? [a, b] : [b, a];
    const result = await workerRequest(
      { type: MSG.DIFF, a: first.edited, b: second.edited },
      MSG.DIFF_RESULT,
    ).catch(() => null);
    if (!result) return;
    set({
      diff: { a: toHeader(first), b: toHeader(second), result: result.diff, from },
      screen: 'diff',
    });
  },

  exportDiff() {
    const diff = get().diff;
    if (!diff) return;
    saveBlob(
      new Blob([exportDiffMd(diff.result)], { type: 'text/markdown' }),
      `${diff.a.hostname}-diff.md`,
    );
  },

  /**
   * "Add to snapshot…" (AC-F26.9): copies a component snapshot's picked recipe into another
   * snapshot as variant `picked`, replacing an earlier pick of the same kind.
   */
  async addPickedToSnapshot(targetId) {
    const source = get().record;
    const recipe =
      source?.kind === 'component' ? source.edited.components.find((r) => !r.excluded) : null;
    if (!recipe) return;
    const target = await getSnapshot(targetId).catch(() => undefined);
    if (!target) return;
    const picked = {
      ...structuredClone(recipe),
      id: `component:${recipe.kind}:picked`,
      variant: 'picked',
      screenshotIds: [],
    };
    const place = (design) => ({
      ...design,
      components: [...design.components.filter((r) => r.id !== picked.id), picked],
    });
    try {
      await saveSnapshot({
        ...target,
        extracted: place(target.extracted),
        edited: place(target.edited),
        updatedAt: Date.now(),
      });
      get().toast('ADDED', t('toast_added_to_snapshot', target.hostname));
      await get().loadRecent();
    } catch {
      get().toast('STORAGE_FAILED');
    }
  },

  openMap() {
    set({ screen: 'map' });
  },

  async mapFile(file) {
    const record = get().record;
    if (!record) return;
    let text;
    try {
      text = await file.text();
    } catch {
      text = '';
    }
    try {
      const reply = await workerRequest(
        { type: MSG.MAP, design: record.edited, fileText: text, fileName: file.name },
        MSG.MAP_RESULT,
      );
      const next = { ...get().record, mapping: reply.mapping };
      set({ record: next });
      scheduleSave(get);
    } catch {
      set({ dialog: { kind: 'mapping-error', file: file.name } });
    }
  },

  setUseMyNames(useMyNames) {
    const record = get().record;
    if (!record?.mapping) return;
    set({ record: { ...record, mapping: { ...record.mapping, useMyNames } } });
    scheduleSave(get);
  },

  exportMapping() {
    const record = get().record;
    if (!record?.mapping) return;
    saveBlob(
      new Blob([exportMappingMd(record.edited, record.mapping)], { type: 'text/markdown' }),
      `${record.hostname}-mapping.md`,
    );
  },

  // ---------------------------------------------------------------- settings and misc

  openSettings() {
    flushSave(get);
    clearHighlightNow(get, set);
    get().refreshPermissions();
    get().loadProjects();
    set({ screen: 'settings' });
  },

  openShortcuts() {
    openTab('chrome://extensions/shortcuts').catch(() => {});
  },

  openUrl(url) {
    openTab(url).catch(() => {});
  },

  /** kind is a toast code; text overrides the message for toasts with substitutions. */
  toast(kind, text) {
    const id = crypto.randomUUID();
    const message = text ?? t(TOAST_KEYS[kind] ?? 'toast_storage_failed');
    const quiet =
      kind === 'COPIED' || kind === 'IMPORTED' || kind === 'MIGRATED' || kind === 'ADDED';
    set({
      toasts: [
        ...get().toasts,
        { id, kind, text: message, success: quiet, duration: kind === 'COPIED' ? 1500 : 4000 },
      ],
    });
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
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

// ------------------------------------------------------------------ helpers

export function stageLabel(stage) {
  if (stage.startsWith('width-')) return t('stage_width', stage.slice(6));
  const key = { 'deep-scan': 'stage_deep_scan' }[stage] ?? `stage_${stage}`;
  return t(key);
}

function advancedStages(options, tab) {
  // The base capture is not known yet, so the theme stage is shown when it may run; the service
  // worker skips it on sites that switch themes with a class or attribute.
  const stages = planStages(options, {
    viewport: { width: tab.width ?? 0 },
    colorScheme: 'light',
    themeSignals: { darkMedia: true },
  });
  return stages;
}

function setStage(set, get, stage) {
  const run = get().run;
  if (!run) return;
  set({ run: { ...run, stage } });
  announce(set, t('stage_now', stageLabel(stage)));
}

async function getTabSafe(tabId) {
  try {
    return await getTab(tabId);
  } catch {
    return undefined;
  }
}

function describeTab(tab) {
  let hostname = null;
  try {
    if (tab.url) hostname = new URL(tab.url).hostname || null;
  } catch {
    hostname = null;
  }
  return { id: tab.id, url: tab.url ?? null, hostname, width: tab.width };
}

const toHeader = (r) => ({ id: r.id, hostname: r.hostname, capturedAt: r.capturedAt });

function announce(set, text) {
  set({ announcement: text });
}

function fail(set, get, code, detail, url, retry) {
  stopWorker();
  set({ run: null, screen: 'state', failure: { code, detail, url: url ?? get().tab?.url, retry } });
  announce(set, code);
}

function stopWorker() {
  clearTimeout(runtime.timer);
  runtime.timer = null;
  if (runtime.worker) {
    runtime.worker.terminate();
    runtime.worker = null;
  }
}

// ---- The panel port (v2 spec 7.1) ----

function ensurePort(get) {
  if (runtime.port) return runtime.port;
  runtime.port = connectPanelPort(
    PANEL_PORT,
    (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === MSG.EXTRACT_PROGRESS) return get().onProgress(message);
      for (const [key, waiter] of runtime.pending) {
        if (waiter.match(message)) {
          runtime.pending.delete(key);
          waiter.resolve(message);
          return;
        }
      }
    },
    () => {
      // The service worker restarted; pending replies will never come.
      runtime.port = null;
      for (const waiter of runtime.pending.values()) waiter.resolve(null);
      runtime.pending.clear();
    },
  );
  return runtime.port;
}

function postPort(get, set, message) {
  try {
    ensurePort(get, set).post(message);
  } catch {
    runtime.port = null;
  }
}

function requestPort(get, set, message, match) {
  return new Promise((resolve) => {
    const key = crypto.randomUUID();
    runtime.pending.set(key, { match, resolve });
    try {
      ensurePort(get, set).post(message);
    } catch {
      runtime.pending.delete(key);
      runtime.port = null;
      resolve(null);
    }
  });
}

function sendExtract(get, set, message) {
  return requestPort(
    get,
    set,
    message,
    (reply) =>
      reply.requestId === message.requestId &&
      (reply.type === MSG.CAPTURES || reply.type === MSG.EXTRACT_ERROR),
  );
}

function clearHighlightNow(get, set) {
  const tab = get().tab;
  if (get().highlight && tab?.id) postPort(get, set, { type: MSG.HIGHLIGHT_CLEAR, tabId: tab.id });
  set({ highlight: null });
}

// ---- The analysis worker ----

/** Runs analysis in a fresh worker that is terminated afterwards. */
function analyzeInWorker(requestId, captures, edits, options) {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    runtime.worker = worker;
    const failWith = (detail) => {
      stopWorker();
      reject(Object.assign(new Error(detail), { code: 'ANALYSIS_FAILED' }));
    };
    runtime.timer = setTimeout(() => failWith('Analysis timed out'), ANALYZE_TIMEOUT_MS);
    worker.onmessage = (event) => {
      const message = event.data;
      // Messages from a cancelled or older run are ignored.
      if (!message || message.requestId !== requestId) return;
      if (message.type === MSG.RESULT) {
        stopWorker();
        resolve(message);
      } else if (message.type === MSG.ERROR) {
        failWith(message.detail);
      }
    };
    worker.onerror = (event) => failWith(event?.message ?? 'Worker error');
    worker.postMessage({ type: MSG.ANALYZE, requestId, captures, edits, options });
  });
}

/** MAP and DIFF run in their own short-lived worker. */
function workerRequest(message, replyType) {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Timed out'));
    }, ANALYZE_TIMEOUT_MS);
    worker.onmessage = (event) => {
      const reply = event.data;
      if (!reply || reply.requestId !== requestId) return;
      clearTimeout(timer);
      worker.terminate();
      if (reply.type === replyType) resolve(reply);
      else reject(Object.assign(new Error(reply.detail), { code: reply.code }));
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event?.message ?? 'Worker error'));
    };
    worker.postMessage({ ...message, requestId });
  });
}

async function screenshotPayload(snapshotId, as) {
  const rows = await getScreenshots(snapshotId).catch(() => []);
  const out = [];
  for (const row of rows) {
    if (as === 'bytes')
      out.push({ recipeId: row.recipeId, mode: row.mode, bytes: await blobToBytes(row.blob) });
    else
      out.push({ recipeId: row.recipeId, mode: row.mode, dataUrl: await blobToDataUrl(row.blob) });
  }
  return out;
}

// ---- Autosave ----

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
  if (record)
    saveSnapshot({ ...record, updatedAt: Date.now() }).catch(() => get().toast('STORAGE_FAILED'));
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
  stopWorker();
  clearTimeout(runtime.saveTimer);
  runtime.saveTimer = null;
  for (const off of runtime.unsubscribers.splice(0)) off();
  runtime.port = null;
  runtime.starting = false;
  runtime.pending.clear();
  useStore.setState({ ...initialState });
}
