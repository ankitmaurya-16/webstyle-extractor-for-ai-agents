// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { analyze } from '../../../src/analyze/index.js';
import { diffDesigns } from '../../../src/diff/index.js';
import { makeRecord, resetConnection, toSummary } from '../../../src/storage/snapshots.js';
import { t } from '../../../src/i18n.js';
import { resetStore, setWorkerFactory, useStore } from '../../../entrypoints/sidepanel/store.js';
import { App } from '../../../entrypoints/sidepanel/App.jsx';
import { Home } from '../../../entrypoints/sidepanel/screens/Home.jsx';
import { History } from '../../../entrypoints/sidepanel/screens/History.jsx';
import { Results } from '../../../entrypoints/sidepanel/screens/Results.jsx';
import { Settings } from '../../../entrypoints/sidepanel/screens/Settings.jsx';
import { Picking } from '../../../entrypoints/sidepanel/screens/Picking.jsx';
import { Diff } from '../../../entrypoints/sidepanel/screens/Diff.jsx';
import { MapScreen } from '../../../entrypoints/sidepanel/screens/MapScreen.jsx';
import { Extracting } from '../../../entrypoints/sidepanel/screens/Extracting.jsx';
import { StateScreen } from '../../../entrypoints/sidepanel/screens/StateScreen.jsx';
import { Toasts } from '../../../entrypoints/sidepanel/components/Toasts.jsx';
import { Dialogs } from '../../../entrypoints/sidepanel/components/Dialogs.jsx';
import { capturesFor, loadRaw } from '../helpers.js';
import {
  capturesReply,
  fakeChromeV2,
  fakeServiceWorker,
  fakeWorker,
  loadWorkerHandler,
} from './fakes.js';

let chrome;
let sw;

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  await loadWorkerHandler();
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  resetStore();
  chrome = fakeChromeV2();
  globalThis.chrome = chrome;
  sw = fakeServiceWorker(chrome, { EXTRACT: (msg) => capturesReply(msg) });
  setWorkerFactory(() => fakeWorker());
  chrome.tabs.query.mockResolvedValue([{ id: 7, url: loadRaw('classic').url, windowId: 1 }]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetStore();
  document.documentElement.removeAttribute('data-theme');
  delete globalThis.chrome;
});

function ui(node) {
  return render(
    <Toast.Provider>
      <Tooltip.Provider>
        {node}
        <Toasts />
        <Dialogs />
      </Tooltip.Provider>
    </Toast.Provider>,
  );
}

/** A record built the way the panel builds one; `name` is a captured fixture. */
function buildRecord(name = 'classic', { id = 'r1', kind = 'page', extraPages = [] } = {}) {
  const raw = { ...loadRaw(name), capturedAt: Date.UTC(2026, 9, 20) };
  const captures = [
    ...capturesFor(raw),
    ...extraPages.map((url) => capturesFor({ ...raw, url })[0]),
  ].map((c, i) => ({ ...c, id: `${id}-${i}` }));
  const extracted = analyze(captures);
  return makeRecord({ id, kind, captures, extracted, edited: structuredClone(extracted) });
}

function openRecord(name, options) {
  const record = buildRecord(name, options);
  useStore.setState({
    record,
    screen: 'results',
    mode: record.edited.meta.primaryMode ?? 'light',
    version: '2.0.0',
    historyLoaded: true,
  });
  return record;
}

const TAB_IDS = ['colors', 'type', 'layout', 'motion', 'components', 'insights', 'export'];

describe('App shell', () => {
  it('AC-F1.1 renders Home, extracts through the port and worker, and shows Results', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: t('extract') });
    await act(async () => {
      fireEvent.click(button);
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[data-screen="results"]')).not.toBeNull(),
    );
    expect(sw.ofType('EXTRACT')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: t('tab_colors') }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('AC-F42.1 AC-F42.5 Appearance sets data-theme on the root live; System removes it', async () => {
    render(<App />);
    await act(async () => {
      await useStore.getState().loadSettings();
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    await act(async () => {
      useStore.getState().openSettings();
    });
    const group = screen.getByRole('radiogroup', { name: t('appearance') });
    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: t('light') }));
    });
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    );
    expect((await chrome.storage.local.get('settings')).settings.panelTheme).toBe('light');
    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: t('dark') }));
    });
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    );
    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: t('system') }));
    });
    await vi.waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false));
  });

  it('AC-F42.5 a saved theme is applied when the panel opens', async () => {
    await chrome.storage.local.set({ settings: { panelTheme: 'light' } });
    render(<App />);
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('light'),
    );
  });

  it('renders every screen through the switcher without errors', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const record = buildRecord('dark-media');
    const other = buildRecord('classic', { id: 'r2' });
    render(<App />);
    const screens = {
      home: {},
      extracting: {
        run: {
          requestId: 'x',
          intent: 'new',
          stage: 'reading',
          stages: ['reading', 'analyzing', 'saving'],
        },
      },
      results: { record },
      history: { history: [toSummary(record), toSummary(other)], historyLoaded: true },
      state: { failure: { code: 'TIMEOUT' } },
      settings: {},
      picking: { picking: { tag: 'button', width: 10, height: 10 } },
      diff: {
        diff: {
          a: { hostname: 'a', capturedAt: 1 },
          b: { hostname: 'b', capturedAt: 2 },
          result: diffDesigns(other.edited, record.edited),
        },
      },
      map: { record },
    };
    for (const [name, state] of Object.entries(screens)) {
      await act(async () => {
        useStore.setState({ ...state, screen: name });
      });
      expect(document.querySelector(`[data-screen="${name}"]`), name).not.toBeNull();
      expect(
        document.querySelector(`[data-screen="${name}"]`).textContent.length,
        name,
      ).toBeGreaterThan(0);
    }
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('Home', () => {
  it('shows the tab, Extract, Pick element, capture switches and the first-run steps', () => {
    useStore.setState({
      tab: { id: 7, url: 'https://example.com/a', hostname: 'example.com' },
      historyLoaded: true,
    });
    ui(<Home />);
    expect(screen.getByRole('heading', { name: 'example.com' })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('extract') }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: t('pick_element') }).disabled).toBe(false);
    expect(screen.getByRole('switch', { name: new RegExp(t('scroll_to_load')) })).toBeTruthy();
    expect(screen.getByRole('switch', { name: new RegExp(t('advanced_capture')) })).toBeTruthy();
    expect(screen.getByRole('list', { name: t('how_it_works') })).toBeTruthy();
  });

  it('AC-F36.1 the screenshots switch is off by default and toggles capture.screenshots', () => {
    useStore.setState({ tab: { id: 7, url: 'https://example.com/', hostname: 'example.com' } });
    ui(<Home />);
    const toggle = screen.getByRole('switch', { name: new RegExp(t('include_screenshots')) });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(useStore.getState().capture.screenshots).toBe(true);
  });

  it('AC-F23.1 turning Advanced capture on asks for the debugger permission from the click', async () => {
    useStore.setState({ tab: { id: 7, url: 'https://example.com/', hostname: 'example.com' } });
    ui(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: new RegExp(t('advanced_capture')) }));
    });
    expect(chrome.permissions.request).toHaveBeenCalledWith({ permissions: ['debugger'] });
    expect(useStore.getState().capture.advanced).toBe(true);
  });

  it('AC-F23.1 a declined debugger shows the DEBUGGER_DENIED toast', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    useStore.setState({ tab: { id: 7, url: 'https://example.com/', hostname: 'example.com' } });
    ui(<Home />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: new RegExp(t('advanced_capture')) }));
    });
    expect(await screen.findByText(t('toast_debugger_denied'))).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: new RegExp(t('advanced_capture')) })
        .getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('AC-F43.4 hides Advanced capture on Firefox', () => {
    useStore.setState({
      firefox: true,
      tab: { id: 7, url: 'https://example.com/', hostname: 'example.com' },
    });
    ui(<Home />);
    expect(screen.queryByRole('switch', { name: new RegExp(t('advanced_capture')) })).toBeNull();
    expect(screen.getByRole('button', { name: t('extract') })).toBeTruthy();
  });

  it('lists recent snapshots with their kind and page count', () => {
    const site = {
      ...toSummary(
        buildRecord('classic', { kind: 'site', extraPages: ['http://127.0.0.1:4173/about.html'] }),
      ),
      kind: 'site',
    };
    useStore.setState({ recent: [site], history: [site], historyLoaded: true });
    ui(<Home />);
    const list = screen.getByRole('region', { name: t('recent') });
    expect(within(list).getByText(t('kind_site'))).toBeTruthy();
    expect(within(list).getByText(new RegExp(t('pages_count', 2)))).toBeTruthy();
  });
});

describe('Results', () => {
  it('renders all 7 tabs without errors', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    openRecord('components');
    ui(<Results />);
    for (const id of TAB_IDS) {
      await act(async () => {
        useStore.getState().setResultsTab(id);
      });
      const tab = screen.getByRole('tab', { name: t(`tab_${id}`) });
      expect(tab.getAttribute('aria-selected'), id).toBe('true');
      const panel = screen.getByRole('tabpanel');
      expect(panel.textContent.length, id).toBeGreaterThan(0);
    }
    expect(errors).not.toHaveBeenCalled();
  });

  it('renders all 7 tabs for a two-theme site in dark mode', async () => {
    openRecord('dark-media');
    useStore.setState({ mode: 'dark' });
    ui(<Results />);
    expect(screen.getByRole('radiogroup', { name: t('theme_switch') })).toBeTruthy();
    for (const id of TAB_IDS) {
      await act(async () => useStore.getState().setResultsTab(id));
      expect(screen.getByRole('tabpanel').textContent.length, id).toBeGreaterThan(0);
    }
  });

  it('AC-F13.5 the theme switch changes the viewed mode', async () => {
    openRecord('dark-media');
    ui(<Results />);
    const group = screen.getByRole('radiogroup', { name: t('theme_switch') });
    await act(async () => fireEvent.click(within(group).getByRole('radio', { name: t('dark') })));
    expect(useStore.getState().mode).toBe('dark');
  });

  it('AC-F25.6 shows the pages chip; the page list removes a page but never the last', async () => {
    const record = openRecord('classic', {
      kind: 'site',
      extraPages: ['http://127.0.0.1:4173/about.html'],
    });
    const removePage = vi.fn();
    useStore.setState({ removePage });
    ui(<Results />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: t('pages_count', 2) })),
    );
    const buttons = await screen.findAllByRole('button', { name: t('remove_page') });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(removePage).toHaveBeenCalledWith(record.pages[1]);
  });

  it('AC-F25.6 a one-page snapshot has no pages chip', () => {
    openRecord('classic');
    ui(<Results />);
    expect(screen.queryByRole('button', { name: t('pages_count', 1) })).toBeNull();
  });

  it('AC-F25.5 shows the stale edits banner with Clear edits that no longer apply', async () => {
    const record = openRecord('classic');
    const stale = { kind: 'rename', tokenId: 'color:#123456', name: 'gone' };
    useStore.setState({ record: { ...record, edits: [stale], staleEdits: 1 } });
    ui(<Results />);
    expect(screen.getByText(t('banner_stale', 1))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t('clear_stale') })));
    expect(useStore.getState().record.edits).toEqual([]);
    expect(screen.queryByText(t('banner_stale', 1))).toBeNull();
  });

  it('AC-F23.5 the partial-capture banner names the failed stages', () => {
    const record = openRecord('classic');
    useStore.setState({ record: { ...record, captureWarnings: ['deep-scan', 'width-375'] } });
    ui(<Results />);
    expect(
      screen.getByText(t('banner_partial', `${t('stage_deep_scan')}, ${t('stage_width', 375)}`)),
    ).toBeTruthy();
  });

  it('shows the v1 migration banner', () => {
    const record = openRecord('classic');
    useStore.setState({ record: { ...record, migratedFromV1: true } });
    ui(<Results />);
    expect(screen.getByText(t('banner_migrated'))).toBeTruthy();
  });

  it('AC-F25.7 offers Allow on this site for another page of the same site', async () => {
    const record = openRecord('classic');
    useStore.setState({
      tab: { id: 7, url: 'http://127.0.0.1:4173/about.html', hostname: record.hostname },
    });
    ui(<Results />);
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: t('allow_on_site') })),
    );
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
  });

  it('AC-F30.1 eye buttons appear only when Highlight on page is on', async () => {
    const record = openRecord('classic');
    const first = record.edited.colors.find((c) => !c.excluded);
    const { unmount } = ui(<Results />);
    expect(screen.queryAllByRole('button', { name: t('where_used', first.name) })).toHaveLength(0);
    unmount();
    useStore.setState({
      settings: { ...useStore.getState().settings, highlightEnabled: true },
      tab: { id: 7, url: record.pages[0] },
    });
    ui(<Results />);
    const eyes = screen.getAllByRole('button', { name: t('where_used', first.name) });
    expect(eyes.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(eyes[0]);
    });
    await vi.waitFor(() =>
      expect(useStore.getState().highlight).toEqual({ tokenId: first.id, count: 3 }),
    );
  });
});

describe('History', () => {
  function seed() {
    const a = toSummary(buildRecord('classic', { id: 'a' }));
    const b = toSummary(buildRecord('dark', { id: 'b' }));
    const c = toSummary(buildRecord('utility', { id: 'c' }));
    useStore.setState({ history: [a, b, c], historyLoaded: true, screen: 'history' });
    return [a, b, c];
  }

  it('AC-F39.1 select mode enables Compare only with exactly two snapshots', async () => {
    const [a, b, c] = seed();
    const compare = vi.fn();
    useStore.setState({ compare });
    ui(<History />);
    fireEvent.click(screen.getByRole('button', { name: t('select') }));
    const compareButton = screen.getByRole('button', { name: t('compare') });
    expect(compareButton.disabled).toBe(true);
    expect(screen.getByRole('button', { name: t('export_selected') }).disabled).toBe(true);
    const boxes = screen.getAllByRole('checkbox', { name: t('select_snapshot', a.hostname) });
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[0]);
    expect(compareButton.disabled).toBe(true);
    expect(screen.getByRole('button', { name: t('export_selected') }).disabled).toBe(false);
    fireEvent.click(boxes[1]);
    expect(compareButton.disabled).toBe(false);
    fireEvent.click(boxes[2]);
    expect(compareButton.disabled).toBe(true);
    fireEvent.click(boxes[2]);
    fireEvent.click(compareButton);
    expect(compare).toHaveBeenCalledWith(a.id, b.id);
    expect(compare).not.toHaveBeenCalledWith(expect.anything(), c.id);
    fireEvent.click(screen.getByRole('button', { name: t('done') }));
    expect(screen.queryByRole('button', { name: t('compare') })).toBeNull();
  });

  it('shows the empty state', () => {
    useStore.setState({ history: [], historyLoaded: true });
    ui(<History />);
    expect(screen.getByText(t('history_empty_title'))).toBeTruthy();
  });

  it('AC-F40.3 importing a bad file shows the IMPORT_INVALID dialog', async () => {
    seed();
    const { container } = ui(<History />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(['{nope'], 'bad.webstyle.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await vi.waitFor(() => expect(useStore.getState().dialog?.kind).toBe('import-error'));
    expect(await screen.findByText(t('import_invalid', 'the file is not valid JSON'))).toBeTruthy();
  });
});

describe('Settings', () => {
  it('renders appearance, capture, names, exports, highlight, allowed sites, projects and about', () => {
    useStore.setState({
      allowedSites: ['https://shop.example.com/*'],
      fsSupported: true,
      version: '2.0.0',
    });
    ui(<Settings />);
    expect(screen.getByRole('radiogroup', { name: t('appearance') })).toBeTruthy();
    expect(
      screen
        .getByRole('switch', { name: new RegExp(t('highlight_on_page')) })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.getByText('https://shop.example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t('link_project')) })).toBeTruthy();
    expect(screen.getByText(t('version', '2.0.0'))).toBeTruthy();
  });

  it('AC-F25.8 removes an allowed site', async () => {
    chrome.permissionsGranted.origins.add('https://shop.example.com/*');
    await useStore.getState().refreshPermissions();
    ui(<Settings />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t('remove') })));
    expect(chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://shop.example.com/*'],
    });
    await vi.waitFor(() => expect(screen.getByText(t('no_allowed_sites'))).toBeTruthy());
  });

  it('AC-F30.1 the Highlight on page switch saves highlightEnabled', async () => {
    ui(<Settings />);
    await act(async () =>
      fireEvent.click(screen.getByRole('switch', { name: new RegExp(t('highlight_on_page')) })),
    );
    await vi.waitFor(() => expect(useStore.getState().settings.highlightEnabled).toBe(true));
  });

  it('AC-F37.10 AC-F43.4 hides projects and Advanced capture when unsupported', () => {
    useStore.setState({ fsSupported: false, firefox: true });
    ui(<Settings />);
    expect(screen.queryByRole('button', { name: new RegExp(t('link_project')) })).toBeNull();
    expect(screen.queryByText(t('advanced_help'))).toBeNull();
    expect(screen.getByRole('radiogroup', { name: t('appearance') })).toBeTruthy();
  });
});

describe('Picking, Diff, Map and state screens', () => {
  it('AC-F26.1 Picking shows the instructions and the hovered element', async () => {
    useStore.setState({
      screen: 'picking',
      picking: { tag: null, width: 0, height: 0 },
      tab: { id: 7 },
    });
    ui(<Picking />);
    expect(screen.getByText(t('picking_body'))).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t('select_element')) }).disabled).toBe(
      true,
    );
    await act(async () =>
      useStore
        .getState()
        .onPickerMessage({ type: 'PICK_HOVER', tag: 'button', width: 120.4, height: 36 }),
    );
    expect(screen.getByTestId('pick-current').textContent).toBe(
      t('picking_current', 'button', 120, 36),
    );
    expect(screen.getByRole('button', { name: new RegExp(t('select_element')) }).disabled).toBe(
      false,
    );
  });

  it('AC-F26.11 the arrow and select buttons send keys to the picker', async () => {
    useStore.setState({
      screen: 'picking',
      picking: { tag: 'div', width: 1, height: 1 },
      tab: { id: 7 },
    });
    ui(<Picking />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('parent')) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('child')) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('select_element')) }));
    await vi.waitFor(() =>
      expect(sw.ofType('PICK_KEY').map((m) => m.key)).toEqual(['ArrowUp', 'ArrowDown', 'Enter']),
    );
  });

  it('AC-F39.2 Diff shows counts and filters', async () => {
    const a = buildRecord('classic', { id: 'a' });
    const b = buildRecord('utility', { id: 'b' });
    const result = diffDesigns(a.edited, b.edited);
    useStore.setState({
      diff: {
        a: { hostname: 'a.com', capturedAt: 1 },
        b: { hostname: 'b.com', capturedAt: 2 },
        result,
      },
      screen: 'diff',
    });
    ui(<Diff />);
    const c = result.counts;
    expect(
      screen.getByText(t('diff_counts', c.added, c.removed, c.changed, c.renamed)),
    ).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: t('diff_title') });
    await act(async () =>
      fireEvent.click(within(group).getByRole('radio', { name: t('filter_added') })),
    );
    expect(screen.queryAllByText(t('filter_removed')).length).toBe(1);
  });

  it('AC-F38.1 Map renders without a mapping and with one', () => {
    const record = openRecord('classic');
    useStore.setState({ screen: 'map' });
    const { unmount } = ui(<MapScreen />);
    expect(screen.getAllByText(t('map_title')).length).toBeGreaterThan(0);
    unmount();
    const entries = record.edited.colors.slice(0, 2).map((c, i) => ({
      tokenId: c.id,
      userToken: i ? null : '--brand',
      status: i ? 'none' : 'exact',
      delta: i ? null : 0,
    }));
    useStore.setState({
      record: {
        ...record,
        mapping: { sourceName: 'tokens.css', importedAt: 1, useMyNames: false, entries },
      },
    });
    ui(<MapScreen />);
    expect(screen.getByText('--brand')).toBeTruthy();
    expect(screen.getByText(t('status_exact'))).toBeTruthy();
  });

  it('Extracting shows the stage list and Cancel', () => {
    useStore.setState({
      screen: 'extracting',
      run: {
        requestId: 'x',
        intent: 'new',
        stage: 'reading',
        stages: ['reading', 'attach', 'width-375', 'analyzing', 'saving'],
      },
    });
    ui(<Extracting />);
    expect(screen.getByText(t('stage_reading'))).toBeTruthy();
    expect(screen.getByText(t('stage_width', 375))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('cancel') })).toBeTruthy();
  });

  it.each([
    ['RESTRICTED_PAGE', 'restricted'],
    ['FILE_ACCESS', 'restricted'],
    ['NO_ACCESS', 'noAccess'],
    ['EMPTY_PAGE', 'thin'],
    ['TIMEOUT', 'error'],
    ['PAGE_CHANGED', 'error'],
    ['INJECTION_FAILED', 'error'],
    ['ANALYSIS_FAILED', 'error'],
    ['DEBUGGER_ATTACH_FAILED', 'debugger'],
    ['DEBUGGER_DENIED', 'debugger'],
    ['SOMETHING_NEW', 'error'],
  ])('AC-F1.8 the state screen renders %s', (code, kind) => {
    useStore.setState({
      screen: 'state',
      failure: { code, detail: 'x', retry: { intent: 'new' } },
    });
    const { container } = ui(<StateScreen />);
    expect(container.querySelector('main').dataset.state).toBe(kind);
    expect(container.textContent.length).toBeGreaterThan(10);
  });

  it('AC-F23.6 the Advanced failure state offers Run basic extraction', async () => {
    const runBasic = vi.fn();
    useStore.setState({
      screen: 'state',
      failure: { code: 'DEBUGGER_ATTACH_FAILED', retry: { intent: 'new', advanced: true } },
      runBasic,
    });
    ui(<StateScreen />);
    expect(screen.getByText(t('body_debugger_attach_failed'))).toBeTruthy();
    const button = screen.getAllByRole('button').find((b) => /basic/i.test(b.textContent));
    expect(button).toBeTruthy();
  });
});

describe('dialogs and toasts', () => {
  it('AC-F25.2 the cross-site dialog names both hosts and Add anyway confirms', async () => {
    const confirmCrossSite = vi.fn();
    useStore.setState({
      dialog: { kind: 'cross-site', host: 'other.org', snapshotHost: 'example.com' },
      confirmCrossSite,
    });
    ui(<div />);
    expect(screen.getByText(t('cross_site_body', 'other.org', 'example.com'))).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t('add_anyway') })));
    expect(confirmCrossSite).toHaveBeenCalled();
  });

  it('AC-F40.4 the too-new import dialog shows its message', () => {
    useStore.setState({ dialog: { kind: 'import-error', code: 'IMPORT_TOO_NEW', problem: '' } });
    ui(<div />);
    expect(screen.getByText(t('import_too_new'))).toBeTruthy();
  });

  it('AC-F37.9 the write summary lists failed files', () => {
    useStore.setState({
      dialog: {
        kind: 'write-failed',
        project: 'app',
        results: [
          { path: 'DESIGN.md', status: 'new' },
          { path: 'design/tokens.json', status: 'failed' },
        ],
      },
    });
    ui(<div />);
    expect(screen.getByText(t('fs_write_failed', 'design/tokens.json'))).toBeTruthy();
    expect(screen.getByText(t('status_new'))).toBeTruthy();
  });

  it.each([
    ['SITE_ACCESS_DENIED', 'toast_site_access_denied'],
    ['PICK_FAILED', 'toast_pick_failed'],
    ['HIGHLIGHT_EMPTY', 'toast_highlight_empty'],
    ['DEBUGGER_DENIED', 'toast_debugger_denied'],
  ])('shows the %s toast text', async (kind, key) => {
    ui(<div />);
    await act(async () => useStore.getState().toast(kind));
    expect(screen.getByText(t(key))).toBeTruthy();
  });
});
