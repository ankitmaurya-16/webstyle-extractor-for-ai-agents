import { isExtractRequest, PENDING_EXTRACT_KEY } from '../src/messaging.js';
import { handleExtract } from '../src/platform/extract-handler.js';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== 'extract' || !tab?.id) return;
    // sidePanel.open must run first with no await before it, or Chrome drops the user gesture.
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    chrome.storage.session.set({
      [PENDING_EXTRACT_KEY]: { tabId: tab.id, windowId: tab.windowId, at: Date.now() },
    });
  });

  // A plain listener that returns true keeps the channel open; an async listener would not.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtractRequest(message)) return false;
    handleExtract(message.tabId).then(sendResponse);
    return true;
  });
});
