// Fails when the built extension breaks the size budgets in docs/non-functional.md.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = new URL('../.output/chrome-mv3/', import.meta.url).pathname;
if (!existsSync(dir)) {
  console.error('Run pnpm build first.');
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const extractor = readFileSync(join(dir, 'extractor.js')).length;

// Panel JavaScript: the side panel chunks plus the analysis worker it starts.
const panelFiles = [
  ...readdirSync(join(dir, 'chunks')).map((f) => join(dir, 'chunks', f)),
  ...readdirSync(join(dir, 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, 'assets', f)),
].filter((f) => f.endsWith('.js'));
const panelGzip = panelFiles.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);

const checks = [
  ['Extractor bundle (minified)', extractor, 50 * 1024],
  ['Panel JavaScript (gzipped)', panelGzip, 250 * 1024],
];
let failed = false;
for (const [label, size, budget] of checks) {
  const ok = size <= budget;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${kb(size)} (budget ${kb(budget)})`);
}
process.exit(failed ? 1 : 0);
