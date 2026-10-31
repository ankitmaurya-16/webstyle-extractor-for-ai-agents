import { describe, expect, it } from 'vitest';
import { analyzeMotion, normalizeEasing } from '../../../src/analyze/motion.js';
import { analyzeFixture, loadRaw, rawSnapshot, stat } from '../helpers.js';

const motionOf = (overrides) => analyzeMotion(rawSnapshot(overrides));

describe('motion (F14)', () => {
  it('AC-F14.1 collects transition and animation durations aligned with transition-property', () => {
    const raw = loadRaw('motion');
    const durations = Object.fromEntries(raw.durations.map((d) => [d.value, d.count]));
    // .btn: color and background-color at 150 ms on 4 buttons; .card: transform 300 ms and
    // opacity 0.2 s on 3 cards; .link: color 200 ms twice.
    expect(durations['150']).toBe(8);
    expect(durations['300']).toBe(3);
    expect(durations['200']).toBe(5);
    // Animations: spin 1 s and blink 2 s; animation-name none (.paused, 3 s) is ignored.
    expect(durations['1000']).toBe(1);
    expect(durations['2000']).toBe(1);
    expect(durations['3000']).toBeUndefined();
    // The zero transition on .instant is skipped.
    expect(durations['0']).toBeUndefined();
    const props = Object.fromEntries(raw.transitionProperties.map((p) => [p.value, p.count]));
    expect(props).toEqual({ color: 6, opacity: 5, 'background-color': 4, transform: 4 });
    const easings = Object.fromEntries(raw.easings.map((e) => [e.value, e.count]));
    expect(easings['cubic-bezier(0.4, 0, 0.2, 1)']).toBe(8);
    // One timing function on .card repeats for both of its properties.
    expect(easings['cubic-bezier(0, 0, 0.2, 1)']).toBe(6);
    expect(easings['steps(4)']).toBe(1);
  });

  it('AC-F14.1 skips zero and invalid durations in analysis', () => {
    const { durations } = motionOf({
      durations: [stat('0', 5), stat('-10', 1), stat('abc', 1), stat('150', 2)],
    });
    expect(durations.map((d) => d.ms)).toEqual([150]);
  });

  it('AC-F14.2 names durations duration-<ms> and keeps at most 6 by usage', () => {
    const { durations } = analyzeFixture('motion').motion;
    // 8 distinct durations; the 1 s and 2 s animations lose the tie on usage to shorter values.
    expect(durations.map((d) => d.name)).toEqual([
      'duration-75',
      'duration-150',
      'duration-200',
      'duration-300',
      'duration-500',
      'duration-700',
    ]);
    expect(durations.find((d) => d.ms === 150)).toMatchObject({ id: 'duration:150', count: 8 });
  });

  it('AC-F14.2 drops the least used durations first', () => {
    const { durations } = motionOf({
      durations: [100, 200, 300, 400, 500, 600, 700].map((ms, i) =>
        stat(String(ms), i + 1, ['transition'], i + 1),
      ),
    });
    expect(durations.map((d) => d.ms)).toEqual([200, 300, 400, 500, 600, 700]);
    expect(durations.reduce((s, d) => s + d.usageShare, 0)).toBeCloseTo(27 / 28, 3);
  });

  it('AC-F14.3 normalizes easings: keywords as-is, curves to 3 decimals, steps raw', () => {
    expect(normalizeEasing('ease-in-out')).toEqual({
      css: 'ease-in-out',
      bezier: [0.42, 0, 0.58, 1],
    });
    expect(normalizeEasing('cubic-bezier(0.68, -0.55, 0.2654, 1.55)')).toEqual({
      css: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      bezier: [0.68, -0.55, 0.265, 1.55],
    });
    expect(normalizeEasing('steps(4, jump-start)')).toEqual({
      css: 'steps(4, jump-start)',
      bezier: null,
    });
  });

  it('AC-F14.3 names keywords, Tailwind curves and custom curves on the fixture', () => {
    const { easings } = analyzeFixture('motion').motion;
    const byCss = Object.fromEntries(easings.map((e) => [e.css, e.name]));
    expect(byCss).toMatchObject({
      'cubic-bezier(0.4, 0, 0.2, 1)': 'ease-in-out',
      'cubic-bezier(0, 0, 0.2, 1)': 'ease-out',
      ease: 'ease',
      linear: 'linear',
      // .bouncy and .slow differ only past the third decimal, so they merge into one curve.
      'cubic-bezier(0.68, -0.55, 0.265, 1.55)': 'ease-custom-1',
    });
    expect(easings.find((e) => e.name === 'ease-custom-1').count).toBe(2);
  });

  it('AC-F14.3 gives Tailwind ease-in its name and numbers other curves by usage', () => {
    const { easings } = motionOf({
      easings: [
        stat('cubic-bezier(0.4, 0, 1, 1)', 5, ['transition'], 5),
        stat('cubic-bezier(0.1, 0.2, 0.3, 0.4)', 1, ['transition'], 1),
        stat('cubic-bezier(0.5, 0.6, 0.7, 0.8)', 3, ['transition'], 3),
      ],
    });
    expect(easings.map((e) => [e.name, e.css])).toEqual([
      ['ease-in', 'cubic-bezier(0.4, 0, 1, 1)'],
      ['ease-custom-1', 'cubic-bezier(0.5, 0.6, 0.7, 0.8)'],
      ['ease-custom-2', 'cubic-bezier(0.1, 0.2, 0.3, 0.4)'],
    ]);
  });

  it('AC-F14.3 never gives two easings the same name', () => {
    // The ease-in keyword and Tailwind's ease-in curve are different values.
    const { easings } = motionOf({
      easings: [
        stat('ease-in', 4, ['transition'], 4),
        stat('cubic-bezier(0.4, 0, 1, 1)', 2, ['transition'], 2),
      ],
    });
    expect(easings.map((e) => e.name)).toEqual(['ease-in', 'ease-custom-1']);
  });

  it('AC-F14.4 summarizes the commonly transitioned properties', () => {
    const { motion } = analyzeFixture('motion');
    expect(motion.properties).toEqual(['color', 'opacity', 'background-color', 'transform']);
  });

  it('AC-F14.5 detects prefers-reduced-motion rules', () => {
    expect(analyzeFixture('motion').motion.reducedMotion).toBe(true);
    expect(analyzeFixture('classic').motion.reducedMotion).toBe(false);
  });
});
