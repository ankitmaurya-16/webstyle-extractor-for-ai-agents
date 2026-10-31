import { statSync } from 'node:fs';
import { expect, test, STORE_BUILD } from './harness.js';

// The store build is made by `pnpm test:e2e` before Playwright runs.
const size = (file) => statSync(`${STORE_BUILD}/${file}`).size;

test('AC-F26.10 the picker bundle is 15 KB or less', () => {
  expect(size('picker.js')).toBeLessThanOrEqual(15 * 1024);
});

test('AC-F30.9 the highlighter bundle is 15 KB or less', () => {
  expect(size('highlighter.js')).toBeLessThanOrEqual(15 * 1024);
});

test('the core extractor bundle is 70 KB or less', () => {
  expect(size('extractor.js')).toBeLessThanOrEqual(70 * 1024);
});
