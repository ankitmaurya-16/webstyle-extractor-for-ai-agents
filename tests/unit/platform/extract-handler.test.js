import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleExtract } from '../../../src/platform/extract-handler.js';
import { fakeChrome, rawSnapshot } from '../helpers.js';

let chrome;
beforeEach(() => {
  chrome = fakeChrome();
  globalThis.chrome = chrome;
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.chrome;
});

describe('handleExtract', () => {
  it('returns SNAPSHOT with the injection result', async () => {
    const raw = rawSnapshot();
    chrome.scripting.executeScript.mockResolvedValue([{ result: raw }]);
    await expect(handleExtract(7)).resolves.toEqual({ type: 'SNAPSHOT', raw });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7, frameIds: [0] },
      files: ['/extractor.js'],
    });
  });

  it('AC-F1.6 refuses chrome:// tabs without injecting', async () => {
    chrome.tabs.get.mockResolvedValue({ id: 7, url: 'chrome://settings/' });
    await expect(handleExtract(7)).resolves.toMatchObject({
      type: 'EXTRACT_ERROR',
      code: 'RESTRICTED_PAGE',
    });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('AC-F1.8 maps a refused injection to NO_ACCESS', async () => {
    chrome.scripting.executeScript.mockRejectedValue(
      new Error('Cannot access contents of the page.'),
    );
    await expect(handleExtract(7)).resolves.toMatchObject({ code: 'NO_ACCESS' });
  });

  it('AC-F1.9 reports EMPTY_PAGE under 30 sampled elements', async () => {
    chrome.scripting.executeScript.mockResolvedValue([
      { result: rawSnapshot({ elementsSampled: 29 }) },
    ]);
    await expect(handleExtract(7)).resolves.toMatchObject({ code: 'EMPTY_PAGE' });
  });

  it('AC-F1.10 times out after 10 s', async () => {
    vi.useFakeTimers();
    chrome.scripting.executeScript.mockReturnValue(new Promise(() => {}));
    const reply = handleExtract(7);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(reply).resolves.toMatchObject({ code: 'TIMEOUT' });
    expect(chrome.tabs.onUpdated.hasListeners()).toBe(false);
  });

  it('AC-F1.11 reports PAGE_CHANGED when the tab navigates during the run', async () => {
    chrome.scripting.executeScript.mockReturnValue(new Promise(() => {}));
    const reply = handleExtract(7);
    await Promise.resolve();
    await Promise.resolve();
    chrome.tabs.onUpdated.emit(7, { status: 'loading', url: 'https://example.com/next' });
    await expect(reply).resolves.toMatchObject({ code: 'PAGE_CHANGED' });
  });

  it('AC-F1.11 ignores updates from other tabs', async () => {
    let resolve;
    chrome.scripting.executeScript.mockReturnValue(new Promise((r) => (resolve = r)));
    const reply = handleExtract(7);
    await Promise.resolve();
    await Promise.resolve();
    chrome.tabs.onUpdated.emit(8, { status: 'loading' });
    resolve([{ result: rawSnapshot() }]);
    await expect(reply).resolves.toMatchObject({ type: 'SNAPSHOT' });
  });

  it('AC-F1.11 reports PAGE_CHANGED when the snapshot comes from another URL', async () => {
    chrome.scripting.executeScript.mockResolvedValue([
      { result: rawSnapshot({ url: 'https://example.com/other' }) },
    ]);
    await expect(handleExtract(7)).resolves.toMatchObject({ code: 'PAGE_CHANGED' });
  });

  it('AC-F1.11 treats a null result followed by a navigation as PAGE_CHANGED', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ frameId: 0, result: null }]);
    const reply = handleExtract(7);
    setTimeout(
      () => chrome.tabs.onUpdated.emit(7, { status: 'loading', url: 'https://example.com/next' }),
      20,
    );
    await expect(reply).resolves.toMatchObject({ code: 'PAGE_CHANGED' });
  });

  it('reports INJECTION_FAILED for a null result without a navigation', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ frameId: 0, result: null }]);
    await expect(handleExtract(7)).resolves.toMatchObject({ code: 'INJECTION_FAILED' });
  });

  it('reports PAGE_CHANGED when the tab is gone', async () => {
    chrome.tabs.get.mockRejectedValue(new Error('No tab with id: 7.'));
    await expect(handleExtract(7)).resolves.toMatchObject({ code: 'PAGE_CHANGED' });
  });
});

describe('handleExtract with a file:// tab', () => {
  beforeEach(() => {
    chrome = fakeChrome();
    globalThis.chrome = chrome;
  });

  it('AC-F1.7 reports FILE_ACCESS when a visible file:// tab refuses injection', async () => {
    chrome.tabs.get.mockResolvedValue({ id: 7, url: 'file:///home/me/page.html' });
    chrome.scripting.executeScript.mockRejectedValue(
      new Error(
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      ),
    );
    await expect(handleExtract(7)).resolves.toMatchObject({
      type: 'EXTRACT_ERROR',
      code: 'FILE_ACCESS',
    });
  });
});
