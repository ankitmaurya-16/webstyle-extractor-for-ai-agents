// CdpClient (v2 spec 5.3) over a Playwright CDP session, so the CLI runs the same Advanced
// capture plan as the extension (AC-F41.5).

/** @param {import('playwright').CDPSession} session */
export function playwrightCdpClient(session) {
  let detached = false;
  return {
    send: (method, params = {}) => session.send(method, params),
    on(event, handler) {
      session.on(event, handler);
      return () => session.off(event, handler);
    },
    async detach() {
      if (detached) return;
      detached = true;
      await session.detach().catch(() => {});
    },
  };
}
