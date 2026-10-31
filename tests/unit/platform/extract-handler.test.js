import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupOverlays,
  handleExtract,
  mergeFrames,
  recoverActiveCapture,
} from '../../../src/platform/extract-handler.js';
import { extractRequest } from '../../../src/messaging.js';
import { rawSnapshot, stat } from '../helpers.js';
import { fakeChromeV2 } from '../sidepanel/fakes.js';

const URL_1 = 'https://example.com/';
let chrome;

/**
 * Mocks scripting.executeScript like Chrome: file injections resolve empty, collect() calls
 * return the top frame (plus `frames` for allFrames), readRecipe and cleanup calls return null.
 */
function scripted({ top = rawSnapshot(), frames = [], collect, inject } = {}) {
  chrome.scripting.executeScript.mockImplementation(async (details) => {
    if (details.files) {
      if (inject) await inject(details);
      return [];
    }
    const [arg] = details.args ?? [];
    if (arg && typeof arg === 'object') {
      const result = collect ? await collect(arg, details) : top;
      if (details.target.allFrames) {
        return [{ frameId: 0, result }, ...frames.map((f, i) => ({ frameId: i + 1, result: f }))];
      }
      return [{ frameId: 0, result }];
    }
    return [{ frameId: 0, result: null }];
  });
}

const request = (options = {}) => extractRequest(7, { requestId: 'r1', ...options });
const sessionValue = (key) => chrome.storage.session.get(key).then((r) => r[key]);

beforeEach(() => {
  chrome = fakeChromeV2();
  globalThis.chrome = chrome;
  chrome.tabs.get.mockImplementation(async (id) => ({ id, url: URL_1, windowId: 3 }));
  vi.spyOn(crypto, 'randomUUID');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe('handleExtract basic capture', () => {
  it('AC-F1.1 replies CAPTURES with one base capture', async () => {
    const raw = rawSnapshot({ colorScheme: 'dark', viewport: { width: 1024, height: 700 } });
    scripted({ top: raw });
    const reply = await handleExtract(request());
    expect(reply).toMatchObject({
      type: 'CAPTURES',
      requestId: 'r1',
      warnings: [],
      screenshots: [],
    });
    expect(reply.captures).toHaveLength(1);
    expect(reply.captures[0]).toMatchObject({
      pageUrl: raw.url,
      mode: 'dark',
      viewportWidth: 1024,
      method: 'computed',
      kind: 'base',
      capturedAt: raw.capturedAt,
    });
    expect(reply.captures[0].raw.elementsSampled).toBe(100);
    expect(typeof reply.captures[0].id).toBe('string');
  });

  it('AC-F23.2 injects the extractor into all frames, then calls collect with the options', async () => {
    scripted();
    await handleExtract(request({ autoScroll: true }));
    const [first, second] = chrome.scripting.executeScript.mock.calls.map((c) => c[0]);
    expect(first).toEqual({ target: { tabId: 7, allFrames: true }, files: ['/extractor.js'] });
    expect(second.target).toEqual({ tabId: 7, allFrames: true });
    expect(second.args).toEqual([{ autoScroll: true, rootSelector: null }]);
  });

  it('AC-F22.2 merges same-origin frames into the page capture', async () => {
    const frame = rawSnapshot({
      elementsSampled: 20,
      colors: [stat('#ff0000', 1)],
      breakpoints: [640],
    });
    scripted({
      top: rawSnapshot({ colors: [stat('#000000', 2)], breakpoints: [640, 1024], frameCount: 3 }),
      frames: [frame],
    });
    const reply = await handleExtract(request());
    const raw = reply.captures[0].raw;
    expect(raw.elementsSampled).toBe(120);
    expect(raw.colors.map((c) => c.value)).toEqual(['#000000', '#ff0000']);
    expect(raw.coverage.frames).toEqual({ read: 1, skipped: 2 });
  });

  it('AC-F26.6 a component run reads only the top frame, with the root selector and a lower minimum', async () => {
    scripted({ top: rawSnapshot({ elementsSampled: 3 }) });
    const reply = await handleExtract(request({ intent: 'component', rootSelector: '#card' }));
    expect(reply.type).toBe('CAPTURES');
    const calls = chrome.scripting.executeScript.mock.calls.map((c) => c[0]);
    expect(calls[0].target).toEqual({ tabId: 7, allFrames: false });
    expect(calls[1].target).toEqual({ tabId: 7, frameIds: [0] });
    expect(calls[1].args).toEqual([{ autoScroll: false, rootSelector: '#card' }]);
  });

  it('AC-F1.6 refuses chrome:// tabs without injecting', async () => {
    chrome.tabs.get.mockResolvedValue({ id: 7, url: 'chrome://settings/' });
    await expect(handleExtract(request())).resolves.toMatchObject({
      type: 'EXTRACT_ERROR',
      code: 'RESTRICTED_PAGE',
      requestId: 'r1',
    });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('AC-F1.8 maps a refused injection to NO_ACCESS', async () => {
    chrome.scripting.executeScript.mockRejectedValue(
      new Error('Cannot access contents of the page.'),
    );
    await expect(handleExtract(request())).resolves.toMatchObject({
      code: 'NO_ACCESS',
      requestId: 'r1',
    });
  });

  it('AC-F1.9 reports EMPTY_PAGE under 30 sampled elements', async () => {
    scripted({ top: rawSnapshot({ elementsSampled: 29 }) });
    await expect(handleExtract(request())).resolves.toMatchObject({ code: 'EMPTY_PAGE' });
  });

  it('AC-F1.10 times out after 10 s and clears the active capture', async () => {
    vi.useFakeTimers();
    scripted({ collect: () => new Promise(() => {}) });
    const pending = handleExtract(request());
    await vi.advanceTimersByTimeAsync(10_001);
    await expect(pending).resolves.toMatchObject({ code: 'TIMEOUT' });
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F1.11 a navigation during the run replies PAGE_CHANGED', async () => {
    scripted({
      collect: () => {
        chrome.tabs.onUpdated.emit(7, { status: 'loading' }, {});
        return new Promise(() => {});
      },
    });
    await expect(handleExtract(request())).resolves.toMatchObject({ code: 'PAGE_CHANGED' });
    expect(chrome.tabs.onUpdated.hasListeners()).toBe(false);
  });

  it('AC-F1.11 a result from another document replies PAGE_CHANGED', async () => {
    scripted({ top: rawSnapshot({ url: 'https://example.com/other' }) });
    await expect(handleExtract(request())).resolves.toMatchObject({ code: 'PAGE_CHANGED' });
  });

  it('AC-F1.12 cancel stops the run and replies CANCELLED', async () => {
    const controller = new AbortController();
    scripted({
      collect: () => {
        controller.abort();
        return new Promise(() => {});
      },
    });
    await expect(handleExtract(request(), { signal: controller.signal })).resolves.toEqual({
      type: 'CANCELLED',
    });
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('records activeCapture while running and removes it afterwards', async () => {
    let during;
    scripted({
      collect: async () => {
        during = await sessionValue('activeCapture');
        return rawSnapshot();
      },
    });
    await handleExtract(request());
    expect(during).toMatchObject({ tabId: 7, debuggerAttached: false, overlays: [] });
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('reports progress stages', async () => {
    scripted();
    const stages = [];
    await handleExtract(request({ autoScroll: true }), { onProgress: (s) => stages.push(s) });
    expect(stages).toEqual(['scrolling', 'reading']);
  });
});

describe('component screenshots (F36)', () => {
  it('AC-F36.1 takes no screenshot unless the switch is on', async () => {
    scripted();
    const reply = await handleExtract(request());
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled();
    expect(reply.screenshots).toEqual([]);
  });

  it('AC-F36.2 takes one screenshot after the basic collect with the representatives', async () => {
    const reps = [
      { variant: 'button:primary', rect: { x: 1, y: 2, width: 40, height: 20 }, inViewport: true },
    ];
    scripted({ top: rawSnapshot({ devicePixelRatio: 2, representatives: reps }) });
    const reply = await handleExtract(request({ screenshots: true }));
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledWith(3, { format: 'png' });
    expect(reply.screenshots).toEqual([
      {
        mode: 'light',
        dataUrl: 'data:image/png;base64,AAAA',
        at: expect.any(Number),
        dpr: 2,
        representatives: reps,
      },
    ]);
  });

  it('AC-F36.7 a rejected capture still returns the captures', async () => {
    chrome.tabs.captureVisibleTab.mockRejectedValue(
      new Error('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND'),
    );
    scripted();
    const reply = await handleExtract(request({ screenshots: true }));
    expect(reply.type).toBe('CAPTURES');
    expect(reply.screenshots).toEqual([]);
  });
});

describe('handleExtract advanced capture (F23)', () => {
  const advanced = { deepScan: false, dark: false, states: false, widths: [375] };

  function widthCollect() {
    return (opts) => {
      if (opts.sheetTexts) return rawSnapshot({ deepScan: true });
      return rawSnapshot();
    };
  }

  it('AC-F23.6 attaches, captures each width and detaches', async () => {
    scripted({ collect: widthCollect() });
    const stages = [];
    const reply = await handleExtract(request({ advanced }), { onProgress: (s) => stages.push(s) });
    expect(reply.type).toBe('CAPTURES');
    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 7 }, '1.3');
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      'Emulation.setDeviceMetricsOverride',
      expect.objectContaining({ width: 375 }),
    );
    expect(reply.captures.map((c) => [c.kind, c.method, c.viewportWidth])).toEqual([
      ['base', 'computed', 1280],
      ['width', 'emulated', 375],
    ]);
    expect(stages).toEqual(['reading', 'attach', 'width-375', 'detach']);
    expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F23.5 a failed stage keeps the others and is listed in warnings', async () => {
    chrome.debugger.sendCommand.mockImplementation(async (_t, method) => {
      if (method === 'Emulation.setDeviceMetricsOverride') throw new Error('boom');
      return {};
    });
    scripted({ collect: widthCollect() });
    const reply = await handleExtract(request({ advanced: { ...advanced, deepScan: true } }));
    expect(reply.type).toBe('CAPTURES');
    expect(reply.warnings).toEqual(['width-375']);
    expect(reply.captures[0].raw.deepScan).toEqual({ sheets: 0, capped: false });
    expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
  });

  it('records debuggerAttached in activeCapture while the debugger is attached', async () => {
    let during;
    chrome.debugger.sendCommand.mockImplementation(async () => {
      during ??= await sessionValue('activeCapture');
      return {};
    });
    scripted({ collect: widthCollect() });
    await handleExtract(request({ advanced }));
    expect(during).toMatchObject({ tabId: 7, debuggerAttached: true });
  });

  it('AC-F23.1 without the debugger API it replies DEBUGGER_DENIED', async () => {
    delete chrome.debugger;
    scripted();
    await expect(handleExtract(request({ advanced }))).resolves.toMatchObject({
      code: 'DEBUGGER_DENIED',
    });
  });

  it('AC-F23.6 an attach failure replies DEBUGGER_ATTACH_FAILED and leaves nothing attached', async () => {
    chrome.debugger.attach.mockRejectedValue(new Error('Another debugger is already attached'));
    scripted();
    await expect(handleExtract(request({ advanced }))).resolves.toMatchObject({
      code: 'DEBUGGER_ATTACH_FAILED',
      detail: 'Another debugger is already attached',
    });
    expect(chrome.debugger.detach).not.toHaveBeenCalled();
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F23.6 cancel during a stage detaches the debugger', async () => {
    const controller = new AbortController();
    chrome.debugger.sendCommand.mockImplementation(async (_t, method) => {
      if (method === 'Emulation.setDeviceMetricsOverride') {
        controller.abort();
        return new Promise(() => {});
      }
      return {};
    });
    scripted({ collect: widthCollect() });
    const reply = await handleExtract(request({ advanced }), { signal: controller.signal });
    expect(reply).toEqual({ type: 'CANCELLED' });
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F23.6 a navigation during a stage detaches the debugger and replies PAGE_CHANGED', async () => {
    chrome.debugger.sendCommand.mockImplementation(async (_t, method) => {
      if (method === 'Emulation.setDeviceMetricsOverride') {
        chrome.tabs.onUpdated.emit(7, { url: 'https://example.com/next' }, {});
        return new Promise(() => {});
      }
      return {};
    });
    scripted({ collect: widthCollect() });
    await expect(handleExtract(request({ advanced }))).resolves.toMatchObject({
      code: 'PAGE_CHANGED',
    });
    expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
  });

  it('AC-F23.6 the user closing the debugger bar replies PAGE_CHANGED and still detaches', async () => {
    chrome.debugger.sendCommand.mockImplementation(async (_t, method) => {
      if (method === 'Emulation.setDeviceMetricsOverride') {
        chrome.debugger.onDetach.emit({ tabId: 7 }, 'canceled_by_user');
        return new Promise(() => {});
      }
      return {};
    });
    scripted({ collect: widthCollect() });
    await expect(handleExtract(request({ advanced }))).resolves.toMatchObject({
      code: 'PAGE_CHANGED',
      detail: 'Debugger detached',
    });
    expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
  });

  it('AC-F23.6 an unexpected error still detaches the debugger', async () => {
    let calls = 0;
    scripted({
      collect: () => {
        calls += 1;
        if (calls > 1) throw new Error('page script crashed');
        return rawSnapshot();
      },
    });
    const reply = await handleExtract(request({ advanced }));
    expect(['CAPTURES', 'EXTRACT_ERROR']).toContain(reply.type);
    expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F36.2 a theme screenshot waits at least 500 ms after the first', async () => {
    const darkRaw = rawSnapshot({ themeSignals: { darkMedia: true, darkSelectors: [] } });
    scripted({ top: darkRaw, collect: () => darkRaw });
    const reply = await handleExtract(
      request({
        screenshots: true,
        advanced: { deepScan: false, dark: true, states: false, widths: [] },
      }),
    );
    expect(reply.captures.map((c) => [c.kind, c.mode])).toEqual([
      ['base', 'light'],
      ['theme', 'dark'],
    ]);
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(2);
    expect(reply.screenshots.map((s) => s.mode)).toEqual(['light', 'dark']);
    expect(reply.screenshots[1].at - reply.screenshots[0].at).toBeGreaterThanOrEqual(495);
  });
});

describe('mergeFrames', () => {
  it('AC-F22.2 sums elements, concatenates lists and unites breakpoints and font faces', () => {
    const top = rawSnapshot({
      breakpoints: [640],
      fontFaces: [{ family: 'A' }],
      spacing: [stat('8px', 1)],
      frameCount: 2,
    });
    const frames = [
      rawSnapshot({
        elementsSampled: 5,
        breakpoints: [640, 768],
        fontFaces: [{ family: 'B' }],
        spacing: [stat('4px', 1)],
      }),
      rawSnapshot({ elementsSampled: 7 }),
    ];
    const merged = mergeFrames(top, frames);
    expect(merged.elementsSampled).toBe(112);
    expect(merged.breakpoints).toEqual([640, 768]);
    expect(merged.fontFaces).toEqual([{ family: 'A' }, { family: 'B' }]);
    expect(merged.spacing.map((s) => s.value)).toEqual(['8px', '4px']);
    expect(merged.coverage.frames).toEqual({ read: 2, skipped: 0 });
    expect(top.elementsSampled).toBe(100);
  });

  it('keeps the top frame alone when there are no frames', () => {
    const top = rawSnapshot();
    const merged = mergeFrames(top, []);
    expect(merged.colors).toEqual([]);
    expect(merged.coverage.frames).toEqual({ read: 0, skipped: 0 });
  });
});

describe('recovery and cleanup', () => {
  it('AC-F23.7 recoverActiveCapture detaches a debugger left attached and removes overlays', async () => {
    await chrome.storage.session.set({
      activeCapture: { tabId: 9, debuggerAttached: true, overlays: [], startedAt: 1 },
    });
    chrome.scripting.executeScript.mockResolvedValue([]);
    await recoverActiveCapture();
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 9 });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 9, frameIds: [0] } }),
    );
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F23.7 recoverActiveCapture without a debugger only cleans overlays', async () => {
    await chrome.storage.session.set({
      activeCapture: { tabId: 9, debuggerAttached: false, overlays: [], startedAt: 1 },
    });
    chrome.debugger.detach.mockRejectedValue(new Error('not attached'));
    await recoverActiveCapture();
    expect(chrome.debugger.detach).not.toHaveBeenCalled();
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
  });

  it('recoverActiveCapture does nothing without a record', async () => {
    await recoverActiveCapture();
    expect(chrome.debugger.detach).not.toHaveBeenCalled();
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('recoverActiveCapture survives a detach that fails', async () => {
    await chrome.storage.session.set({ activeCapture: { tabId: 9, debuggerAttached: true } });
    chrome.debugger.detach.mockRejectedValue(new Error('No tab with given id 9'));
    await expect(recoverActiveCapture()).resolves.toBeUndefined();
    expect(await sessionValue('activeCapture')).toBeUndefined();
  });

  it('AC-F26.4 AC-F30.5 cleanupOverlays stops the picker and clears the highlighter in the page', async () => {
    const picker = { stop: vi.fn() };
    const highlighter = { clear: vi.fn() };
    chrome.scripting.executeScript.mockImplementation(async ({ func }) => {
      globalThis.self.__webstylePicker = picker;
      globalThis.self.__webstyleHighlighter = highlighter;
      func();
      delete globalThis.self.__webstylePicker;
      delete globalThis.self.__webstyleHighlighter;
      return [];
    });
    globalThis.self ??= globalThis;
    await cleanupOverlays(4);
    expect(picker.stop).toHaveBeenCalled();
    expect(highlighter.clear).toHaveBeenCalled();
  });

  it('cleanupOverlays ignores closed tabs and missing ids', async () => {
    chrome.scripting.executeScript.mockRejectedValue(new Error('No tab with id: 4'));
    await expect(cleanupOverlays(4)).resolves.toBeUndefined();
    await cleanupOverlays(undefined);
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
  });
});
