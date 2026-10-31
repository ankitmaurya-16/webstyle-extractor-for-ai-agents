import { describe, expect, it } from 'vitest';
import { ICON_LIBRARIES, detectIcons } from '../../../src/detect/icons.js';
import { iconSignals } from '../../../src/detect/signals.js';
import { exportDesignMd } from '../../../src/export/design-md.js';
import { analyzeFixture, loadRaw } from '../helpers.js';

const detect = (name) => detectIcons(loadRaw(`icons-${name}`).iconSignals);
const hit = (id, count) => ({ id, evidence: id, count });
const signals = (overrides = {}) =>
  iconSignals({
    classCounts: new Map(),
    fontFamilies: [],
    svg: { lucide: 0, heroicons: 0, fontawesome: 0 },
    ...overrides,
  });

describe('icon library detection', () => {
  it.each([
    ['lucide', 'high'],
    ['heroicons', 'low'],
    ['fontawesome', 'high'],
    ['material', 'high'],
    ['bootstrap-icons', 'medium'],
    ['phosphor', 'medium'],
    ['tabler', 'medium'],
    ['remix', 'medium'],
  ])('AC-F21.1 detects %s on its fixture', (id, level) => {
    const found = detect(id);
    expect(found.map((d) => d.id)).toEqual([id]);
    expect(found[0].confidence.level).toBe(level);
    expect(found[0].name).toBe(ICON_LIBRARIES.find(([x]) => x === id)[1]);
    expect(found[0].evidence.length).toBeGreaterThan(0);
  });

  it('AC-F21.1 covers every library in the F21 table', () => {
    expect(ICON_LIBRARIES.map(([id]) => id)).toEqual([
      'lucide',
      'heroicons',
      'fontawesome',
      'material',
      'bootstrap-icons',
      'phosphor',
      'tabler',
      'remix',
    ]);
  });

  it('AC-F21.2 a page with no icons detects nothing', () => {
    expect(detect('none')).toEqual([]);
    const d = analyzeFixture('icons-none');
    expect(d.meta.icons).toEqual([]);
    expect(d.meta.iconSizePx).toBeNull();
    expect(d.meta.iconStroke).toBeNull();
  });

  it('AC-F21.2 the v1 fixtures without icons detect nothing', () => {
    for (const name of ['classic', 'components', 'states']) {
      expect(detectIcons(loadRaw(name).iconSignals ?? []), name).toEqual([]);
    }
  });

  it('AC-F21.3 confidence follows the F11 rule; Heroicons from attributes alone stays low', () => {
    const level = (hits) => detectIcons(hits)[0]?.confidence.level;
    expect(level([hit('lucide:svg', 1), hit('lucide:classes', 1)])).toBe('high');
    expect(level([hit('remix:classes', 3)])).toBe('medium');
    expect(level([hit('remix:classes', 2)])).toBe('low');
    expect(level([hit('heroicons:svg', 50)])).toBe('low');
  });

  it('AC-F21.3 sorts the most confident library first', () => {
    const found = detectIcons([
      hit('heroicons:svg', 4),
      hit('lucide:svg', 2),
      hit('lucide:classes', 2),
    ]);
    expect(found.map((d) => d.id)).toEqual(['lucide', 'heroicons']);
  });

  it('AC-F21.4 reports the most common inline SVG icon size and stroke width', () => {
    // lucide.html draws three 24 px icons and one 16 px icon, all with stroke-width 2.
    const raw = loadRaw('icons-lucide');
    expect(raw.iconSizes.map((s) => [s.value, s.count])).toEqual([
      ['24px', 3],
      ['16px', 1],
    ]);
    const d = analyzeFixture('icons-lucide');
    expect(d.meta.iconSizePx).toBe(24);
    expect(d.meta.iconStroke).toBe(2);
    expect(analyzeFixture('icons-heroicons').meta.iconStroke).toBe(1.5);
  });

  it('AC-F21.6 DESIGN.md names a confident library with size and stroke, and a rule to use it', () => {
    const md = exportDesignMd(analyzeFixture('icons-lucide'), '2.0.0');
    expect(md).toMatch(/- Icons: Lucide, 24px, stroke 2 \(high confidence\)/);
    const rules = md.slice(md.indexOf('## Rules for the agent'), md.indexOf('## Stack'));
    expect(rules).toMatch(/the Lucide icons at 24px/);
  });

  it('AC-F21.6 a low-confidence library stays out of DESIGN.md', () => {
    const md = exportDesignMd(analyzeFixture('icons-heroicons'), '2.0.0');
    expect(md).not.toContain('Heroicons');
  });
});

describe('icon signals', () => {
  it('AC-F21.1 reads class names, SVG markers and icon-font family names', () => {
    const hits = signals({
      classCounts: new Map([
        ['fa-solid', 2],
        ['fa-house', 1],
        ['material-symbols-outlined', 3],
        ['bi-x', 1],
        ['ph', 2],
        ['ph-star', 2],
        ['tabler-icon-home', 1],
        ['ri-home-line', 1],
        ['lucide-x', 1],
        ['phone', 4],
      ]),
      fontFamilies: [
        '"Font Awesome 6 Free"',
        '"Material Icons"',
        'bootstrap-icons',
        'Inter, sans-serif',
      ],
      svg: { lucide: 1, heroicons: 2, fontawesome: 1 },
    });
    const byId = Object.fromEntries(hits.map((h) => [h.id, h.count]));
    expect(byId).toEqual({
      'lucide:svg': 1,
      'lucide:classes': 1,
      'heroicons:svg': 2,
      'fontawesome:svg': 1,
      'fontawesome:classes': 3,
      'fontawesome:font': 1,
      'material:font': 1,
      'material:classes': 3,
      'bootstrap-icons:classes': 1,
      'bootstrap-icons:font': 1,
      // "phone" is not a Phosphor class.
      'phosphor:classes': 4,
      'tabler:classes': 1,
      'remix:classes': 1,
    });
  });

  it('AC-F21.2 no signals for a page without icon markers', () => {
    expect(signals({ classCounts: new Map([['card', 3]]), fontFamilies: ['Inter'] })).toEqual([]);
  });
});
