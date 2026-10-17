// Re-captures tests/unit/fixtures/*.raw.json by running the real extractor on each fixture page
// in Chromium. Run after `WXT_E2E=1 pnpm wxt build` when the collector changes, then review the
// snapshot test diffs. capturedAt is pinned so exporter snapshots stay stable.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, openFixture } from '../tests/e2e/harness.js';
import { startServers } from '../tests/e2e/server.js';

const NAMES = ['classic', 'dark', 'utility', 'cross-origin', 'large', 'lazy', 'canvas'];
const CAPTURED_AT = Date.UTC(2026, 9, 18, 12, 0, 0);
const out = new URL('../tests/unit/fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });

const stop = await startServers();
const { context, worker } = await launch();
try {
  for (const name of NAMES) {
    const { page, tabId } = await openFixture(context, worker, `${name}.html`);
    const raw = await worker.evaluate(async (id) => {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: id },
        files: ['/extractor.js'],
      });
      return result.result;
    }, tabId);
    raw.capturedAt = CAPTURED_AT;
    writeFileSync(new URL(`${name}.raw.json`, out), `${JSON.stringify(raw, null, 1)}\n`);
    console.log(`${name}: ${raw.elementsSampled} elements`);
    await page.close();
  }
} finally {
  await context.close();
  await stop();
}
