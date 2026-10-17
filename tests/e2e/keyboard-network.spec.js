import { expect, lastCopied, openFixture, openPanel, recordClipboard, test } from './harness.js';

test('the main path works with the keyboard only: Home, Extract, Export, Copy', async ({ ext }) => {
  await recordClipboard(ext.context);
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);

  const focusAndPress = async (accessibleName, key = 'Enter', max = 40) => {
    for (let i = 0; i < max; i += 1) {
      await panel.keyboard.press('Tab');
      const name = await panel.evaluate(() => {
        const el = document.activeElement;
        return el?.getAttribute('aria-label') || el?.textContent?.trim() || '';
      });
      if (name === accessibleName) {
        await panel.keyboard.press(key);
        return;
      }
    }
    throw new Error(`Could not reach "${accessibleName}" with Tab`);
  };

  await focusAndPress('Extract design system');
  await panel.waitForSelector('[data-screen=results]');
  // The Colors tab has focus order after the header; arrow keys move between tabs.
  await focusAndPress('Colors', 'ArrowLeft');
  await expect(panel.getByRole('tab', { name: 'Export', selected: true })).toBeVisible();
  await focusAndPress('Copy');
  await expect(panel.getByText('Copied')).toBeVisible();
  expect(await lastCopied(panel)).toMatch(/^# Design system: 127\.0\.0\.1/);

  // The focus ring is visible on the focused control.
  const outline = await panel.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  expect(outline).toBe('solid');
});

test('a full extraction and export makes zero network requests from the extension', async ({
  ext,
}) => {
  const extensionRequests = [];
  const origin = `chrome-extension://${ext.extensionId}`;
  ext.context.on('request', (request) => {
    const frameUrl = (() => {
      try {
        return request.frame().url();
      } catch {
        return '';
      }
    })();
    const fromExtension = frameUrl.startsWith(origin) || request.serviceWorker() !== null;
    if (fromExtension && !request.url().startsWith(origin)) extensionRequests.push(request.url());
  });
  ext.worker.on?.('request', (request) => extensionRequests.push(request.url()));

  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await panel.getByRole('button', { name: 'Extract design system' }).click();
  await panel.waitForSelector('[data-screen=results]');
  for (const tab of ['Type', 'Layout', 'Components', 'Export'])
    await panel.getByRole('tab', { name: tab }).click();
  for (const format of ['dtcg', 'tailwind-v4', 'tailwind-v3', 'css-vars'])
    await panel.getByLabel('Format').selectOption(format);
  await panel.waitForTimeout(300);

  // connect-src 'none' is enforced too: a fetch from the panel is refused.
  const blocked = await panel.evaluate(() =>
    fetch('http://127.0.0.1:4173/classic.html').then(
      () => false,
      () => true,
    ),
  );
  expect(blocked).toBe(true);
  expect(
    extensionRequests.filter((u) => !u.startsWith('http://127.0.0.1:4173/classic.html')),
  ).toEqual([]);
});

test('the panel is ready in under 300 ms after opening', async ({ ext }) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await panel.reload();
  const readyAt = await panel.waitForFunction(
    () => document.querySelector('[data-screen=home] h1') && performance.now(),
  );
  expect(await readyAt.jsonValue()).toBeLessThan(300);
});
