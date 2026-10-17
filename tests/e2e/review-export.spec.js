import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { expect, lastCopied, openFixture, openPanel, recordClipboard, test } from './harness.js';

async function setup(ext, fixture = 'classic.html') {
  await recordClipboard(ext.context);
  const { tabId } = await openFixture(ext.context, ext.worker, fixture);
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await panel.getByRole('button', { name: 'Extract design system' }).click();
  await panel.waitForSelector('[data-screen=results]', { timeout: 15_000 });
  return { panel, tabId };
}

const previewText = (panel) =>
  panel
    .locator('pre > div')
    .evaluateAll(
      (rows) => rows.map((r) => r.lastChild.textContent.replace(/^ $/, '')).join('\n') + '\n',
    );

test('AC-F2.9 clicking a swatch copies the hex and shows Copied', async ({ ext }) => {
  const { panel } = await setup(ext);
  await panel.getByRole('button', { name: 'Copy #2563eb' }).first().click();
  await expect(panel.getByText('Copied')).toBeVisible();
  expect(await lastCopied(panel)).toBe('#2563eb');
});

test('AC-F6.1 AC-F6.7 a rename shows in the export and survives closing the panel', async ({
  ext,
}) => {
  const { panel, tabId } = await setup(ext);
  const row = panel.locator('li', { hasText: 'gray-900' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Actions for gray-900' }).click();
  await panel.getByRole('menuitem', { name: 'Rename' }).click();
  const field = panel.getByRole('textbox', { name: 'New name' });
  await field.fill('Bad Name');
  await field.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('lowercase letters');
  await field.fill('ink');
  await field.press('Enter');
  await expect(panel.getByText('ink', { exact: true }).first()).toBeVisible();
  await panel.getByRole('tab', { name: 'Export' }).click();
  await panel.getByLabel('Format').selectOption('css-vars');
  await expect(panel.locator('pre')).toContainText('--color-ink: #111827;');
  await panel.waitForTimeout(700);
  await panel.close();

  const again = await openPanel(ext.context, ext.extensionId, tabId);
  await again
    .getByRole('button', { name: /127\.0\.0\.1/ })
    .first()
    .click();
  await expect(again.getByText('ink', { exact: true }).first()).toBeVisible();
  // AC-F7.9 the chosen format is remembered.
  await again.getByRole('tab', { name: 'Export' }).click();
  await expect(again.getByLabel('Format')).toHaveValue('css-vars');
});

test('AC-F6.4 AC-F6.8 exclude hides a token, Reset to extracted restores it after confirming', async ({
  ext,
}) => {
  const { panel } = await setup(ext);
  await panel.getByRole('button', { name: 'Show red-100' }).click();
  const row = panel.locator('li', { hasText: 'red-100' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Actions for red-100' }).click();
  await panel.getByRole('menuitem', { name: 'Exclude' }).click();
  await expect(panel.getByRole('button', { name: '1 excluded' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Export' }).click();
  await expect(panel.locator('pre')).not.toContainText('red-100');
  await panel.getByRole('button', { name: 'Menu' }).click();
  await panel.getByRole('menuitem', { name: 'Reset to extracted' }).click();
  const dialog = panel.getByRole('dialog');
  await expect(dialog).toContainText('Reset to extracted?');
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(panel.locator('pre')).toContainText('red-100');
});

test('AC-F7.2 AC-F7.3 Copy puts exactly the previewed text on the clipboard', async ({ ext }) => {
  const { panel } = await setup(ext);
  await panel.getByRole('tab', { name: 'Export' }).click();
  for (const format of ['design-md', 'dtcg', 'tailwind-v4', 'tailwind-v3', 'css-vars']) {
    await panel.getByLabel('Format').selectOption(format);
    const shown = await previewText(panel);
    await panel.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect.poll(() => lastCopied(panel)).toBe(shown);
    await expect(panel.getByText('Copied').first()).toBeVisible();
  }
});

test('AC-F7.4 AC-F7.5 Download and Download all save named files', async ({ ext }) => {
  const { panel } = await setup(ext);
  await panel.getByRole('tab', { name: 'Export' }).click();
  await panel.getByLabel('Format').selectOption('design-md');
  const shown = await previewText(panel);
  const [file] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(file.suggestedFilename()).toBe('127.0.0.1-DESIGN.md');
  expect(await readFile(await file.path(), 'utf8')).toBe(shown);
  const [zip] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download all (.zip)' }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe('127.0.0.1-webstyle.zip');
  const files = unzipSync(new Uint8Array(await readFile(await zip.path())));
  expect(Object.keys(files).sort()).toEqual([
    'DESIGN.md',
    'tailwind.config.js',
    'theme.css',
    'tokens.json',
    'variables.css',
  ]);
});

test('AC-F8.2 to AC-F8.5 History lists, opens and deletes snapshots', async ({ ext }) => {
  const { panel } = await setup(ext);
  await panel.getByRole('button', { name: 'Back' }).click();
  await panel.getByRole('button', { name: 'History' }).click();
  await expect(panel.locator('[data-screen=history] li')).toHaveCount(1);
  await expect(panel.getByText(/^Today \d\d:\d\d$/)).toBeVisible();
  await panel
    .getByRole('button', { name: /127\.0\.0\.1/ })
    .first()
    .click();
  await expect(panel.locator('[data-screen=results]')).toBeVisible();
  await panel.getByRole('button', { name: 'Back' }).click();
  await panel.getByRole('button', { name: 'History' }).click();
  await panel.getByRole('button', { name: 'Actions for 127.0.0.1' }).click();
  await panel.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = panel.getByRole('dialog');
  await expect(dialog).toContainText('Delete this snapshot?');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(panel.getByText('No snapshots yet')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Extract design system' })).toBeVisible();
});

test('the panel works at 320 px wide without horizontal page scroll', async ({ ext }) => {
  const { panel } = await setup(ext);
  await panel.setViewportSize({ width: 320, height: 640 });
  for (const tab of ['Colors', 'Type', 'Layout', 'Components', 'Export']) {
    await panel.getByRole('tab', { name: tab }).click();
    const overflow = await panel.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, tab).toBeLessThanOrEqual(0);
  }
});
