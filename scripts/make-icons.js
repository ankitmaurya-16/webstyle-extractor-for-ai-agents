// Renders the extension icon (a white eyedropper on the accent rounded square) to the PNG sizes
// Chrome needs, using the preinstalled Chromium.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);
const out = new URL('../public/icon/', import.meta.url);
mkdirSync(out, { recursive: true });

// Lucide's pipette path (ISC license), drawn in white on #7aa2f7.
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="28" fill="#7aa2f7"/>
  <g transform="translate(24 24) scale(3.333)" fill="none" stroke="#ffffff" stroke-width="${size <= 16 ? 2.6 : 2}" stroke-linecap="round" stroke-linejoin="round">
    <path d="m2 22 1-1h3l9-9"/>
    <path d="M3 21v-3l9-9"/>
    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/>
  </g>
</svg>`;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg(size)}`);
  await page
    .locator('svg')
    .screenshot({ path: new URL(`${size}.png`, out).pathname, omitBackground: true });
  console.log(`public/icon/${size}.png`);
}
await browser.close();
