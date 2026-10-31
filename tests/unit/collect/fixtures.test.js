// What the real collector read from the fixture pages in Chromium (captured by
// scripts/capture-fixtures.js), checked against what each page defines.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect } from '../../../src/collect/index.js';
import { mergeFrames } from '../../../src/platform/extract-handler.js';
import { loadRaw } from '../helpers.js';

const states = loadRaw('states');
const variantOf = (raw, kind, index = 0) =>
  raw.samples.filter((s) => s.kind === kind).sort((a, b) => b.count - a.count)[index].key;
const statesOf = (raw, variant) =>
  Object.fromEntries(
    raw.stateSamples.filter((s) => s.variant === variant).map((s) => [s.state, s.styles]),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('interaction states from stylesheet rules (states.html)', () => {
  const primary = variantOf(states, 'button', 0);
  const plain = variantOf(states, 'button', 1);

  it('AC-F12.1 keeps up to 3 representatives per recipe and matches state rules by base selector', () => {
    const reps = states.representatives.filter((r) => r.variant === primary);
    // The page has four primary buttons.
    expect(states.samples.find((s) => s.key === primary).count).toBe(4);
    expect(reps).toHaveLength(3);
    for (const r of reps)
      expect(r.selector).toMatch(/^body > p:nth-of-type\(1\) > button:nth-of-type\([1-3]\)$/);
    expect(Object.keys(statesOf(states, primary)).sort()).toEqual([
      'active',
      'focus-visible',
      'hover',
    ]);
    expect(states.stateSamples.every((s) => s.source === 'stylesheet')).toBe(true);
  });

  it('AC-F12.2 resolves conflicts by specificity, then source order', () => {
    const s = statesOf(states, primary);
    // button.btn:hover (#1e40af) beats the later, less specific .btn:hover (#3b82f6).
    expect(s.hover['background-color']).toBe('#1e40af');
    // Two .btn:active rules: the later one (#1e3a8a) wins over #172554.
    expect(s.active['background-color']).toBe('rgb(30, 58, 138)');
  });

  it('AC-F12.2 ignores rules in @media blocks that do not match and applies those that do', () => {
    const s = statesOf(states, primary);
    // @media (max-width: 400px) sets a red hover color; the 1280 px capture ignores it.
    expect(s.hover).not.toHaveProperty('color');
    // @media (min-width: 100px) adds an inset shadow on :active.
    expect(s.active['box-shadow']).toBe('rgba(0, 0, 0, 0.25) 0px 2px 4px inset');
  });

  it('AC-F12.3 resolves var() in state rules through the element’s custom properties', () => {
    const link = variantOf(states, 'link');
    expect(statesOf(states, link).hover).toEqual({ color: '#1e3a8a' });
    expect(statesOf(states, primary)['focus-visible'].outline).toBe('2px solid #f59e0b');
    const input = variantOf(states, 'input');
    expect(statesOf(states, input).focus.border).toBe('1px solid #2563eb');
  });

  it('AC-F12.4 stores only properties that differ from the default state', () => {
    const s = statesOf(states, primary);
    // .btn:hover also sets color: #ffffff, the default color, so it is left out.
    expect(s.hover).toEqual({ 'background-color': '#1e40af' });
    // input:focus sets outline: none, which equals the default.
    const input = variantOf(states, 'input');
    expect(statesOf(states, input).focus).not.toHaveProperty('outline');
    expect(Object.keys(statesOf(states, plain))).toEqual(['hover']);
  });

  it('AC-F12.6 reads the :focus-visible outline and offset for the focus ring', () => {
    expect(statesOf(states, primary)['focus-visible']).toEqual({
      outline: '2px solid #f59e0b',
      'outline-offset': '2px',
    });
    const input = variantOf(states, 'input');
    expect(statesOf(states, input).focus['box-shadow']).toBe(
      'rgba(37, 99, 235, 0.3) 0px 0px 0px 3px',
    );
  });

  it('AC-F12.7 a page without focus rules records no focus states', () => {
    const raw = loadRaw('classic');
    expect(raw.stateSamples.filter((s) => s.state.startsWith('focus'))).toEqual([]);
  });
});

describe('component detection on components.html (F20)', () => {
  const raw = loadRaw('components');
  const count = (kind) =>
    raw.samples.filter((s) => s.kind === kind).reduce((n, s) => n + s.count, 0);

  it('AC-F20.1 detects cards, badges, the nav bar, tabs, alerts and the table', () => {
    expect(count('card')).toBe(5);
    expect(count('badge')).toBe(10);
    expect(count('navbar')).toBe(1);
    expect(count('tabs')).toBe(1);
    expect(count('alert')).toBe(6);
    expect(count('table')).toBe(1);
  });

  it('AC-F20.1 the new kinds add no buttons, inputs or links to the v1 counts', () => {
    expect(count('button')).toBe(4);
    expect(count('input')).toBe(5);
    expect(count('link')).toBe(2);
  });

  it('AC-F20.1 badges carry the class hint used for repetition-free detection', () => {
    expect(
      raw.samples.filter((s) => s.kind === 'badge').every((s) => s.hints.includes('class')),
    ).toBe(true);
  });

  it('AC-F20.2 pages without the new kinds produce no samples for them', () => {
    const states = loadRaw('states');
    for (const kind of ['card', 'badge', 'navbar', 'tabs', 'alert', 'table']) {
      expect(
        states.samples.filter((s) => s.kind === kind),
        kind,
      ).toEqual([]);
    }
  });

  it('AC-F20.7 samples hold styles, never the page text', () => {
    const text = JSON.stringify(raw);
    for (const words of [
      'Card title',
      'Card body copy',
      'Alert message',
      'Tab one',
      'Draft',
      'Late',
    ]) {
      expect(text).not.toContain(words);
    }
  });
});

describe('coverage (coverage.html, F22)', () => {
  const raw = loadRaw('coverage');
  const colors = raw.colors.map((c) => c.value);

  it('AC-F22.1 walks open shadow roots and reads their own and adopted stylesheets', () => {
    expect(raw.coverage.shadowRoots).toBe(1);
    // .chip background inside the open root, and its adopted-sheet border.
    expect(colors).toContain('rgb(219, 39, 119)');
    expect(raw.colors.find((c) => c.value === 'rgb(8, 145, 178)').contexts).toEqual(['border']);
    expect(raw.variableDefs.map((d) => d.name)).toEqual(
      expect.arrayContaining(['--widget-accent', '--widget-adopted']),
    );
    // The @media rule inside the shadow stylesheet.
    expect(raw.breakpoints).toContain(900);
  });

  it('AC-F22.1 never reaches into closed shadow roots', () => {
    expect(colors).not.toContain('rgb(101, 163, 13)');
    expect(raw.variableDefs.map((d) => d.name)).not.toContain('--closed-secret');
  });

  it('AC-F22.3 counts only frames of at least 100 x 100 px', () => {
    // Two 400 x 200 frames; the 80 x 60 frame is ignored.
    expect(raw.frameCount).toBe(2);
  });

  it('AC-F22.3 a frame smaller than 100 x 100 px returns nothing', async () => {
    const frame = { innerWidth: 80, innerHeight: 60 };
    frame.top = {};
    vi.stubGlobal('window', frame);
    vi.stubGlobal('document', {});
    await expect(collect()).resolves.toBeNull();
    vi.stubGlobal('window', { ...frame, innerWidth: 400, innerHeight: 99 });
    await expect(collect()).resolves.toBeNull();
  });

  it('AC-F22.2 merges read frames into the page capture and counts the rest as skipped', () => {
    const frame = loadRaw('coverage-frame');
    const merged = mergeFrames(raw, [frame]);
    expect(merged.coverage.frames).toEqual({ read: 1, skipped: 1 });
    expect(merged.elementsSampled).toBe(raw.elementsSampled + frame.elementsSampled);
    expect(merged.colors.map((c) => c.value)).toContain('rgb(255, 247, 237)');
    expect(merged.coverage.shadowRoots).toBe(1);
  });

  it('AC-F22.4 auto-scroll ran on request and loaded the lazy content', () => {
    expect(raw.coverage.autoScrolled).toBe(true);
    // .late cards only exist after scrolling.
    expect(colors).toContain('rgb(124, 58, 237)');
  });

  it('AC-F22.4 auto-scroll does not run when switched off', () => {
    expect(loadRaw('lazy').coverage.autoScrolled).toBe(false);
    expect(loadRaw('classic').coverage.autoScrolled).toBe(false);
  });

  it('AC-F22.6 coverage reports frames, shadow roots and auto-scroll', () => {
    expect(raw.coverage).toEqual({
      frames: { read: 0, skipped: 0 },
      shadowRoots: 1,
      autoScrolled: true,
    });
  });
});
