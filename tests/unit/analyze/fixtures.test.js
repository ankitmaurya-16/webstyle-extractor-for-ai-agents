import { describe, expect, it } from 'vitest';
import { ANALYZE_STAGES, analyze } from '../../../src/analyze/index.js';
import { FIXTURE_NAMES, analyzeFixture, capturesFor, loadRaw } from '../helpers.js';

const holder = (d, role) => d.colors.find((c) => c.id === d.semantic[role]?.[d.meta.primaryMode]);

// The v2.0 base accuracy criterion (13.4): primary color, body font and base spacing unit.
const EXPECTED = {
  classic: { primary: '#2563eb', font: 'Helvetica Neue', base: 4, mode: 'light' },
  dark: { primary: '#8b5cf6', font: 'Inter', base: 4, mode: 'dark' },
  utility: { primary: '#059669', font: 'ui-sans-serif', base: 4, mode: 'light' },
  'cross-origin': { primary: '#ea580c', font: 'Georgia', base: 8, mode: 'light' },
  large: { primary: '#1d4ed8', font: 'system-ui', base: 4, mode: 'light' },
};

describe('analysis on the fixture pages', () => {
  it('reports the analysis stages in order', () => {
    const stages = [];
    analyze(capturesFor(loadRaw('classic')), {}, (s) => stages.push(s));
    expect(stages).toEqual(ANALYZE_STAGES);
    expect(stages[0]).toBe('normalize');
    expect(stages.at(-1)).toBe('naming');
  });

  it('AC-F1.4 analyzes every fixture well inside the 3 s budget', () => {
    for (const name of FIXTURE_NAMES) {
      const start = performance.now();
      analyzeFixture(name);
      expect(performance.now() - start, name).toBeLessThan(1000);
    }
  });

  for (const [name, want] of Object.entries(EXPECTED)) {
    it(`finds the primary color, body font and base unit on the ${name} fixture`, () => {
      const d = analyzeFixture(name);
      expect(d.meta.primaryMode).toBe(want.mode);
      expect(holder(d, 'primary').hex).toBe(want.primary);
      expect(d.typography.families[0].stack[0]).toBe(want.font);
      expect(d.spacing.baseUnitPx).toBe(want.base);
    });
  }

  it('finds the page background and text on the classic and dark fixtures', () => {
    const classic = analyzeFixture('classic');
    expect(holder(classic, 'background').hex).toBe('#ffffff');
    expect(holder(classic, 'text').hex).toBe('#111827');
    expect(classic.typography.sizes.find((s) => s.name === 'base').sizePx).toBe(16);
    expect(classic.breakpoints.map((b) => b.px)).toEqual([640, 768, 1024]);
    const dark = analyzeFixture('dark');
    expect(dark.meta.modes).toEqual(['dark']);
    expect(holder(dark, 'background').hex).toBe('#0b0f19');
    expect(holder(dark, 'text').hex).toBe('#e5e7eb');
  });

  it('AC-F2.2 merges near-identical utility values', () => {
    const primary = holder(analyzeFixture('utility'), 'primary');
    expect(primary.mergedFrom).toContain('#059668');
  });

  it('marks breakpoints and variables partial for a cross-origin stylesheet', () => {
    const d = analyzeFixture('cross-origin');
    expect(d.meta.partial).toEqual(expect.arrayContaining(['breakpoints', 'cssVariables']));
    expect(d.meta.stylesheets).toEqual({ readable: 1, unreadable: 1 });
  });

  it('keeps truncated from the element cap', () => {
    const d = analyzeFixture('large');
    expect(d.meta.truncated).toBe(true);
    expect(d.colors[0].confidence.reasons).toContain('The capture stopped at the element limit');
  });

  it('does not count a color holding another role as a role runner-up', () => {
    const d = analyzeFixture('classic');
    const reasons = Object.values(d.roleConfidence)
      .flatMap((byMode) => Object.values(byMode))
      .flatMap((c) => c.reasons);
    // The text color is no rival for text-muted, nor the background for primary.
    expect(reasons).not.toContain('Close runner-up: ink');
    expect(reasons).not.toContain('Close runner-up: white');
    expect(d.roleConfidence['text-muted'].light.level).not.toBe('low');
  });

  it('is deterministic across runs', () => {
    for (const name of FIXTURE_NAMES)
      expect(analyzeFixture(name), name).toEqual(analyzeFixture(name));
  });
});
