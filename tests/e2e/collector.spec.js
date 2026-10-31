import { expect, openFixture, test } from './harness.js';

async function collect(ext, name) {
  const { tabId } = await openFixture(ext.context, ext.worker, name);
  // The v2 extractor installs self.__webstyle; collect() is then called with options (AC-F23.2).
  return ext.worker.evaluate(async (id) => {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['/extractor.js'] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => self.__webstyle.collect({}),
    });
    return result.result;
  }, tabId);
}

const count = (raw, kind) =>
  raw.samples.filter((s) => s.kind === kind).reduce((n, s) => n + s.count, 0);

test('AC-F5.1 buttons are button elements, button and submit inputs, and role="button"', async ({
  ext,
}) => {
  const raw = await collect(ext, 'components.html');
  expect(count(raw, 'button')).toBe(4);
});

test('AC-F5.3 inputs are text-like inputs, textarea and select', async ({ ext }) => {
  const raw = await collect(ext, 'components.html');
  expect(count(raw, 'input')).toBe(5);
});

test('AC-F5.4 links come from running text, not links styled as buttons', async ({ ext }) => {
  const raw = await collect(ext, 'components.html');
  expect(count(raw, 'link')).toBe(2);
});

test('the collector reads only styles: no page text or form values in the snapshot', async ({
  ext,
}) => {
  const { page, tabId } = await openFixture(ext.context, ext.worker, 'components.html');
  await page.getByLabel('Email').fill('secret@example.com');
  const raw = await ext.worker.evaluate(async (id) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: id },
      files: ['/extractor.js'],
    });
    return result.result;
  }, tabId);
  const text = JSON.stringify(raw);
  expect(text).not.toContain('secret@example.com');
  expect(text).not.toContain('Filler');
  expect(text).not.toContain('inline link');
  // The page itself is untouched.
  expect(await page.evaluate(() => document.documentElement.outerHTML)).not.toContain('webstyle');
});

test('AC-F2.1 and AC-F4.5 the collector skips transparent fills and reads @media breakpoints', async ({
  ext,
}) => {
  const raw = await collect(ext, 'classic.html');
  expect(raw.colors.some((c) => c.value === 'rgba(0, 0, 0, 0)')).toBe(false);
  expect([...raw.breakpoints].sort((a, b) => a - b)).toEqual([640, 768, 1024]);
  expect(raw.cssVariables['--brand']).toBe('#2563eb');
  expect(raw.stylesheets).toEqual({ readable: 1, unreadable: 0 });
});

test('the collector stops at the element cap and marks the snapshot truncated', async ({ ext }) => {
  const raw = await collect(ext, 'large.html');
  expect(raw.elementsSampled).toBe(4000);
  expect(raw.truncated).toBe(true);
});

test('cross-origin stylesheets are counted as unreadable while computed styles still read', async ({
  ext,
}) => {
  const raw = await collect(ext, 'cross-origin.html');
  expect(raw.stylesheets.unreadable).toBe(1);
  expect(raw.colors.some((c) => c.value === 'rgb(234, 88, 12)')).toBe(true);
});
