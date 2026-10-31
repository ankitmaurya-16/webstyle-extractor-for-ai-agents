import { describe, expect, it, vi } from 'vitest';
import { chromeDebuggerClient } from '../../../src/advanced/cdp-client.js';
import { fakeEvent } from '../helpers.js';

function fakeDebugger() {
  return {
    debugger: {
      attach: vi.fn(async () => {}),
      detach: vi.fn(async () => {}),
      sendCommand: vi.fn(async (target, method) => ({ method })),
      onEvent: fakeEvent(),
      onDetach: fakeEvent(),
    },
  };
}

describe('chromeDebuggerClient', () => {
  it('AC-F23.6 attaches with protocol 1.3 and sends commands to the tab', async () => {
    const chrome = fakeDebugger();
    const cdp = chromeDebuggerClient(chrome, 7);
    expect(cdp.attached).toBe(false);
    await cdp.attach();
    expect(chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 7 }, '1.3');
    expect(cdp.attached).toBe(true);
    await expect(cdp.send('CSS.enable')).resolves.toEqual({ method: 'CSS.enable' });
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 7 }, 'CSS.enable', {});
    await cdp.send('DOM.querySelector', { nodeId: 1, selector: 'a' });
    expect(chrome.debugger.sendCommand).toHaveBeenLastCalledWith(
      { tabId: 7 },
      'DOM.querySelector',
      {
        nodeId: 1,
        selector: 'a',
      },
    );
  });

  it('AC-F23.6 delivers only this tab’s events for the subscribed method and unsubscribes', async () => {
    const chrome = fakeDebugger();
    const cdp = chromeDebuggerClient(chrome, 7);
    const handler = vi.fn();
    const off = cdp.on('CSS.styleSheetAdded', handler);
    chrome.debugger.onEvent.emit({ tabId: 7 }, 'CSS.styleSheetAdded', {
      header: { styleSheetId: '1' },
    });
    chrome.debugger.onEvent.emit({ tabId: 8 }, 'CSS.styleSheetAdded', {
      header: { styleSheetId: '2' },
    });
    chrome.debugger.onEvent.emit({ tabId: 7 }, 'DOM.documentUpdated', {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ header: { styleSheetId: '1' } });
    off();
    expect(chrome.debugger.onEvent.hasListeners()).toBe(false);
  });

  it('AC-F23.6 detaches once, ignores errors and never detaches what it did not attach', async () => {
    const chrome = fakeDebugger();
    const cdp = chromeDebuggerClient(chrome, 7);
    await cdp.detach();
    expect(chrome.debugger.detach).not.toHaveBeenCalled();
    await cdp.attach();
    chrome.debugger.detach.mockRejectedValueOnce(new Error('Debugger is not attached to the tab'));
    await expect(cdp.detach()).resolves.toBeUndefined();
    await cdp.detach();
    expect(chrome.debugger.detach).toHaveBeenCalledTimes(1);
    expect(chrome.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(cdp.attached).toBe(false);
  });

  it('AC-F23.6 stays detached when attach fails, so cleanup has nothing to undo', async () => {
    const chrome = fakeDebugger();
    chrome.debugger.attach.mockRejectedValueOnce(new Error('Another debugger is already attached'));
    const cdp = chromeDebuggerClient(chrome, 7);
    await expect(cdp.attach()).rejects.toThrow('Another debugger');
    expect(cdp.attached).toBe(false);
    await cdp.detach();
    expect(chrome.debugger.detach).not.toHaveBeenCalled();
  });
});
