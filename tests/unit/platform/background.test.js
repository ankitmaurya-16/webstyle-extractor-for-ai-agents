import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeChrome, rawSnapshot } from '../helpers.js';

let chrome;
let onMessage;
beforeEach(async () => {
  chrome = fakeChrome();
  globalThis.chrome = chrome;
  globalThis.defineBackground = (main) => main;
  const add = chrome.runtime.onMessage.addListener;
  chrome.runtime.onMessage.addListener = (fn) => {
    onMessage = fn;
    add(fn);
  };
  vi.resetModules();
  const { default: main } = await import('../../../entrypoints/background.js');
  main();
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
    const [items] = chrome.storage.session.set.mock.calls[0];
    expect(items.pendingExtract).toMatchObject({ tabId: 7, windowId: 3 });
    expect(typeof items.pendingExtract.at).toBe('number');
  });

  it('ignores other commands', () => {
    chrome.commands.onCommand.emit('other', { id: 7, windowId: 3 });
    expect(chrome.sidePanel.open).not.toHaveBeenCalled();
  });

  it('answers EXTRACT from a plain listener that returns true', async () => {
    chrome.scripting.executeScript.mockResolvedValue([{ result: rawSnapshot() }]);
    const sendResponse = vi.fn();
    expect(onMessage.constructor.name).toBe('Function'); // never an async listener
    expect(onMessage({ type: 'EXTRACT', tabId: 7 }, {}, sendResponse)).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ type: 'SNAPSHOT' })),
    );
    expect(onMessage({ type: 'OTHER' }, {}, sendResponse)).toBe(false);
  });
});
