// Ticks acceptance criteria in docs/v2-spec.md that a test names (AC-Fx.y in a test title).
// Pass `--failing <file>` with one ID per line to leave those unticked.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const failing = new Set();
const i = process.argv.indexOf('--failing');
if (i > 0) for (const id of readFileSync(process.argv[i + 1], 'utf8').split(/\s+/).filter(Boolean)) failing.add(id);

const tested = new Set();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'fixtures' && name !== '__snapshots__') walk(path);
    } else if (/\.(js|jsx)$/.test(name)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        // Skipped tests do not count.
        if (/\b(it|test)\.skip\(/.test(line)) continue;
        if (!/\b(it|test|describe)(\.each\([^)]*\))?\(|^\s*`|^\s*'/.test(line) && !/AC-F\d/.test(line)) continue;
        for (const m of line.matchAll(/AC-F(\d+)\.(\d+)/g)) tested.add(`AC-F${m[1]}.${m[2]}`);
      }
    }
  }
};
walk(join(root, 'tests'));

const specPath = join(root, 'docs/v2-spec.md');
let ticked = 0;
let open = 0;
const spec = readFileSync(specPath, 'utf8').replace(/^- \[( |x)\] (AC-F(\d+)\.(\d+))/gm, (all, _box, id, f) => {
  if (Number(f) < 9) return all;
  const done = tested.has(id) && !failing.has(id);
  if (done) ticked += 1;
  else open += 1;
  return `- [${done ? 'x' : ' '}] ${id}`;
});
writeFileSync(specPath, spec);
console.log(`ticked ${ticked}, open ${open}`);
