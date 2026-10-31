// Helpers shared by the v2 end-to-end specs.
import { expect } from './harness.js';

export async function extractFrom(panel, { timeout = 30_000 } = {}) {
  await panel.getByRole('button', { name: 'Extract design system' }).click();
  await panel.waitForSelector('[data-screen=results]', { timeout });
}

export async function turnOnAdvanced(panel) {
  const toggle = panel.getByRole('switch', { name: /Advanced capture/ });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

/** Debugger targets attached to a tab, as Chrome reports them. */
export const attachedTo = (worker, tabId) =>
  worker.evaluate(
    async (id) =>
      (await chrome.debugger.getTargets()).filter((t) => t.tabId === id && t.attached).length,
    tabId,
  );

export async function expectDetached(worker, tabId) {
  await expect.poll(() => attachedTo(worker, tabId), { timeout: 10_000 }).toBe(0);
}

export const activeCapture = (worker) =>
  worker.evaluate(
    async () => (await chrome.storage.session.get('activeCapture')).activeCapture ?? null,
  );

/** The newest snapshot record in the panel's IndexedDB. */
export const latestRecord = (panel) =>
  panel.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('webstyle');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('snapshots').objectStore('snapshots').getAll();
          req.onsuccess = () =>
            resolve(req.result.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null);
        };
      }),
  );

export const overlayCount = (page) =>
  page.evaluate(() => document.querySelectorAll('webstyle-overlay').length);

export async function setSetting(panel, patch) {
  await panel.evaluate(async (p) => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, ...p } });
  }, patch);
  await panel.reload();
  await panel.waitForSelector('[data-screen]');
}
