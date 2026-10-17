import { FIXTURES, expect, openFixture, openPanel, test } from './harness.js';

async function extract(panel) {
  await panel.getByRole('button', { name: 'Extract design system' }).click();
  await panel.waitForSelector('[data-screen=results]', { timeout: 15_000 });
}

const snapshotIds = (panel) =>
  panel.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('webstyle');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('snapshots').objectStore('snapshots').getAllKeys();
          req.onsuccess = () => resolve(req.result);
        };
      }),
  );

test('AC-F1.1 the toolbar icon opens the side panel', async ({ ext }) => {
  const behavior = await ext.worker.evaluate(() => chrome.sidePanel.getPanelBehavior());
  expect(behavior.openPanelOnActionClick).toBe(true);
});

for (const name of ['classic', 'dark', 'utility', 'cross-origin', 'large']) {
  test(`AC-F1.4 extraction plus analysis finishes under 3 s on ${name}`, async ({ ext }) => {
    const { tabId } = await openFixture(ext.context, ext.worker, `${name}.html`);
    const panel = await openPanel(ext.context, ext.extensionId, tabId);
    const start = Date.now();
    await extract(panel);
    expect(Date.now() - start).toBeLessThan(3000);
    await expect(panel.getByRole('tab', { name: 'Colors', selected: true })).toBeVisible();
  });
}

test('AC-F1.5 the extractor causes no main-thread task over 50 ms on the large fixture', async ({
  ext,
}) => {
  const { page, tabId } = await openFixture(ext.context, ext.worker, 'large.html');
  await page.evaluate(() => {
    window.longTasks = [];
    new PerformanceObserver((list) =>
      list.getEntries().forEach((e) => window.longTasks.push(e.duration)),
    ).observe({
      type: 'longtask',
    });
  });
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await extract(panel);
  await page.waitForTimeout(200);
  const longest = await page.evaluate(() => Math.max(0, ...window.longTasks));
  expect(longest).toBeLessThanOrEqual(50);
  await panel.getByRole('tab', { name: 'Export' }).click();
  await expect(panel.locator('pre')).toContainText('stopped at the element limit');
});

test('AC-F1.2 the shortcut flag opens straight into extraction without a click', async ({
  ext,
}) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  // What the Alt+Shift+D handler writes after opening the panel.
  await ext.worker.evaluate(
    (id) =>
      chrome.storage.session.set({ pendingExtract: { tabId: id, windowId: 1, at: Date.now() } }),
    tabId,
  );
  await panel.waitForSelector('[data-screen=results]', { timeout: 15_000 });
  expect(await ext.worker.evaluate(() => chrome.storage.session.get('pendingExtract'))).toEqual({});
});

test('AC-F1.3 repeated clicks start one run only', async ({ ext }) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  const button = panel.getByRole('button', { name: 'Extract design system' });
  await button.evaluate((b) => {
    b.click();
    b.click();
    b.click();
  });
  await panel.waitForSelector('[data-screen=results]');
  await panel.waitForTimeout(300);
  expect(await snapshotIds(panel)).toHaveLength(1);
});

test('AC-F1.13 Re-run replaces the snapshot; Extract from Home creates a new one', async ({
  ext,
}) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await extract(panel);
  const [first] = await snapshotIds(panel);
  await panel.getByRole('button', { name: 'Menu' }).click();
  await panel.getByRole('menuitem', { name: 'Re-run' }).click();
  await panel.waitForSelector('[data-screen=results]');
  await panel.waitForTimeout(200);
  expect(await snapshotIds(panel)).toEqual([first]);
  await panel.getByRole('button', { name: 'Back' }).click();
  await extract(panel);
  await panel.waitForTimeout(200);
  expect(await snapshotIds(panel)).toHaveLength(2);
});

test('AC-F2.1 to AC-F2.6 the Colors tab shows roles and scales from the page', async ({ ext }) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await extract(panel);
  for (const role of ['background', 'text', 'text-muted', 'border', 'primary']) {
    await expect(panel.locator('li', { hasText: role }).first()).toBeVisible();
  }
  await expect(panel.getByRole('button', { name: 'Copy #2563eb' }).first()).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Show blue-600' })).toBeVisible();
  expect(FIXTURES).toContain('127.0.0.1');
});
