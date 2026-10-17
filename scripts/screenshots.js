// Captures README screenshots (360 px panel) into docs/images and Chrome Web Store screenshots
// (1280 x 800: the fixture page beside the panel) into store/. Needs the e2e build.
import { mkdirSync } from 'node:fs';
import { launch, openFixture, openPanel } from '../tests/e2e/harness.js';
import { startServers } from '../tests/e2e/server.js';

const images = new URL('../docs/images/', import.meta.url).pathname;
const store = new URL('../store/', import.meta.url).pathname;
mkdirSync(images, { recursive: true });
mkdirSync(store, { recursive: true });

const stop = await startServers();
const { context, worker, extensionId } = await launch();
try {
  const { page, tabId } = await openFixture(context, worker, 'classic.html');
  const panel = await openPanel(context, extensionId, tabId);
  await panel.setViewportSize({ width: 360, height: 800 });
  await panel.screenshot({ path: `${images}home.png` });
  await panel.getByRole('button', { name: 'Extract design system' }).click();
  await panel.waitForSelector('[data-screen=results]');
  await panel.getByRole('button', { name: 'Show blue-600' }).click();
  const shots = [
    ['colors', 'Colors'],
    ['type', 'Type'],
    ['layout', 'Layout'],
    ['components', 'Components'],
    ['export', 'Export'],
  ];
  await page.setViewportSize({ width: 920, height: 800 });
  for (const [file, tab] of shots) {
    await panel.getByRole('tab', { name: tab }).click();
    await panel.mouse.move(0, 0);
    await panel.screenshot({ path: `${images}${file}.png` });
  }

  // Store screenshots: page on the left, panel on the right, like Chrome shows them.
  const composer = await context.newPage();
  await composer.setViewportSize({ width: 1280, height: 800 });
  for (const [file, tab] of shots) {
    await panel.getByRole('tab', { name: tab }).click();
    const pageShot = (await page.screenshot()).toString('base64');
    const panelShot = (await panel.screenshot()).toString('base64');
    await composer.setContent(`<body style="margin:0;display:flex;background:#0a0a0b">
      <img src="data:image/png;base64,${pageShot}" width="920" height="800">
      <img src="data:image/png;base64,${panelShot}" width="360" height="800" style="border-left:1px solid #26262a;box-sizing:border-box">
    </body>`);
    await composer.screenshot({ path: `${store}screenshot-${file}.png` });
  }
  console.log('wrote docs/images and store screenshots');
} finally {
  await context.close();
  await stop();
}
