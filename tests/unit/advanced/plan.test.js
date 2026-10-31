import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SHEET_BYTES,
  MAX_STATE_TARGETS,
  canEmulateTheme,
  forceStates,
  planStages,
  planWidths,
  runAdvancedPlan,
} from '../../../src/advanced/plan.js';
import { ADVANCED_TIMEOUT_MS, STAGE_TIMEOUT_MS } from '../../../src/messaging.js';
import { analyze } from '../../../src/analyze/index.js';
import { captureOf, loadRaw } from '../helpers.js';
import { baseRaw, domHandlers, fakeCdp } from './fake-cdp.js';

const ALL = { deepScan: true, dark: true, states: true, widths: [375, 768] };
const NONE = { deepScan: false, dark: false, states: false, widths: [] };
const noWait = async () => {};

/** Runs the plan with a fake page: collect returns a fresh raw, readRecipe a style map. */
function run({
  cdp = fakeCdp({ handlers: domHandlers() }),
  raw = baseRaw(),
  options,
  ...rest
} = {}) {
  const stages = [];
  const collect = rest.collect ?? vi.fn(async () => baseRaw({ collected: true }));
  const readRecipe = rest.readRecipe ?? vi.fn(async () => ({ color: 'rgb(0, 0, 0)' }));
  const promise = runAdvancedPlan({
    cdp,
    baseRaw: raw,
    options,
    collect,
    readRecipe,
    onStage: (s) => stages.push(s),
    wait: noWait,
    ...rest,
  });
  return { promise, stages, collect, readRecipe, cdp };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('planWidths and planStages', () => {
  it('AC-F24.2 keeps at most 4 widths between 320 and 1920 px and skips the current width', () => {
    expect(planWidths([1920, 375, 300, 2000, 768, 1024, 1300, 375], 1280)).toEqual([
      375, 768, 1024, 1920,
    ]);
    // 1300, 1240 and 1330 sit within 50 px of 1280; 1331 is just outside.
    expect(planWidths([1300, 1240, 1330, 1331], 1280)).toEqual([1331]);
    expect(planWidths([320, 1920], 0)).toEqual([320, 1920]);
    expect(planWidths(undefined, 1280)).toEqual([]);
    expect(planWidths(['768'], 1280)).toEqual([768]);
  });

  it('AC-F24.2 caps the list at 4 widths after sorting', () => {
    expect(planWidths([1600, 1440, 1024, 768, 375, 320], 1280)).toEqual([320, 375, 768, 1024]);
  });

  it('AC-F23.5 lists the stages in plan order: attach, deep scan, theme, states, widths, detach', () => {
    expect(planStages(ALL, baseRaw())).toEqual([
      'attach',
      'deep-scan',
      'dark',
      'states',
      'width-375',
      'width-768',
      'detach',
    ]);
    expect(planStages(NONE, baseRaw())).toEqual(['attach', 'detach']);
  });

  it('AC-F23.5 names the light stage when the base capture is dark', () => {
    const raw = baseRaw({ colorScheme: 'dark' });
    expect(planStages({ ...NONE, dark: true }, raw)).toEqual(['attach', 'light', 'detach']);
  });

  it('AC-F13.3 emulates the other theme only for the media mechanism', () => {
    expect(canEmulateTheme(baseRaw())).toBe(true);
    expect(
      canEmulateTheme(baseRaw({ themeSignals: { darkMedia: false, darkSelectors: [] } })),
    ).toBe(false);
    expect(
      canEmulateTheme(baseRaw({ themeSignals: { darkMedia: true, darkSelectors: ['.dark'] } })),
    ).toBe(false);
    expect(canEmulateTheme({})).toBe(false);
    expect(
      planStages({ ...NONE, dark: true }, baseRaw({ themeSignals: { darkMedia: false } })),
    ).toEqual(['attach', 'detach']);
  });
});

describe('runAdvancedPlan', () => {
  it('AC-F23.5 runs the selected stages in order and reports each one', async () => {
    const { promise, stages } = run({ options: ALL });
    const result = await promise;
    expect(stages).toEqual(['deep-scan', 'dark', 'states', 'width-375', 'width-768']);
    expect(result.failed).toEqual([]);
  });

  it('AC-F23.5 matches the stages planStages announced, minus attach and detach', async () => {
    const options = { deepScan: false, dark: true, states: true, widths: [1280, 375] };
    const { promise, stages } = run({ options });
    await promise;
    expect(['attach', ...stages, 'detach']).toEqual(planStages(options, baseRaw()));
  });

  it('AC-F23.3 deep scan reads every stylesheet text through CSS.getStyleSheetText and passes it to collect', async () => {
    const texts = {
      s1: 'a { color: red; }',
      s2: '@media (min-width: 768px) { b { color: blue; } }',
    };
    const cdp = fakeCdp({
      handlers: {
        // Chrome reports existing sheets as CSS.styleSheetAdded events once CSS.enable runs.
        'CSS.enable': (_, c) => {
          c.emit('CSS.styleSheetAdded', {
            header: { styleSheetId: 's1', sourceURL: 'https://cdn.example/a.css' },
          });
          c.emit('CSS.styleSheetAdded', {
            header: { styleSheetId: 's2', sourceURL: 'https://cdn.example/b.css' },
          });
          c.emit('CSS.styleSheetAdded', {
            header: { styleSheetId: 'inline', isInline: true, sourceURL: '' },
          });
        },
        'CSS.getStyleSheetText': ({ styleSheetId }) => ({ text: texts[styleSheetId] }),
      },
    });
    const { promise, collect } = run({ cdp, options: { ...NONE, deepScan: true } });
    const result = await promise;
    expect(cdp.sent('DOM.enable')).toHaveLength(1);
    expect(cdp.sent('CSS.getStyleSheetText').map((c) => c.params.styleSheetId)).toEqual([
      's1',
      's2',
    ]);
    expect(collect).toHaveBeenCalledWith({ sheetTexts: [texts.s1, texts.s2] });
    expect(result.base).toMatchObject({ collected: true, deepScan: { sheets: 2, capped: false } });
    // The event subscription ends with the stage.
    expect(cdp.listenerCount('CSS.styleSheetAdded')).toBe(0);
  });

  it('AC-F23.3 stops reading sheets at the 5 MB cap and says so', async () => {
    const big = 'x'.repeat(Math.ceil(MAX_SHEET_BYTES / 2) + 1);
    const cdp = fakeCdp({
      handlers: {
        'CSS.enable': (_, c) => {
          for (const id of ['a', 'b', 'c'])
            c.emit('CSS.styleSheetAdded', { header: { styleSheetId: id, sourceURL: `${id}.css` } });
        },
        'CSS.getStyleSheetText': () => ({ text: big }),
      },
    });
    const { promise, collect } = run({ cdp, options: { ...NONE, deepScan: true } });
    const result = await promise;
    expect(collect.mock.calls[0][0].sheetTexts).toHaveLength(1);
    expect(result.base.deepScan).toEqual({ sheets: 1, capped: true });
  });

  it('AC-F13.3 captures the other theme with emulation and always resets it', async () => {
    const order = [];
    const cdp = fakeCdp({
      handlers: {
        'Emulation.setEmulatedMedia': (p) => order.push(`media:${p.features[0]?.value ?? 'reset'}`),
      },
    });
    const collect = vi.fn(async () => {
      order.push('collect');
      return baseRaw({ colorScheme: 'dark' });
    });
    const onThemeCaptured = vi.fn(async (mode) => {
      order.push(`shot:${mode}`);
      return 'shot';
    });
    const { promise } = run({ cdp, collect, onThemeCaptured, options: { ...NONE, dark: true } });
    const result = await promise;
    // The screenshot is taken while the emulation is still on (F36).
    expect(order).toEqual(['media:dark', 'collect', 'shot:dark', 'media:reset']);
    expect(result.extra).toEqual([
      expect.objectContaining({
        mode: 'dark',
        kind: 'theme',
        method: 'emulated',
        viewportWidth: 1280,
        screenshot: 'shot',
      }),
    ]);
  });

  it('AC-F23.8 resets the emulation and keeps the other captures when the theme stage fails', async () => {
    let calls = 0;
    const collect = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('page script failed');
      return baseRaw();
    });
    const { promise, cdp } = run({ collect, options: { ...NONE, dark: true, widths: [375] } });
    const result = await promise;
    expect(result.failed).toEqual(['dark']);
    expect(cdp.sent('Emulation.setEmulatedMedia').at(-1).params).toEqual({ features: [] });
    expect(result.extra.map((e) => e.kind)).toEqual(['width']);
    expect(result.base).toMatchObject({ url: 'https://example.com/' });
  });

  it('AC-F23.8 a failed deep scan keeps the basic capture as the base', async () => {
    const raw = baseRaw({ marker: 'basic' });
    const cdp = fakeCdp({
      handlers: {
        'CSS.enable': (_, c) =>
          c.emit('CSS.styleSheetAdded', { header: { styleSheetId: 'a', sourceURL: 'a.css' } }),
        'CSS.getStyleSheetText': () => {
          throw new Error('No style sheet with given id');
        },
      },
    });
    const { promise } = run({ cdp, raw, options: { ...NONE, deepScan: true, states: true } });
    const result = await promise;
    expect(result.failed).toEqual(['deep-scan']);
    expect(result.base.marker).toBe('basic');
  });

  it('AC-F24.1 captures each width with device-metrics emulation and clears the override', async () => {
    const { promise, cdp } = run({ options: { ...NONE, widths: [375, 768] } });
    const result = await promise;
    const overrides = cdp.sent('Emulation.setDeviceMetricsOverride').map((c) => c.params);
    expect(overrides).toEqual([
      { width: 375, height: 720, deviceScaleFactor: 0, mobile: true },
      { width: 768, height: 720, deviceScaleFactor: 0, mobile: false },
    ]);
    expect(cdp.sent('Emulation.clearDeviceMetricsOverride')).toHaveLength(2);
    expect(result.extra).toEqual([
      expect.objectContaining({
        kind: 'width',
        mode: 'light',
        method: 'emulated',
        viewportWidth: 375,
      }),
      expect.objectContaining({
        kind: 'width',
        mode: 'light',
        method: 'emulated',
        viewportWidth: 768,
      }),
    ]);
  });

  it('AC-F24.1 clears the device-metrics override even when the width capture fails', async () => {
    const collect = vi.fn(async () => {
      throw new Error('boom');
    });
    const { promise, cdp } = run({ collect, options: { ...NONE, widths: [375] } });
    const result = await promise;
    expect(result.failed).toEqual(['width-375']);
    const methods = cdp.calls.map((c) => c.method);
    expect(methods.indexOf('Emulation.clearDeviceMetricsOverride')).toBeGreaterThan(
      methods.indexOf('Emulation.setDeviceMetricsOverride'),
    );
  });

  it('AC-F23.6 leaves the detach to the caller, which runs it in a finally block', async () => {
    const { promise, cdp } = run({ options: ALL });
    await promise;
    expect(cdp.detach).not.toHaveBeenCalled();
    const failing = run({
      options: ALL,
      collect: vi.fn(async () => Promise.reject(new Error('x'))),
    });
    await failing.promise;
    expect(failing.cdp.detach).not.toHaveBeenCalled();
  });

  it('AC-F23.6 stops with CANCELLED before the next stage once the signal aborts', async () => {
    const controller = new AbortController();
    const collect = vi.fn(async () => {
      controller.abort();
      return baseRaw();
    });
    const { promise, stages } = run({
      collect,
      signal: controller.signal,
      options: { ...NONE, dark: true, widths: [375] },
    });
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(stages).toEqual(['dark']);
  });

  it('AC-F23.6 a navigation (PAGE_CHANGED) inside a stage ends the plan instead of counting as partial', async () => {
    const collect = vi.fn(async () => {
      throw Object.assign(new Error('navigated'), { code: 'PAGE_CHANGED' });
    });
    const { promise, cdp } = run({ collect, options: { ...NONE, widths: [375] } });
    await expect(promise).rejects.toMatchObject({ code: 'PAGE_CHANGED' });
    expect(cdp.sent('Emulation.clearDeviceMetricsOverride')).toHaveLength(1);
  });

  it('AC-F23.9 stops a stage at 8 s and keeps going with the next one', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const collect = vi.fn(() => {
      calls += 1;
      return calls === 1 ? new Promise(() => {}) : Promise.resolve(baseRaw());
    });
    const { promise } = run({ collect, options: { ...NONE, widths: [375, 768] } });
    await vi.advanceTimersByTimeAsync(STAGE_TIMEOUT_MS - 1);
    let settled = false;
    promise.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await promise;
    expect(result.failed).toEqual(['width-375']);
    expect(result.extra.map((e) => e.viewportWidth)).toEqual([768]);
  });

  it('AC-F23.9 stops the whole plan at 20 s, even in the middle of a stage', async () => {
    vi.useFakeTimers();
    const collect = vi.fn(() => new Promise(() => {}));
    const { promise, stages } = run({
      collect,
      options: { ...NONE, widths: [375, 768, 1024, 1920] },
    });
    let error = null;
    promise.catch((e) => (error = e));
    await vi.advanceTimersByTimeAsync(ADVANCED_TIMEOUT_MS);
    expect(error).toMatchObject({ code: 'TIMEOUT' });
    // Two full stages of 8 s, then the third is cut at the 20 s plan limit.
    expect(stages).toEqual(['width-375', 'width-768', 'width-1024']);
  });
});

describe('forced states (F12 forced path)', () => {
  const reps = (n, perVariant = 1) =>
    Array.from({ length: n * perVariant }, (_, i) => ({
      kind: 'button',
      variant: `button:${Math.floor(i / perVariant)}`,
      selector: `#b${i}`,
    }));

  it('AC-F12.5 forces each state on a representative, stores only changed properties and marks them forced', async () => {
    let forced = [];
    const cdp = fakeCdp({
      handlers: {
        ...domHandlers(),
        'CSS.forcePseudoState': ({ forcedPseudoClasses }) => (forced = forcedPseudoClasses),
      },
    });
    const readRecipe = vi.fn(async () => {
      if (forced[0] === 'hover')
        return { 'background-color': 'rgb(1, 2, 3)', color: 'rgb(255, 255, 255)' };
      if (forced[0] === 'focus-visible')
        return {
          'background-color': 'rgb(9, 9, 9)',
          outline: '2px solid rgb(0, 0, 255)',
          color: 'rgb(255, 255, 255)',
        };
      return { 'background-color': 'rgb(9, 9, 9)', color: 'rgb(255, 255, 255)' };
    });
    const raw = baseRaw({
      representatives: [{ kind: 'button', variant: 'button:a', selector: 'body > button' }],
      stateSamples: [
        {
          kind: 'button',
          variant: 'button:a',
          state: 'hover',
          styles: { color: 'red' },
          source: 'stylesheet',
        },
        {
          kind: 'link',
          variant: 'link:b',
          state: 'hover',
          styles: { color: 'blue' },
          source: 'stylesheet',
        },
      ],
    });
    const samples = await forceStates(cdp, raw, readRecipe);
    expect(samples).toEqual([
      {
        kind: 'link',
        variant: 'link:b',
        state: 'hover',
        styles: { color: 'blue' },
        source: 'stylesheet',
      },
      {
        kind: 'button',
        variant: 'button:a',
        state: 'hover',
        styles: { 'background-color': 'rgb(1, 2, 3)' },
        source: 'forced',
      },
      {
        kind: 'button',
        variant: 'button:a',
        state: 'focus-visible',
        styles: { outline: '2px solid rgb(0, 0, 255)' },
        source: 'forced',
      },
    ]);
    const pseudo = cdp.sent('CSS.forcePseudoState').map((c) => c.params.forcedPseudoClasses);
    expect(pseudo).toEqual([['hover'], [], ['focus'], [], ['focus-visible'], [], ['active'], []]);
    expect(cdp.sent('CSS.forcePseudoState').every((c) => c.params.nodeId === 2)).toBe(true);
  });

  it('AC-F12.5 clears every forced state even when reading the styles fails', async () => {
    const cdp = fakeCdp({ handlers: domHandlers() });
    let n = 0;
    const readRecipe = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error('element gone');
      return { color: 'rgb(0, 0, 0)' };
    });
    const raw = baseRaw({
      representatives: [{ kind: 'button', variant: 'v', selector: 'button' }],
    });
    await expect(forceStates(cdp, raw, readRecipe)).rejects.toThrow('element gone');
    const pseudo = cdp.sent('CSS.forcePseudoState').map((c) => c.params.forcedPseudoClasses);
    expect(pseudo).toEqual([['hover'], []]);
  });

  it('AC-F12.5 replaces the stylesheet guess for a forced variant even when forcing showed no change', async () => {
    const cdp = fakeCdp({ handlers: domHandlers() });
    const raw = baseRaw({
      representatives: [{ kind: 'button', variant: 'v', selector: 'button' }],
      stateSamples: [
        {
          kind: 'button',
          variant: 'v',
          state: 'hover',
          styles: { color: 'red' },
          source: 'stylesheet',
        },
      ],
    });
    const samples = await forceStates(cdp, raw, async () => ({ color: 'rgb(0, 0, 0)' }));
    expect(samples).toEqual([]);
  });

  it('AC-F12.5 skips representatives whose node is gone and keeps their stylesheet states', async () => {
    const cdp = fakeCdp({
      handlers: { ...domHandlers(), 'DOM.querySelector': () => ({ nodeId: 0 }) },
    });
    const stylesheet = {
      kind: 'button',
      variant: 'v',
      state: 'hover',
      styles: { color: 'red' },
      source: 'stylesheet',
    };
    const raw = baseRaw({
      representatives: [{ kind: 'button', variant: 'v', selector: 'button' }],
      stateSamples: [stylesheet],
    });
    expect(await forceStates(cdp, raw, async () => ({}))).toEqual([stylesheet]);
    expect(cdp.sent('CSS.forcePseudoState')).toHaveLength(0);
  });

  it('AC-F12.5 forces at most 30 targets, 3 representatives per recipe considered', async () => {
    const cdp = fakeCdp({ handlers: domHandlers() });
    const readRecipe = vi.fn(async () => ({}));
    await forceStates(cdp, baseRaw({ representatives: reps(40) }), readRecipe);
    expect(cdp.sent('DOM.querySelector')).toHaveLength(MAX_STATE_TARGETS);
    const cdp2 = fakeCdp({ handlers: domHandlers() });
    await forceStates(cdp2, baseRaw({ representatives: reps(2, 5) }), readRecipe);
    // One forced representative per recipe is enough: they share one computed style.
    expect(cdp2.sent('DOM.querySelector').map((c) => c.params.selector)).toEqual(['#b0', '#b5']);
  });

  it('AC-F12.5 the states stage forces states in each captured theme and the base gets forced samples', async () => {
    let forced = [];
    let scheme = 'light';
    const cdp = fakeCdp({
      handlers: {
        ...domHandlers(),
        'CSS.forcePseudoState': ({ forcedPseudoClasses }) => (forced = forcedPseudoClasses),
        'Emulation.setEmulatedMedia': ({ features }) => (scheme = features[0]?.value ?? 'light'),
      },
    });
    const representatives = [{ kind: 'button', variant: 'v', selector: 'button' }];
    const readRecipe = vi.fn(async () => ({
      color: forced[0] === 'hover' ? `hover-${scheme}` : `default-${scheme}`,
    }));
    const collect = vi.fn(async () => baseRaw({ colorScheme: 'dark', representatives }));
    const { promise } = run({
      cdp,
      collect,
      readRecipe,
      raw: baseRaw({ representatives }),
      options: { ...NONE, dark: true, states: true },
    });
    const result = await promise;
    expect(result.base.stateSamples).toEqual([
      {
        kind: 'button',
        variant: 'v',
        state: 'hover',
        styles: { color: 'hover-light' },
        source: 'forced',
      },
    ]);
    expect(result.extra[0].raw.stateSamples).toEqual([
      {
        kind: 'button',
        variant: 'v',
        state: 'hover',
        styles: { color: 'hover-dark' },
        source: 'forced',
      },
    ]);
    expect(scheme).toBe('light');
  });

  it('AC-F12.5 forced samples give recipes stateSource forced', () => {
    const raw = loadRaw('states');
    const variant = raw.representatives.find((r) => r.kind === 'button').variant;
    const forcedRaw = {
      ...raw,
      stateSamples: [
        {
          kind: 'button',
          variant,
          state: 'hover',
          styles: { 'background-color': 'rgb(30, 64, 175)' },
          source: 'forced',
        },
      ],
    };
    const d = analyze([captureOf(forcedRaw)], { advanced: true });
    const primary = d.components.find((r) => r.kind === 'button' && r.variant === 'primary');
    expect(primary.stateSource).toBe('forced');
    // Unreadable sheets no longer make states partial once forced states were used (AC-F12.10).
    const partialRaw = { ...forcedRaw, stylesheets: { readable: 1, unreadable: 1 } };
    expect(analyze([captureOf(partialRaw)]).meta.partial).not.toContain('states');
  });
});

describe('width captures in analysis (F24)', () => {
  it('AC-F24.3 width captures never change token usage shares', () => {
    const raw = loadRaw('classic');
    const narrow = { ...loadRaw('classic'), viewport: { width: 375, height: 720 } };
    narrow.colors = narrow.colors.map((c, i) => (i === 0 ? { ...c, weight: c.weight * 50 } : c));
    const alone = analyze([captureOf(raw)]);
    const withWidth = analyze([
      captureOf(raw),
      captureOf(narrow, { id: 'w375', kind: 'width', method: 'emulated', viewportWidth: 375 }),
    ]);
    const shares = (d) => d.colors.map((c) => [c.id, c.usageShare]);
    expect(shares(withWidth)).toEqual(shares(alone));
    expect(withWidth.spacing.tokens.map((t) => t.usageShare)).toEqual(
      alone.spacing.tokens.map((t) => t.usageShare),
    );
    expect(withWidth.meta.viewports).toEqual([1280, 375]);
  });
});
