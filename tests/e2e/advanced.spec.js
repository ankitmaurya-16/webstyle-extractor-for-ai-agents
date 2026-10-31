import { expect, openFixture, openPanel, test } from './harness.js';
import {
  activeCapture,
  attachedTo,
  expectDetached,
  extractFrom,
  latestRecord,
  turnOnAdvanced,
  waitForAdvancedStage,
} from './v2-helpers.js';

test('AC-F23.10 the Advanced capture switch explains the debugging bar before first use', async ({
  ext,
}) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await expect(panel.getByText(/started debugging this browser/)).toBeVisible();
});

test('AC-F23.5 AC-F13.3 AC-F23.6 stages run in order, the other theme is emulated and the debugger detaches after success', async ({
  ext,
}) => {
  const { page, tabId } = await openFixture(ext.context, ext.worker, 'dark-media.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await turnOnAdvanced(panel);
  const seen = [];
  await panel.exposeFunction('reportStage', (s) => seen.push(s));
  await panel.evaluate(() => {
    new MutationObserver(() => {
      const current = document.querySelector('[aria-current=step]');
      if (current) window.reportStage(current.dataset.stage);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await extractFrom(panel);
  const order = [...new Set(seen)];
  const expected = ['reading', 'attach', 'deep-scan', 'dark', 'states', 'analyzing'].filter((s) =>
    order.includes(s),
  );
  expect(order.filter((s) => expected.includes(s))).toEqual(expected);
  expect(order).toContain('deep-scan');
  await expect(panel.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  const record = await latestRecord(panel);
  expect(record.captures.some((c) => c.kind === 'theme' && c.method === 'emulated')).toBe(true);
  await expectDetached(ext.worker, tabId);
  expect(await activeCapture(ext.worker)).toBeNull();
  // Emulation is cleared: the page is back to its own color scheme.
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false);
});

test('AC-F23.4 deep scan recovers breakpoints on the cross-origin fixture', async ({ ext }) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'cross-origin.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await turnOnAdvanced(panel);
  await extractFrom(panel);
  const record = await latestRecord(panel);
  expect(record.extracted.meta.capture.deepScan).toBe(true);
  expect(record.extracted.breakpoints.length).toBeGreaterThan(0);
  await expectDetached(ext.worker, tabId);
});

test('AC-F12.5 forced states replace stylesheet states and are cleared afterwards', async ({
  ext,
}) => {
  const { page, tabId } = await openFixture(ext.context, ext.worker, 'states.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await turnOnAdvanced(panel);
  await extractFrom(panel);
  const record = await latestRecord(panel);
  expect(record.extracted.components.some((r) => r.stateSource === 'forced')).toBe(true);
  await expectDetached(ext.worker, tabId);
  // No element is left in a forced :hover state.
  expect(await page.evaluate(() => document.querySelectorAll(':hover').length)).toBeLessThanOrEqual(
    3,
  );
});

test('AC-F24.1 AC-F24.5 widths are captured and the device metrics override is cleared', async ({
  ext,
}) => {
  const { page, tabId } = await openFixture(ext.context, ext.worker, 'responsive.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await turnOnAdvanced(panel);
  await extractFrom(panel);
  const record = await latestRecord(panel);
  expect(record.captures.filter((c) => c.kind === 'width').map((c) => c.viewportWidth)).toEqual(
    expect.arrayContaining([375, 768]),
  );
  expect(await page.evaluate(() => window.innerWidth)).toBe(1280);
  await panel.getByRole('tab', { name: 'Layout' }).click();
  await expect(panel.getByText('Responsive', { exact: true })).toBeVisible();
  await expectDetached(ext.worker, tabId);
});

async function startAdvancedRun(ext, fixture = 'large.html') {
  const fx = await openFixture(ext.context, ext.worker, fixture);
  const panel = await openPanel(ext.context, ext.extensionId, fx.tabId);
  await turnOnAdvanced(panel);
  await panel.getByRole('button', { name: 'Extract design system' }).click();
  await waitForAdvancedStage(panel);
  expect(await attachedTo(ext.worker, fx.tabId)).toBe(1);
  return { ...fx, panel };
}

test('AC-F23.6 the debugger detaches after Cancel', async ({ ext }) => {
  const { panel, tabId } = await startAdvancedRun(ext);
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expectDetached(ext.worker, tabId);
  expect(await activeCapture(ext.worker)).toBeNull();
});

test('AC-F23.6 the debugger detaches when the panel closes', async ({ ext }) => {
  const { panel, tabId } = await startAdvancedRun(ext);
  await panel.close();
  await expectDetached(ext.worker, tabId);
});

test('AC-F23.6 the debugger detaches when the page navigates', async ({ ext }) => {
  const { page, tabId } = await startAdvancedRun(ext);
  await page.goto('http://127.0.0.1:4173/classic.html');
  await expectDetached(ext.worker, tabId);
});

test('AC-F23.6 the debugger detaches when the tab closes', async ({ ext }) => {
  const { page, tabId } = await startAdvancedRun(ext);
  await page.close();
  await expect
    .poll(() =>
      ext.worker.evaluate(
        async (id) => (await chrome.debugger.getTargets()).filter((t) => t.tabId === id).length,
        tabId,
      ),
    )
    .toBe(0);
  await expect.poll(() => activeCapture(ext.worker)).toBeNull();
});

test('AC-F23.7 a service worker restart during a capture detaches and clears activeCapture', async ({
  ext,
}) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  // Leave the state a killed worker would: debugger attached and activeCapture recorded.
  await ext.worker.evaluate(async (id) => {
    await chrome.debugger.attach({ tabId: id }, '1.3');
    await chrome.storage.session.set({
      activeCapture: { tabId: id, debuggerAttached: true, overlays: [], startedAt: Date.now() },
    });
  }, tabId);
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  const cdp = await ext.context.newCDPSession(panel);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  // Any message wakes the worker, which runs its start-up recovery.
  await panel.evaluate(() => chrome.runtime.sendMessage({ type: 'PING' }).catch(() => {}));
  const worker =
    ext.context.serviceWorkers().at(-1) ?? (await ext.context.waitForEvent('serviceworker'));
  await expectDetached(worker, tabId);
  await expect.poll(() => activeCapture(worker)).toBeNull();
});
