// Fails when the built extension breaks the size budgets in docs/non-functional.md and v2 spec
// 11.2.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = new URL(`../.output/${process.argv[2] ?? 'chrome-mv3'}/`, import.meta.url).pathname;
if (!existsSync(dir)) {
  console.error('Run pnpm build first.');
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const size = (file) => readFileSync(join(dir, file)).length;

// Panel initial JavaScript: the chunks sidepanel.html loads. The analysis worker and lazily
// imported chunks are not part of the first load.
const html = readFileSync(join(dir, 'sidepanel.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/?([^"]+\.js)"/g)].map((m) => m[1]);
const panelGzip = initial.reduce((sum, f) => sum + gzipSync(readFileSync(join(dir, f))).length, 0);
const worker = readdirSync(join(dir, 'assets')).find(
  (f) => f.startsWith('worker') && f.endsWith('.js'),
);

const checks = [
  ['Extractor bundle (minified)', size('extractor.js'), 70 * 1024],
  ['Picker bundle (minified)', size('picker.js'), 15 * 1024],
  ['Highlighter bundle (minified)', size('highlighter.js'), 15 * 1024],
  ['Panel initial JavaScript (gzipped)', panelGzip, 300 * 1024],
];
let failed = false;
for (const [label, value, budget] of checks) {
  const ok = value <= budget;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${kb(value)} (budget ${kb(budget)})`);
}
if (worker)
  console.log(
    `info Analysis worker (gzipped): ${kb(gzipSync(readFileSync(join(dir, 'assets', worker))).length)}`,
  );
process.exit(failed ? 1 : 0);
