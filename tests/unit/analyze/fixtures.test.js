import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { FIXTURE_NAMES, loadRaw } from '../helpers.js';

const role = (d, r) => d.colors.find((c) => c.roles.includes(r));

describe('analysis on the fixture pages', () => {
  it('reports the four stages in order', () => {
    const stages = [];
    analyze(loadRaw('classic'), (s) => stages.push(s));
    expect(stages).toEqual(['normalize', 'cluster', 'roles', 'naming']);
  });

  it('AC-F1.4 analyzes every fixture well inside the 3 s budget', () => {
    for (const name of FIXTURE_NAMES) {
      const start = performance.now();
      analyze(loadRaw(name));
      expect(performance.now() - start, name).toBeLessThan(1000);
    }
  });

  it('finds the brand color, body font and base unit on the classic site', () => {
    const d = analyze(loadRaw('classic'));
    expect(role(d, 'primary').hex).toBe('#2563eb');
    expect(role(d, 'background').hex).toBe('#ffffff');
    expect(role(d, 'text').hex).toBe('#111827');
    expect(d.typography.sizes.find((s) => s.name === 'base').sizePx).toBe(16);
    expect(d.spacing.baseUnitPx).toBe(4);
    expect(d.breakpoints.map((b) => b.px)).toEqual([640, 768, 1024]);
  });

  it('records the dark scheme and still assigns roles by usage', () => {
    const d = analyze(loadRaw('dark'));
    expect(d.meta.colorScheme).toBe('dark');
    expect(role(d, 'background').hex).toBe('#0b0f19');
    expect(role(d, 'primary').hex).toBe('#8b5cf6');
  });

  it('merges near-identical utility values', () => {
    const d = analyze(loadRaw('utility'));
    expect(role(d, 'primary').hex).toBe('#059669');
    expect(role(d, 'primary').mergedFrom).toContain('#059668');
  });

  it('marks breakpoints partial for a cross-origin stylesheet', () => {
    const d = analyze(loadRaw('cross-origin'));
    expect(d.meta.partial).toContain('breakpoints');
    expect(d.meta.stylesheets).toEqual({ readable: 1, unreadable: 1 });
  });

  it('keeps truncated from the element cap', () => {
    expect(analyze(loadRaw('large')).meta.truncated).toBe(true);
  });
});
