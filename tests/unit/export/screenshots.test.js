import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { exportDesignMd, exportFile, exportFiles, exportZip } from '../../../src/export/index.js';
import { SCREENSHOTS_DIR, screenshotPath } from '../../../src/export/files.js';
import { defaultFileMap, mapFiles } from '../../../src/project/index.js';
import { VERSION, richDesign } from './designs.js';

const design = richDesign();
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_DARK = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 11]);
const shots = [
  { recipeId: 'component:button:primary', mode: 'light', bytes: PNG },
  { recipeId: 'component:button:primary', mode: 'dark', bytes: PNG_DARK },
  { recipeId: 'component:card:default', mode: 'light', bytes: PNG },
  { recipeId: 'component:gone:default', mode: 'light', bytes: PNG },
];

describe('component screenshots in exports (F36)', () => {
  it('AC-F36.5 zip and project writes place screenshots at the documented paths', () => {
    expect(SCREENSHOTS_DIR).toBe('design/screenshots/');
    const button = design.components.find((r) => r.id === 'component:button:primary');
    expect(screenshotPath(button, 'light')).toBe('design/screenshots/button-primary.png');
    expect(screenshotPath(button, 'dark')).toBe('design/screenshots/button-primary-dark.png');
    const zip = unzipSync(
      exportZip(design, VERSION, { ctx: { screenshots: shots }, includeScreenshots: true }),
    );
    const pngs = Object.keys(zip)
      .filter((p) => p.endsWith('.png'))
      .sort();
    expect(pngs).toEqual([
      'design/screenshots/button-primary-dark.png',
      'design/screenshots/button-primary.png',
      'design/screenshots/card-default.png',
    ]);
    expect([...zip['design/screenshots/button-primary-dark.png']]).toEqual([...PNG_DARK]);
    const project = mapFiles(
      exportFiles(design, VERSION, { ctx: { screenshots: shots }, includeScreenshots: true }),
      defaultFileMap(),
    );
    expect(
      project
        .filter((f) => f.bytes)
        .map((f) => f.path)
        .sort(),
    ).toEqual(pngs);
  });

  it('AC-F36.5 no screenshots are exported unless included', () => {
    const zip = unzipSync(
      exportZip(design, VERSION, { ctx: { screenshots: shots }, includeScreenshots: false }),
    );
    expect(Object.keys(zip).some((p) => p.endsWith('.png'))).toBe(false);
  });

  it('AC-F36.6 DESIGN.md links screenshots under each recipe only when they are exported', () => {
    const md = (includeScreenshots) =>
      strFromU8(
        unzipSync(exportZip(design, VERSION, { ctx: { screenshots: shots }, includeScreenshots }))[
          'DESIGN.md'
        ],
      );
    const withShots = md(true);
    const button = withShots.split('### Button, primary')[1].split('\n### ')[0];
    expect(button).toContain('![Button, primary](design/screenshots/button-primary.png)');
    expect(button).toContain(
      '![Button, primary (dark)](design/screenshots/button-primary-dark.png)',
    );
    expect(withShots).toContain('![Card](design/screenshots/card-default.png)');
    expect(withShots).not.toContain('gone-default');
    expect(md(false)).not.toContain('design/screenshots/');
    // Copy and single-file download never carry the PNGs, so they never link them.
    expect(exportFile('design-md', design, VERSION, { screenshots: shots })).not.toContain(
      'design/screenshots/',
    );
    expect(exportDesignMd(design, VERSION)).not.toContain('![');
  });
});
