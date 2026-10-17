import { expect, launch, openPanel, test } from './harness.js';

async function panelFor(ext, url) {
  const page = await ext.context.newPage();
  await page.goto(url).catch(() => {});
  const tabId = await ext.worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs[tabs.length - 1].id;
  });
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  return { page, panel, tabId };
}

const clickExtract = (panel) =>
  panel.getByRole('button', { name: 'Extract design system' }).click();

test('AC-F1.6 a chrome:// page shows the Restricted state', async ({ ext }) => {
  const { panel } = await panelFor(ext, 'chrome://version/');
  await clickExtract(panel);
  await expect(panel.locator('[data-code=RESTRICTED_PAGE]')).toBeVisible();
  await expect(panel.getByRole('heading', { name: "Can't read this page" })).toBeVisible();
  await panel.getByRole('button', { name: 'Back' }).first().click();
  await expect(panel.locator('[data-screen=home]')).toBeVisible();
});

// AC-F1.7 (file:// without file access) is covered by unit tests: Chrome only reveals a tab's
// URL after a toolbar click or shortcut grants activeTab, which automation cannot perform, so
// here a file:// tab is indistinguishable from any tab without access.

test('AC-F1.8 a tab without access shows the No access state', async ({ ext }) => {
  // 127.0.0.2 is outside the test build's host permissions, like any tab without activeTab.
  const { panel } = await panelFor(ext, 'http://127.0.0.2:4173/classic.html');
  await clickExtract(panel);
  await expect(panel.locator('[data-code=NO_ACCESS]')).toBeVisible();
  await expect(panel.getByText(/Alt\+Shift\+D/).first()).toBeVisible();
});

test('AC-F1.9 a canvas-only page shows the Thin state with Re-run', async ({ ext }) => {
  const { panel } = await panelFor(ext, 'http://127.0.0.1:4173/canvas.html');
  await clickExtract(panel);
  await expect(panel.locator('[data-code=EMPTY_PAGE]')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Re-run' })).toBeVisible();
});

test('AC-F1.10 no result within 10 s shows the Error state with Retry', async ({ ext }) => {
  test.setTimeout(40_000);
  const { panel } = await panelFor(ext, 'http://127.0.0.1:4173/slow.html?block=14000');
  await panel.waitForTimeout(300);
  await clickExtract(panel);
  await expect(panel.locator('[data-code=TIMEOUT]')).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('AC-F1.11 navigating during a run cancels it with PAGE_CHANGED', async ({ ext }) => {
  const { panel, tabId } = await panelFor(ext, 'http://127.0.0.1:4173/slow.html?jank=1');
  await clickExtract(panel);
  await ext.worker.evaluate(
    (id) => chrome.tabs.update(id, { url: 'http://127.0.0.1:4173/classic.html' }),
    tabId,
  );
  await expect(panel.locator('[data-code=PAGE_CHANGED]')).toBeVisible({ timeout: 15_000 });
  await expect(
    panel.getByText('The page changed while it was being read. Try again.'),
  ).toBeVisible();
});

test('AC-F1.12 closing the panel during a run saves nothing', async () => {
  const ext = await launch();
  try {
    const { panel } = await panelFor(ext, 'http://127.0.0.1:4173/slow.html?block=2500');
    await panel.waitForTimeout(300);
    await clickExtract(panel);
    await expect(panel.locator('[data-screen=extracting]')).toBeVisible();
    await panel.close();
    await new Promise((r) => setTimeout(r, 4000));
    const check = await ext.context.newPage();
    await check.goto(`chrome-extension://${ext.extensionId}/sidepanel.html`);
    const count = await check.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('webstyle');
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('snapshots')) return resolve(0);
            const req = db.transaction('snapshots').objectStore('snapshots').count();
            req.onsuccess = () => resolve(req.result);
          };
        }),
    );
    expect(count).toBe(0);
  } finally {
    await ext.context.close();
  }
});
