import { readFile } from 'node:fs/promises';
import { FIXTURES, expect, test } from './harness.js';

// captureVisibleTab needs the activeTab grant from a real toolbar click, which automation cannot
// give, so the crop runs here in a real Chromium page on a synthetic 2x screenshot.
test('AC-F36.3 only representatives fully inside the viewport are cropped, at the device pixel ratio', async ({
  ext,
}) => {
  const page = await ext.context.newPage();
  const source = await readFile(
    new URL('../../src/platform/screenshots.js', import.meta.url),
    'utf8',
  );
  await page.route(`${FIXTURES}/__src/screenshots.js`, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: source }),
  );
  await page.goto(`${FIXTURES}/classic.html`);
  const items = await page.evaluate(async (url) => {
    const { cropScreenshots } = await import(url);
    // A 200 x 120 px screenshot of a 100 x 60 CSS px viewport at dpr 2: red with a blue block at
    // CSS (10, 10) sized 20 x 15.
    const canvas = new OffscreenCanvas(200, 120);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 200, 120);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(20, 20, 40, 30);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const shot = {
      mode: 'light',
      dataUrl: `data:image/png;base64,${btoa(binary)}`,
      dpr: 2,
      representatives: [
        { variant: 'button:a', inViewport: true, rect: { x: 10, y: 10, width: 20, height: 15 } },
        { variant: 'card:b', inViewport: false, rect: { x: 0, y: 50, width: 100, height: 40 } },
      ],
    };
    const recipes = [
      { id: 'component:button:primary', sampleKey: 'button:a' },
      { id: 'component:card:default', sampleKey: 'card:b' },
    ];
    const out = await cropScreenshots([shot], recipes, 'snap');
    return Promise.all(
      out.map(async (item) => {
        const bitmap = await createImageBitmap(item.blob);
        const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
        c.drawImage(bitmap, 0, 0);
        const [r, g, b] = c.getImageData(bitmap.width / 2, bitmap.height / 2, 1, 1).data;
        return { id: item.id, width: item.width, height: item.height, center: [r, g, b] };
      }),
    );
  }, `${FIXTURES}/__src/screenshots.js`);
  expect(items).toEqual([
    { id: 'component:button:primary:light', width: 40, height: 30, center: [0, 0, 255] },
  ]);
});
