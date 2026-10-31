// Exports of a component snapshot (F26). The collector walks only the picked subtree, so element
// values are already scoped; page-wide data (media-query breakpoints, document.fonts faces and
// the responsive table) must not reach the component's exports.

import { describe, expect, it } from 'vitest';
import { renderFormat } from '../../../src/export/index.js';
import { analyze } from '../../../src/analyze/index.js';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import { captureOf, loadRaw } from '../helpers.js';
import { VERSION } from './designs.js';

/** A picked card: its subtree's values plus the page-level data every capture carries. */
function componentRaw() {
  const raw = loadRaw('classic');
  raw.fontFaces = [
    {
      family: 'Helvetica Neue',
      weights: [400, 600],
      styles: ['normal'],
      provider: 'self-hosted',
      providerHost: null,
      loaded: true,
    },
    {
      family: 'Unused Display',
      weights: [800],
      styles: ['normal'],
      provider: 'google-fonts',
      providerHost: 'fonts.gstatic.com',
      loaded: true,
    },
  ];
  return raw;
}

const raw = componentRaw();
const design = analyze([
  captureOf(raw),
  captureOf(raw, { id: 'w-375', kind: 'width', viewportWidth: 375 }),
]);
const all = (d, ctx) =>
  EXPORT_FORMATS.flatMap((format) => renderFormat(format, d, VERSION, ctx))
    .map((f) => f.text)
    .join('\n');

describe('component snapshot exports (F26)', () => {
  it('AC-F26.8 page-wide breakpoints, unused web fonts and the responsive table are left out', () => {
    expect(design.breakpoints.length).toBeGreaterThan(0);
    expect(design.responsive).not.toBeNull();
    const page = all(design);
    expect(page).toContain('Unused Display');
    expect(page).toContain('--breakpoint-sm');

    const text = all(design, { kind: 'component' });
    expect(text).not.toContain('Unused Display');
    expect(text).not.toMatch(/--breakpoint-|screens:|## Breakpoints|"breakpoint"/);
    expect(text).not.toContain('## Responsive');
    // The family the component's text uses keeps its web font.
    expect(text).toContain('Load Helvetica Neue (400, 600) rather than substituting.');
  });

  it('AC-F26.8 every token in the exports is one used inside the component', () => {
    const [tokens] = renderFormat('dtcg', design, VERSION, { kind: 'component' });
    const doc = JSON.parse(tokens.text);
    const names = (list) => list.filter((t) => !t.excluded).map((t) => t.name);
    expect(Object.keys(doc.color)).toEqual(names(design.colors).map((n) => n.replace(/\//g, '-a')));
    expect(Object.keys(doc.font)).toEqual(names(design.typography.families));
    expect(Object.keys(doc.text)).toEqual(
      [...design.typography.sizes].sort((a, b) => a.sizePx - b.sizePx).map((s) => s.name),
    );
    expect(doc.breakpoint).toBeUndefined();
    // Every color comes from a value the walk recorded.
    const walked = new Set(raw.colors.map((c) => c.effectiveHex ?? c.value));
    for (const c of design.colors.filter((x) => x.alpha >= 1))
      expect(walked.has(c.hex) || c.mergedFrom?.some((h) => walked.has(h)), c.hex).toBeTruthy();
  });

  it('AC-F26.8 a design marked as a component is scoped without a context flag', () => {
    const marked = { ...design, meta: { ...design.meta, kind: 'component' } };
    expect(all(marked)).toBe(all(design, { kind: 'component' }));
  });
});
