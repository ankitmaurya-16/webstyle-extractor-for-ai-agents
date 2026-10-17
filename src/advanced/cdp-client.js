// CdpClient (v2 spec 5.3): the interface Advanced capture is written against. The extension
// implements it with chrome.debugger; the CLI with a Playwright CDP session.
//
//   send(method, params) -> Promise<result>
//   on(event, handler)   -> unsubscribe
//   detach()             -> Promise<void>

/** chrome.debugger implementation. Attach before use; detach is safe to call twice. */
export function chromeDebuggerClient(chromeApi, tabId) {
  const target = { tabId };
  let attached = false;
  return {
    async attach() {
      await chromeApi.debugger.attach(target, '1.3');
      attached = true;
    },
    send(method, params = {}) {
      return chromeApi.debugger.sendCommand(target, method, params);
    },
    on(event, handler) {
      const listener = (source, method, params) => {
        if (source.tabId === tabId && method === event) handler(params);
      };
      chromeApi.debugger.onEvent.addListener(listener);
      return () => chromeApi.debugger.onEvent.removeListener(listener);
    },
    async detach() {
      if (!attached) return;
      attached = false;
      try {
        await chromeApi.debugger.detach(target);
      } catch {
        // Already detached by the user, a navigation or Chrome.
      }
    },
    get attached() {
      return attached;
    },
  };
}
