import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { exportStyleguide } from '../../src/export/styleguide.js';
import { expect, openFixture, openPanel, test } from './harness.js';
import { analyze } from '../../src/analyze/index.js';
import { toCapture, withOverrideCapture } from '../../src/analyze/assemble.js';
import { extractFrom, setSetting, turnOnAdvanced } from './v2-helpers.js';

const require = createRequire(import.meta.url);
let n = 0;
const newId = () => `e2e-${(n += 1)}`;
const classic = () => {
  const raw = JSON.parse(
    readFileSync(new URL('../unit/fixtures/classic.raw.json', import.meta.url), 'utf8'),
  );
  return analyze(withOverrideCapture([toCapture(raw, newId)], newId));
};

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test('AC-F23.3 every v2 feature together makes zero network requests from the extension', async ({
  ext,
}) => {
  const origin = `chrome-extension://${ext.extensionId}`;
  const requests = [];
  ext.context.on('request', (request) => {
    let frameUrl;
    try {
      frameUrl = request.frame().url();
    } catch {
      frameUrl = '';
    }
    const fromExtension = frameUrl.startsWith(origin) || request.serviceWorker() !== null;
    if (
      fromExtension &&
      !request.url().startsWith(origin) &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    ) {
      requests.push(request.url());
    }
  });
  const { page, tabId } = await openFixture(ext.context, ext.worker, 'cross-origin.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await setSetting(panel, { highlightEnabled: true, includeScreenshots: true });
  await turnOnAdvanced(panel);
  await extractFrom(panel);
  for (const tab of ['Colors', 'Type', 'Layout', 'Motion', 'Components', 'Insights', 'Export']) {
    await panel.getByRole('tab', { name: tab }).click();
  }
  await panel.getByRole('tab', { name: 'Colors' }).click();
  await panel
    .getByRole('button', { name: /Where is .* used\?/ })
    .first()
    .click();
  await panel.getByRole('tab', { name: 'Export' }).click();
  for (const format of ['styleguide', 'figma', 'shadcn', 'prompt']) {
    await panel.locator('#export-format').selectOption(format);
  }
  await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download all (.zip)' }).click(),
  ]);
  await panel.getByRole('button', { name: 'Back' }).first().click();
  await panel.getByRole('button', { name: 'Pick element' }).click();
  await page.keyboard.press('Escape');
  await panel.waitForSelector('[data-screen=home]');
  expect(requests).toEqual([]);
});

test('AC-F34.1 AC-F34.5 the style guide makes no requests and passes axe-core', async ({ ext }) => {
  const html = exportStyleguide(classic(), '1.0.0');
  const page = await ext.context.newPage();
  const attempted = [];
  await page.route('**/*', (route) => {
    attempted.push(route.request().url());
    return route.abort();
  });
  await page.setContent(html, { waitUntil: 'load' });
  expect(attempted).toEqual([]);
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    window.axe.run(document, { resultTypes: ['violations'] }),
  );
  const serious = result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

for (const theme of ['dark', 'light']) {
  test(`AC-F42.3 every screen renders in the ${theme} panel theme`, async ({ ext }, info) => {
    const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
    const panel = await openPanel(ext.context, ext.extensionId, tabId);
    await setSetting(panel, { panelTheme: theme });
    await expect(panel.locator('html')).toHaveAttribute('data-theme', theme);
    const shots = [];
    const shot = async (name) =>
      shots.push(
        await panel.screenshot({ path: info.outputPath(`${theme}-${name}.png`), fullPage: true }),
      );
    await shot('home');
    await extractFrom(panel);
    for (const tab of ['Colors', 'Type', 'Layout', 'Motion', 'Components', 'Insights', 'Export']) {
      await panel.getByRole('tab', { name: tab }).click();
      await shot(tab.toLowerCase());
    }
    await panel.getByRole('button', { name: 'Back' }).first().click();
    await panel.getByRole('button', { name: 'Settings' }).click();
    await shot('settings');
    await panel.getByRole('button', { name: 'Back' }).first().click();
    await panel.getByRole('button', { name: 'History' }).click();
    await shot('history');
    const bg = await panel.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(theme === 'dark' ? 'rgb(10, 10, 11)' : 'rgb(255, 255, 255)');
  });
}
