// Writes tests/fixtures/large.html: a synthetic page with about 6,000 visible elements packed
// into the first screens, so the 4,000-element cap is reached.
import { writeFileSync } from 'node:fs';

const colors = ['#1d4ed8', '#0f766e', '#b91c1c', '#7c3aed', '#374151'];
const cells = [];
for (let i = 0; i < 2000; i += 1) {
  const c = colors[i % colors.length];
  cells.push(`<div class="cell"><i style="background:${c}"></i><b>${i}</b></div>`);
}
const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Large fixture</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; font-size: 12px; line-height: 16px; color: #111827; background: #ffffff; }
  h1 { font-size: 24px; line-height: 32px; margin: 8px 16px; }
  p { margin: 0 16px 8px; font-size: 14px; line-height: 20px; }
  .grid { display: grid; grid-template-columns: repeat(40, 1fr); gap: 4px; padding: 0 16px; }
  .cell { display: flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid #e5e7eb; border-radius: 4px; }
  .cell i { display: block; width: 8px; height: 8px; border-radius: 9999px; }
  .cell b { font-weight: 500; }
  a { color: #1d4ed8; }
  button { background: #1d4ed8; color: #ffffff; border: 0; padding: 8px 16px; border-radius: 6px; font: inherit; }
</style></head>
<body>
<h1>Large synthetic page</h1>
<p>About six thousand elements for the long-task and element-cap tests. See the <a href="#help">help</a> page. <button>Action</button> <button>Refresh</button></p>
<div class="grid">
${cells.join('\n')}
</div>
</body>
</html>
`;
writeFileSync(new URL('../tests/fixtures/large.html', import.meta.url), html);
console.log('wrote tests/fixtures/large.html');
