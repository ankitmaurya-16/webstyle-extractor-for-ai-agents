import { expect, openFixture, openPanel, test } from './harness.js';
import { extractFrom, latestRecord, overlayCount, setSetting } from './v2-helpers.js';

async function startPicking(ext, fixture = 'components.html') {
  const fx = await openFixture(ext.context, ext.worker, fixture);
  const panel = await openPanel(ext.context, ext.extensionId, fx.tabId);
  await panel.getByRole('button', { name: 'Pick element' }).click();
  await panel.waitForSelector('[data-screen=picking]');
  await expect.poll(() => overlayCount(fx.page)).toBe(1);
  return { ...fx, panel };
}

test('AC-F26.1 AC-F26.11 the picker outlines the element under the pointer and reports tag and size', async ({
  ext,
}) => {
  const { page, panel } = await startPicking(ext);
  await expect(panel.getByTestId('pick-current')).toContainText('Current:');
  const button = page.locator('button.b').first();
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(panel.getByTestId('pick-current')).toContainText('button');
});

test('AC-F26.2 AC-F26.5 AC-F26.7 a click picks without reaching the page and saves a component snapshot', async ({
  ext,
}) => {
  const { page, panel } = await startPicking(ext);
  await page.evaluate(() => {
    window.pageClicks = 0;
    document.addEventListener('click', () => (window.pageClicks += 1));
  });
  const attrsBefore = await page.evaluate(() => document.body.outerHTML.length);
  const box = await page.locator('button.b').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await panel.waitForSelector('[data-screen=results]', { timeout: 15_000 });
  expect(await page.evaluate(() => window.pageClicks)).toBe(0);
  expect(await overlayCount(page)).toBe(0);
  expect(await page.evaluate(() => document.body.outerHTML.length)).toBe(attrsBefore);
  const record = await latestRecord(panel);
  expect(record.kind).toBe('component');
  expect(record.rootSelector).toBeTruthy();
});

test('AC-F26.3 AC-F26.4 Escape cancels and removes the overlay', async ({ ext }) => {
  const { page, panel } = await startPicking(ext);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await panel.waitForSelector('[data-screen=home]');
  expect(await overlayCount(page)).toBe(0);
});

test('AC-F26.4 the picker overlay is removed when the panel closes', async ({ ext }) => {
  const { page, panel } = await startPicking(ext);
  await panel.close();
  await expect.poll(() => overlayCount(page)).toBe(0);
});

test('AC-F26.4 the picker overlay is removed on Cancel in the panel', async ({ ext }) => {
  const { page, panel } = await startPicking(ext);
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(() => overlayCount(page)).toBe(0);
});

async function highlightReady(ext) {
  const fx = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, fx.tabId);
  await setSetting(panel, { highlightEnabled: true });
  await extractFrom(panel);
  return { ...fx, panel };
}

test('AC-F30.1 eye buttons appear only when Highlight on page is on', async ({ ext }) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await extractFrom(panel);
  await expect(panel.getByRole('button', { name: /Where is .* used\?/ })).toHaveCount(0);
});

test('AC-F30.3 AC-F30.6 highlighting shows a count and outlines without changing the page', async ({
  ext,
}) => {
  const { page, panel } = await highlightReady(ext);
  const before = await page.evaluate(() => document.body.outerHTML);
  const eye = panel.getByRole('button', { name: 'Where is white used?' }).first();
  await eye.click();
  await expect(eye).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => overlayCount(page)).toBe(1);
  expect(await page.evaluate(() => document.body.outerHTML)).toBe(before);
  await eye.click();
  await expect.poll(() => overlayCount(page)).toBe(0);
});

test('AC-F30.5 outlines clear when the panel closes', async ({ ext }) => {
  const { page, panel } = await highlightReady(ext);
  await panel.getByRole('button', { name: 'Where is white used?' }).first().click();
  await expect.poll(() => overlayCount(page)).toBe(1);
  await panel.close();
  await expect.poll(() => overlayCount(page)).toBe(0);
});

test('AC-F30.5 outlines clear on navigation and when another token is chosen', async ({ ext }) => {
  const { page, panel } = await highlightReady(ext);
  const eyes = panel.getByRole('button', { name: /Where is .* used\?/ });
  await eyes.nth(0).click();
  await expect.poll(() => overlayCount(page)).toBe(1);
  await eyes.nth(1).click();
  await expect(eyes.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  expect(await overlayCount(page)).toBe(0);
});

/** Top edges of the highlight outlines, read through CDP because the overlay's root is closed. */
async function outlineTops(context, page) {
  const cdp = await context.newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const ids = [];
  const walk = (node) => {
    if (
      node.attributes?.includes('class') &&
      node.attributes[node.attributes.indexOf('class') + 1] === 'o'
    ) {
      ids.push(node.nodeId);
    }
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(child);
  };
  walk(root);
  const tops = [];
  for (const nodeId of ids) {
    const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
    tops.push(Math.round(model.border[1]));
  }
  await cdp.detach();
  return tops;
}

test('AC-F30.4 outlines follow scrolling', async ({ ext }) => {
  const { page, panel } = await highlightReady(ext);
  await panel.getByRole('button', { name: 'Where is white used?' }).first().click();
  await expect.poll(() => overlayCount(page)).toBe(1);
  await expect.poll(async () => (await outlineTops(ext.context, page)).length).toBeGreaterThan(0);
  const before = await outlineTops(ext.context, page);
  await page.evaluate(() => window.scrollBy(0, 120));
  await expect.poll(async () => (await outlineTops(ext.context, page))[0]).toBe(before[0] - 120);
});
