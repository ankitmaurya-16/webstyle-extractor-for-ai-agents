// Re-captures tests/unit/fixtures/*.raw.json by running the real extractor on each fixture page
// in Chromium. Run after `WXT_E2E=1 pnpm wxt build` when the collector changes, then review the
// snapshot test diffs. capturedAt is pinned so exporter snapshots stay stable.
//
//   node scripts/capture-fixtures.js                 every fixture
//   node scripts/capture-fixtures.js states motion   only these (paths under tests/fixtures, no .html)
//
// Options per fixture come from CAPTURE_OPTIONS. Nested names such as frameworks/tailwind are
// written as frameworks-tailwind.raw.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, openFixture } from '../tests/e2e/harness.js';
import { startServers } from '../tests/e2e/server.js';

export const DEFAULT_NAMES = [
  'classic',
  'dark',
  'utility',
  'cross-origin',
  'large',
  'lazy',
  'canvas',
  'components',
];
const CAPTURE_OPTIONS = { coverage: { autoScroll: true }, lazy: { autoScroll: false } };
const CAPTURED_AT = Date.UTC(2026, 9, 18, 12, 0, 0);
const out = new URL('../tests/unit/fixtures/', import.meta.url);
mkdirSync(out, { recursive: true });

const names = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_NAMES;

// Another run may already serve the fixtures; reuse it.
let stop = async () => {};
try {
  stop = await startServers();
} catch (error) {
  if (error?.code !== 'EADDRINUSE') throw error;
}
const { context, worker } = await launch();
try {
  for (const name of names) {
    const { page, tabId } = await openFixture(context, worker, `${name}.html`);
    const raw = await worker.evaluate(
      async ({ id, options }) => {
        await chrome.scripting.executeScript({
          target: { tabId: id, allFrames: true },
          files: ['/extractor.js'],
        });
        const results = await chrome.scripting.executeScript({
          target: { tabId: id, frameIds: [0] },
          func: (opts) => self.__webstyle.collect(opts),
          args: [options],
        });
        return results[0].result;
      },
      { id: tabId, options: CAPTURE_OPTIONS[name] ?? {} },
    );
    raw.capturedAt = CAPTURED_AT;
    writeFileSync(
      new URL(`${name.replace(/\//g, '-')}.raw.json`, out),
      `${JSON.stringify(raw, null, 1)}\n`,
    );
    console.log(`${name}: ${raw.elementsSampled} elements`);
    await page.close();
  }
} finally {
  await context.close();
  await stop();
}
