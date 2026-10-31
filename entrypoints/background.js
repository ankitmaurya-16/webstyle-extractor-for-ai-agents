import { MSG, PANEL_PORT, PENDING_EXTRACT_KEY, isExtractRequest } from '../src/messaging.js';
import { cleanupOverlays, handleExtract, recoverActiveCapture } from '../src/platform/extract-handler.js';
import { openPanelFromGesture, openPanelOnAction } from '../src/platform/chrome.js';
import { clearHighlight, showHighlight, startPicker, stopPicker, pickerKey } from '../src/platform/overlays.js';

export default defineBackground(() => {
  openPanelOnAction();
  // A restart in the middle of a capture must not leave the debugger attached (AC-F23.7).
  recoverActiveCapture();

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== 'extract' || !tab?.id) return;
    // Opening must run first with no await before it, or the browser drops the user gesture.
    openPanelFromGesture(tab.windowId);
    chrome.storage.session.set({
      [PENDING_EXTRACT_KEY]: { tabId: tab.id, windowId: tab.windowId, at: Date.now() },
    });
  });

  // A plain listener that returns true keeps the channel open; an async listener would not.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtractRequest(message)) return false;
    handleExtract(message).then(sendResponse);
    return true;
  });

  // The panel's port: progress, cancel, picker and highlight. Everything a connection starts is
  // cleaned up when it disconnects (v2 spec 7.1).
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PANEL_PORT) return;
    const runs = new Map();
    const tabs = new Set();
    const post = (message) => {
      try {
        port.postMessage(message);
      } catch {
        // The panel closed.
      }
    };
    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.tabId !== undefined) tabs.add(msg.tabId);
      switch (msg.type) {
        case MSG.EXTRACT: {
          if (!isExtractRequest(msg)) return;
          const controller = new AbortController();
          runs.set(msg.requestId, controller);
          handleExtract(msg, {
            signal: controller.signal,
            onProgress: (stage) => post({ type: MSG.EXTRACT_PROGRESS, requestId: msg.requestId, stage }),
          }).then((reply) => {
            runs.delete(msg.requestId);
            if (reply.type !== 'CANCELLED') post({ ...reply, requestId: msg.requestId });
          });
          return;
        }
        case MSG.CANCEL:
          runs.get(msg.requestId)?.abort();
          return;
        case MSG.PICK_START:
          startPicker(msg.tabId).then(post);
          return;
        case MSG.PICK_STOP:
          stopPicker(msg.tabId);
          return;
        case 'PICK_KEY':
          pickerKey(msg.tabId, msg.key);
          return;
        case MSG.HIGHLIGHT_SHOW:
          showHighlight(msg.tabId, msg.match).then((reply) => post({ ...reply, tokenId: msg.tokenId }));
          return;
        case MSG.HIGHLIGHT_CLEAR:
          clearHighlight(msg.tabId);
          return;
        default:
      }
    });
    port.onDisconnect.addListener(() => {
      for (const controller of runs.values()) controller.abort();
      for (const tabId of tabs) cleanupOverlays(tabId);
    });
  });
});
