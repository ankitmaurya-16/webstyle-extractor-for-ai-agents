import { describe, expect, it } from 'vitest';
import { FRAMEWORKS, detectFrameworks } from '../../../src/detect/framework.js';
import { frameworkSignals } from '../../../src/detect/signals.js';
import { exportDesignMd } from '../../../src/export/design-md.js';
import { analyzeFixture, loadRaw } from '../helpers.js';

const IDS = FRAMEWORKS.map(([id]) => id);
const detect = (name) => detectFrameworks(loadRaw(`frameworks-${name}`).frameworkSignals);
const hit = (id, count, evidence = id) => ({ id, evidence, count });
const signals = (overrides = {}) =>
  frameworkSignals({
    classCounts: new Map(),
    varNames: [],
    dataSlots: 0,
    layerNames: [],
    themeOklch: false,
    ...overrides,
  });

describe('framework detection on the fixtures', () => {
  it('AC-F11.1 samples class names as tokens with counts, never text', () => {
    const raw = loadRaw('frameworks-tailwind');
    const classes = raw.frameworkSignals.find((h) => h.id === 'meta:classes');
    // 13 distinct utility classes are written in the fixture.
    expect(classes.count).toBe(13);
    const text = JSON.stringify(raw);
    expect(text).not.toContain('Paragraph styled with utility classes');
    expect(text).not.toContain('Chip one');
  });

  it.each([
    ['tailwind', 'tailwind', 'v4', 'high'],
    ['bootstrap', 'bootstrap', 'v5', 'high'],
    ['mui', 'mui', null, 'high'],
    ['chakra', 'chakra', null, 'high'],
    ['shadcn', 'shadcn', 'Tailwind v4 style', 'high'],
    ['radix-themes', 'radix-themes', null, 'high'],
    ['antd', 'antd', null, 'high'],
    ['bulma', 'bulma', null, 'high'],
  ])('AC-F11.2 detects %s on its fixture', (fixture, id, version, level) => {
    const found = detect(fixture);
    expect(found.map((d) => d.id)).toEqual([id]);
    expect(found[0]).toMatchObject({ version, confidence: { level } });
    expect(found[0].name).toBe(FRAMEWORKS.find(([x]) => x === id)[1]);
  });

  it('AC-F11.2 covers every framework in the F11 table', () => {
    expect(IDS).toEqual([
      'tailwind',
      'bootstrap',
      'mui',
      'chakra',
      'shadcn',
      'radix-themes',
      'antd',
      'bulma',
    ]);
  });

  it('AC-F11.3 the plain-CSS fixture detects no framework', () => {
    expect(detect('plain')).toEqual([]);
    expect(analyzeFixture('frameworks-plain').meta.framework).toEqual([]);
  });

  it('AC-F11.3 the v1 fixtures written in plain CSS detect no framework with confidence', () => {
    for (const name of ['classic', 'dark', 'components', 'states']) {
      const found = detectFrameworks(loadRaw(name).frameworkSignals ?? []);
      expect(
        found.filter((d) => d.confidence.level !== 'low'),
        name,
      ).toEqual([]);
    }
    // classic.html happens to use btn and btn-primary class names: a low hint, Insights only.
    expect(detectFrameworks(loadRaw('classic').frameworkSignals)).toEqual([
      expect.objectContaining({
        id: 'bootstrap',
        confidence: expect.objectContaining({ level: 'low' }),
      }),
    ]);
  });
});

describe('framework scoring', () => {
  it('AC-F11.4 reports a version only when the hints allow it', () => {
    const tw3 = detectFrameworks([
      hit('meta:classes', 10),
      hit('tailwind:classes', 8),
      hit('tailwind:variables', 3),
    ]);
    expect(tw3[0].version).toBe('v3');
    const tw4 = detectFrameworks([
      hit('meta:classes', 10),
      hit('tailwind:classes', 8),
      hit('tailwind:v4', 1),
    ]);
    expect(tw4[0].version).toBe('v4');
    const bs4 = detectFrameworks([hit('bootstrap:classes', 6)]);
    expect(bs4[0]).toMatchObject({ id: 'bootstrap', version: null });
    const shadcnHsl = detectFrameworks([hit('shadcn:variables', 5), hit('shadcn:attributes', 4)]);
    expect(shadcnHsl[0].version).toBeNull();
    for (const id of ['mui', 'chakra', 'antd', 'bulma']) {
      expect(detectFrameworks([hit(`${id}:variables`, 3)])[0].version).toBeNull();
    }
  });

  it('AC-F11.5 high with two signal types, medium with one strong type, low otherwise', () => {
    const level = (hits) => detectFrameworks(hits)[0]?.confidence.level;
    expect(level([hit('mui:classes', 6), hit('mui:variables', 2)])).toBe('high');
    expect(level([hit('mui:classes', 6)])).toBe('medium');
    expect(level([hit('mui:variables', 2)])).toBe('medium');
    expect(level([hit('mui:classes', 3)])).toBe('low');
    expect(level([hit('shadcn:attributes', 4)])).toBe('low');
    // Too few hits do not count at all.
    expect(detectFrameworks([hit('mui:classes', 1), hit('mui:variables', 1)])).toEqual([]);
  });

  it('AC-F11.5 Tailwind classes count only when at least 30% of class tokens are utilities', () => {
    const at = (n) => detectFrameworks([hit('meta:classes', 100), hit('tailwind:classes', n)]);
    expect(at(29)).toEqual([]);
    expect(at(30)[0]).toMatchObject({ id: 'tailwind', confidence: { level: 'medium' } });
  });

  it('AC-F11.5 several frameworks can be detected at once', () => {
    const found = detectFrameworks([
      hit('meta:classes', 20),
      hit('tailwind:classes', 15),
      hit('shadcn:variables', 5),
      hit('shadcn:attributes', 3),
    ]);
    expect(found.map((d) => d.id)).toEqual(['tailwind', 'shadcn']);
  });

  it('AC-F11.5 sums hits from merged pages and frames before scoring', () => {
    const found = detectFrameworks([hit('mui:classes', 1), hit('mui:classes', 1)]);
    expect(found[0]).toMatchObject({ id: 'mui', confidence: { level: 'low' } });
  });

  it('AC-F11.5 low-confidence detections stay out of DESIGN.md', () => {
    const d = analyzeFixture('classic');
    const low = {
      id: 'mui',
      name: 'MUI',
      version: null,
      confidence: { level: 'low', score: 0.3, reasons: [] },
      evidence: ['x'],
    };
    const md = exportDesignMd({ ...d, meta: { ...d.meta, framework: [low] } }, '2.0.0');
    expect(md).not.toContain('MUI');
  });

  it('AC-F11.6 DESIGN.md names a medium or high framework in Stack and tells the agent to use it', () => {
    const d = analyzeFixture('frameworks-bootstrap');
    const md = exportDesignMd(d, '2.0.0');
    const stack = md.slice(md.indexOf('## Stack'));
    expect(stack).toMatch(/- Framework: Bootstrap/);
    const rules = md.slice(md.indexOf('## Rules for the agent'), md.indexOf('## Stack'));
    expect(rules).toMatch(/Use Bootstrap/);
  });

  it('AC-F11.7 every detection carries its evidence', () => {
    for (const name of [
      'tailwind',
      'bootstrap',
      'mui',
      'chakra',
      'shadcn',
      'radix-themes',
      'antd',
      'bulma',
    ]) {
      for (const d of detect(name)) {
        expect(d.evidence.length).toBeGreaterThan(0);
        expect(d.evidence.every((e) => typeof e === 'string' && /\(\d+\)$/.test(e))).toBe(true);
        expect(d.confidence.reasons).toEqual(d.evidence);
      }
    }
  });
});

describe('framework signals', () => {
  it('AC-F11.1 counts utility patterns: responsive prefixes, spacing, text sizes, colors and arbitrary values', () => {
    const classes = ['md:p-8', 'px-4', 'text-sm', 'bg-blue-500', 'w-[37px]', 'hero', 'site-title'];
    const hits = signals({ classCounts: new Map(classes.map((c) => [c, 1])) });
    expect(hits.find((h) => h.id === 'tailwind:classes').count).toBe(5);
    expect(hits.find((h) => h.id === 'meta:classes').count).toBe(7);
  });

  it('AC-F11.2 reads variables, data-slot attributes and layers as separate signal types', () => {
    const hits = signals({
      varNames: [
        '--background',
        '--foreground',
        '--primary-foreground',
        '--ring',
        '--radius',
        '--bs-blue',
      ],
      dataSlots: 3,
      layerNames: ['theme', 'base'],
      themeOklch: true,
    });
    const ids = hits.map((h) => h.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'shadcn:variables',
        'shadcn:attributes',
        'shadcn:oklch',
        'tailwind:v4',
        'meta:layers',
        'bootstrap:variables',
      ]),
    );
    expect(hits.every((h) => h.count > 0)).toBe(true);
  });

  it('AC-F11.2 needs all five shadcn variables and all twelve Radix accents', () => {
    const shadcn = signals({ varNames: ['--background', '--foreground', '--ring', '--radius'] });
    expect(shadcn.find((h) => h.id === 'shadcn:variables')).toBeUndefined();
    const accents = Array.from({ length: 11 }, (_, i) => `--accent-${i + 1}`);
    expect(
      signals({ varNames: accents }).find((h) => h.id === 'radix-themes:variables'),
    ).toBeUndefined();
    const all = [...accents, '--accent-12'];
    expect(signals({ varNames: all }).find((h) => h.id === 'radix-themes:variables').count).toBe(
      12,
    );
  });
});
