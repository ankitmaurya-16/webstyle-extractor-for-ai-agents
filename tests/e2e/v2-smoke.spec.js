import { expect, openFixture, openPanel, test } from './harness.js';

const TABS = ['Colors', 'Type', 'Layout', 'Motion', 'Components', 'Insights', 'Export'];

for (const name of ['classic', 'dark', 'utility']) {
  test(`v2 panel renders every results tab without errors on ${name}`, async ({ ext }) => {
    const { tabId } = await openFixture(ext.context, ext.worker, `${name}.html`);
    const panel = await openPanel(ext.context, ext.extensionId, tabId);
    const errors = [];
    panel.on('pageerror', (e) => errors.push(e.message));
    panel.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await panel.getByRole('button', { name: 'Extract design system' }).click();
    await panel.waitForSelector('[data-screen=results]', { timeout: 15_000 });
    for (const tab of TABS) {
      await panel.getByRole('tab', { name: tab }).click();
      await expect(panel.getByRole('tab', { name: tab, selected: true })).toBeVisible();
      if (process.env.SHOTS)
        await panel.screenshot({ path: `${process.env.SHOTS}/${name}-${tab}.png`, fullPage: true });
    }
    for (const screen of [
      ['Settings', 'settings'],
      ['History', 'history'],
    ]) {
      await panel.getByRole('button', { name: 'Back' }).first().click();
      await panel.getByRole('button', { name: screen[0] }).click();
      await panel.waitForSelector(`[data-screen=${screen[1]}]`);
      if (process.env.SHOTS)
        await panel.screenshot({
          path: `${process.env.SHOTS}/${name}-${screen[1]}.png`,
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
  });
}
