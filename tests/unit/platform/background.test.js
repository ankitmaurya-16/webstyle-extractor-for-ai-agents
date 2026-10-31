import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawSnapshot } from '../helpers.js';
import { fakeChromeV2 } from '../sidepanel/fakes.js';

let chrome;
let onMessage;
let pageCalls;

/** executeScript like Chrome: files resolve empty, collect() returns `raw`, page functions run against `page`. */
function scripted({ raw = rawSnapshot(), collect, picker = {}, highlighter = {}, fail } = {}) {
  pageCalls = [];
  chrome.scripting.executeScript.mockImplementation(async (details) => {
    pageCalls.push(details);
    if (fail?.(details)) throw new Error(fail(details));
    if (details.files) return [];
    const [arg] = details.args ?? [];
    if (arg && typeof arg === 'object' && 'autoScroll' in arg) {
      const result = collect ? await collect(arg) : raw;
      return [{ frameId: 0, result }];
    }
    const previous = globalThis.self;
    globalThis.self = { __webstylePicker: picker, __webstyleHighlighter: highlighter };
    try {
      return [{ frameId: 0, result: details.func(...(details.args ?? [])) }];
    } finally {
      globalThis.self = previous;
    }
  });
}

async function startBackground({ activeCapture } = {}) {
  chrome = fakeChromeV2();
  globalThis.chrome = chrome;
  chrome.tabs.get.mockImplementation(async (id) => ({
    id,
    url: 'https://example.com/',
    windowId: 3,
  }));
  if (activeCapture) await chrome.storage.session.set({ activeCapture });
  scripted();
  globalThis.defineBackground = (main) => main;
  const add = chrome.runtime.onMessage.addListener;
  chrome.runtime.onMessage.addListener = (fn) => {
    onMessage = fn;
    add(fn);
  };
  vi.resetModules();
  const { default: main } = await import('../../../entrypoints/background.js');
  main();
}

/** Connects a panel port and collects what the service worker posts back. */
function connect(name = 'panel') {
  const panel = chrome.runtime.connect({ name });
  const pair = chrome.runtime.ports.at(-1);
  const received = [];
  panel.onMessage.addListener((m) => received.push(m));
  return { panel, pair, received, ofType: (type) => received.filter((m) => m.type === type) };
}

const extractMsg = (extra = {}) => ({
  type: 'EXTRACT',
  requestId: 'req-1',
  tabId: 7,
  intent: 'new',
  snapshotId: null,
  rootSelector: null,
  autoScroll: false,
  advanced: null,
  screenshots: false,
  ...extra,
});

beforeEach(async () => {
  await startBackground();
});
afterEach(() => {
  delete globalThis.chrome;
  delete globalThis.defineBackground;
});

describe('service worker', () => {
  it('AC-F1.1 opens the side panel on toolbar click', () => {
    expect(chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: true,
    });
  });

  it('AC-F1.2 opens the panel before anything else and flags the tab for extraction', () => {
    const order = [];
    chrome.sidePanel.open.mockImplementation(async () => order.push('open'));
    chrome.storage.session.set.mockImplementation(async () => order.push('set'));
    chrome.commands.onCommand.emit('extract', { id: 7, windowId: 3 });
    expect(order).toEqual(['open', 'set']);
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 3 });
    const [items] = chrome.storage.session.set.mock.calls.at(-1);
    expect(items.pendingExtract).toMatchObject({ tabId: 7, windowId: 3 });
    expect(typeof items.pendingExtract.at).toBe('number');
  });

  it('ignores other commands', () => {
    chrome.commands.onCommand.emit('other', { id: 7, windowId: 3 });
    expect(chrome.sidePanel.open).not.toHaveBeenCalled();
  });

  it('answers EXTRACT from a plain listener that returns true with CAPTURES', async () => {
    const sendResponse = vi.fn();
    expect(onMessage.constructor.name).toBe('Function');
    expect(onMessage(extractMsg(), {}, sendResponse)).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CAPTURES', requestId: 'req-1' }),
      ),
    );
    expect(onMessage({ type: 'OTHER' }, {}, sendResponse)).toBe(false);
    expect(onMessage({ type: 'PICK_RESULT', selector: '#a' }, {}, sendResponse)).toBe(false);
  });

  it('AC-F23.7 on start, detaches a debugger left attached by a restart', async () => {
    await startBackground({
      activeCapture: { tabId: 5, debuggerAttached: true, overlays: [], startedAt: 1 },
    });
    await vi.waitFor(() => expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 5 }));
    await vi.waitFor(async () =>
      expect((await chrome.storage.session.get('activeCapture')).activeCapture).toBeUndefined(),
    );
  });
});

describe('panel port (v2 spec 7.1)', () => {
  it('EXTRACT on the port posts progress and then CAPTURES with the request id', async () => {
    const { panel, received } = connect();
    panel.postMessage(extractMsg({ autoScroll: true }));
    await vi.waitFor(() => expect(received.some((m) => m.type === 'CAPTURES')).toBe(true));
    expect(received.map((m) => [m.type, m.stage ?? null])).toEqual([
      ['EXTRACT_PROGRESS', 'scrolling'],
      ['EXTRACT_PROGRESS', 'reading'],
      ['CAPTURES', null],
    ]);
    expect(received.every((m) => m.requestId === 'req-1')).toBe(true);
  });

  it('EXTRACT errors go back on the port with the request id', async () => {
    chrome.tabs.get.mockResolvedValue({ id: 7, url: 'chrome://newtab/' });
    const { panel, ofType } = connect();
    panel.postMessage(extractMsg());
    await vi.waitFor(() =>
      expect(ofType('EXTRACT_ERROR')).toEqual([
        {
          type: 'EXTRACT_ERROR',
          code: 'RESTRICTED_PAGE',
          detail: 'chrome://newtab/',
          requestId: 'req-1',
        },
      ]),
    );
  });

  it('AC-F1.12 CANCEL stops the run and posts nothing for it', async () => {
    let started;
    scripted({ collect: () => new Promise(() => (started = true)) });
    const { panel, received } = connect();
    panel.postMessage(extractMsg());
    await vi.waitFor(() => expect(started).toBe(true));
    panel.postMessage({ type: 'CANCEL', requestId: 'req-1' });
    await vi.waitFor(async () =>
      expect((await chrome.storage.session.get('activeCapture')).activeCapture).toBeUndefined(),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(received.filter((m) => m.type !== 'EXTRACT_PROGRESS')).toEqual([]);
  });

  it('AC-F23.6 a panel disconnect cancels the run, detaches the debugger and removes overlays', async () => {
    let sent;
    chrome.debugger.sendCommand.mockImplementation(async (_t, method) => {
      if (method === 'Emulation.setDeviceMetricsOverride') {
        sent = true;
        return new Promise(() => {});
      }
      return {};
    });
    const { panel } = connect();
    panel.postMessage(
      extractMsg({ advanced: { deepScan: false, dark: false, states: false, widths: [375] } }),
    );
    await vi.waitFor(() => expect(sent).toBe(true));
    panel.disconnect();
    await vi.waitFor(() => expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 7 }));
    await vi.waitFor(() =>
      expect(
        pageCalls.some(
          (c) =>
            c.func &&
            !c.args &&
            c.target.tabId === 7 &&
            String(c.func).includes('__webstyleHighlighter'),
        ),
      ).toBe(true),
    );
    await vi.waitFor(async () =>
      expect((await chrome.storage.session.get('activeCapture')).activeCapture).toBeUndefined(),
    );
  });

  it('AC-F26.4 AC-F30.5 a panel disconnect removes picker and highlight overlays from every tab it used', async () => {
    const picker = { start: vi.fn(), stop: vi.fn() };
    const highlighter = { show: vi.fn(() => ({ count: 2 })), clear: vi.fn() };
    scripted({ picker, highlighter });
    const { panel, ofType } = connect();
    panel.postMessage({ type: 'PICK_START', tabId: 7 });
    panel.postMessage({
      type: 'HIGHLIGHT_SHOW',
      tabId: 8,
      tokenId: 'color:#000000',
      match: { property: 'color', values: ['#000000'] },
    });
    await vi.waitFor(() => expect(ofType('HIGHLIGHT_COUNT')).toHaveLength(1));
    panel.disconnect();
    await vi.waitFor(() => expect(picker.stop).toHaveBeenCalledTimes(2));
    expect(highlighter.clear).toHaveBeenCalledTimes(2);
  });

  it('AC-F26.3 PICK_START injects the picker and replies PICK_READY; PICK_KEY and PICK_STOP reach it', async () => {
    const picker = { start: vi.fn(), stop: vi.fn(), key: vi.fn() };
    scripted({ picker });
    const { panel, ofType } = connect();
    panel.postMessage({ type: 'PICK_START', tabId: 7 });
    await vi.waitFor(() =>
      expect(ofType('PICK_READY')).toEqual([{ type: 'PICK_READY', tabId: 7 }]),
    );
    expect(pageCalls[0]).toEqual({ target: { tabId: 7, frameIds: [0] }, files: ['/picker.js'] });
    expect(picker.start).toHaveBeenCalled();
    panel.postMessage({ type: 'PICK_KEY', tabId: 7, key: 'ArrowUp' });
    await vi.waitFor(() => expect(picker.key).toHaveBeenCalledWith('ArrowUp'));
    panel.postMessage({ type: 'PICK_STOP', tabId: 7 });
    await vi.waitFor(() => expect(picker.stop).toHaveBeenCalled());
  });

  it('AC-F26.4 a picker that cannot be injected replies PICK_FAILED', async () => {
    scripted({ fail: (d) => (d.files ? 'Something odd happened' : null) });
    const { panel, ofType } = connect();
    panel.postMessage({ type: 'PICK_START', tabId: 7 });
    await vi.waitFor(() => expect(ofType('EXTRACT_ERROR')).toHaveLength(1));
    expect(ofType('EXTRACT_ERROR')[0].code).toBe('PICK_FAILED');
  });

  it('AC-F26.4 a picker on a page without access replies NO_ACCESS', async () => {
    scripted({ fail: (d) => (d.files ? 'Cannot access contents of the page.' : null) });
    const { panel, ofType } = connect();
    panel.postMessage({ type: 'PICK_START', tabId: 7 });
    await vi.waitFor(() => expect(ofType('EXTRACT_ERROR')).toHaveLength(1));
    expect(ofType('EXTRACT_ERROR')[0].code).toBe('NO_ACCESS');
  });

  it('AC-F30.3 HIGHLIGHT_SHOW injects the highlighter and replies the count with the token id', async () => {
    const highlighter = { show: vi.fn(() => ({ count: 12 })), clear: vi.fn() };
    scripted({ highlighter });
    const { panel, ofType } = connect();
    const match = { property: 'color', values: ['#2563eb'] };
    panel.postMessage({ type: 'HIGHLIGHT_SHOW', tabId: 7, tokenId: 'color:#2563eb', match });
    await vi.waitFor(() =>
      expect(ofType('HIGHLIGHT_COUNT')).toEqual([
        { type: 'HIGHLIGHT_COUNT', count: 12, tokenId: 'color:#2563eb' },
      ]),
    );
    expect(pageCalls[0].files).toEqual(['/highlighter.js']);
    expect(highlighter.show).toHaveBeenCalledWith(match);
    panel.postMessage({ type: 'HIGHLIGHT_CLEAR', tabId: 7 });
    await vi.waitFor(() => expect(highlighter.clear).toHaveBeenCalled());
  });

  it('AC-F30.7 HIGHLIGHT_SHOW without access replies a zero count with the error code', async () => {
    scripted({ fail: () => 'Cannot access contents of the page.' });
    const { panel, ofType } = connect();
    panel.postMessage({
      type: 'HIGHLIGHT_SHOW',
      tabId: 7,
      tokenId: 't',
      match: { property: 'color', values: [] },
    });
    await vi.waitFor(() =>
      expect(ofType('HIGHLIGHT_COUNT')).toEqual([
        { type: 'HIGHLIGHT_COUNT', count: 0, error: 'NO_ACCESS', tokenId: 't' },
      ]),
    );
  });

  it('ignores ports with other names and malformed messages', async () => {
    const other = connect('devtools');
    other.panel.postMessage(extractMsg());
    const { panel, received } = connect();
    panel.postMessage(null);
    panel.postMessage({ type: 'EXTRACT', tabId: 'seven' });
    await new Promise((r) => setTimeout(r, 20));
    expect(other.received).toEqual([]);
    expect(received).toEqual([]);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('a reply after the panel closed is dropped without throwing', async () => {
    let finish;
    scripted({ collect: () => new Promise((r) => (finish = () => r(rawSnapshot()))) });
    const { panel, pair } = connect();
    panel.postMessage(extractMsg());
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    pair.close();
    finish();
    await new Promise((r) => setTimeout(r, 20));
    expect(pair.server.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CAPTURES' }),
    );
  });
});
