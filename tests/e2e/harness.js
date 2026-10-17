// Shared Playwright setup: loads the unpacked extension into Chromium and opens the side panel
// page as a tab that targets a fixture tab.
import { test as base, chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FIXTURES = 'http://127.0.0.1:4173';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const E2E_BUILD = `${root}.output/chrome-mv3-e2e`;
export const STORE_BUILD = `${root}.output/chrome-mv3`;

// Use the preinstalled Chromium when present (CI images and sandboxes), otherwise Playwright's.
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

export async function launch(extensionPath = E2E_BUILD) {
  const context = await chromium.launchPersistentContext('', {
    executablePath,
    // Extensions need full Chromium in new headless mode, not the headless shell.
    channel: executablePath ? undefined : 'chromium',
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  return { context, worker, extensionId };
}

/** Opens a fixture page and returns its tab id as Chrome sees it. */
export async function openFixture(context, worker, name) {
  const page = await context.newPage();
  const url = `${FIXTURES}/${name}`;
  await page.goto(url);
  const tabId = await worker.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0]?.id,
    url,
  );
  return { page, tabId, url };
}

/**
 * Records what the panel writes to the clipboard. Chrome will not grant clipboard-read to an
 * extension origin under automation, so tests read window.copied instead. The real writeText
 * still runs, so a failing write still shows the CLIPBOARD_FAILED toast.
 */
export async function recordClipboard(context) {
  await context.addInitScript(() => {
    if (!location.protocol.startsWith('chrome-extension')) return;
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    window.copied = [];
    navigator.clipboard.writeText = async (text) => {
      await original(text);
      window.copied.push(text);
    };
  });
}

export const lastCopied = (panel) => panel.evaluate(() => window.copied.at(-1));

/** Opens the side panel UI as a tab, pointed at tabId. Panel width is the 360 px design width. */
export async function openPanel(context, extensionId, tabId) {
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 360, height: 720 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tabId}`);
  await panel.waitForSelector('[data-screen]');
  return panel;
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  ext: async ({}, use) => {
    const ext = await launch();
    await use(ext);
    await ext.context.close();
  },
});

export { expect };
