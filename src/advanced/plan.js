// The Advanced capture plan (F23, F24, F12 forced states, F13 Path B), written once against a
// CdpClient so the extension and the CLI run the same stages.

import { STAGE_TIMEOUT_MS, ADVANCED_TIMEOUT_MS } from '../messaging.js';

export const MAX_SHEET_BYTES = 5 * 1024 * 1024;
export const MAX_STATE_TARGETS = 30;
export const PER_RECIPE_TARGETS = 3;
const FORCED_STATES = ['hover', 'focus', 'focus-visible', 'active'];
const MIN_WIDTH = 320;
const MAX_WIDTH = 1920;
const MAX_WIDTHS = 4;

/**
 * @typedef {object} AdvancedOptions
 * @property {boolean} deepScan
 * @property {boolean} dark
 * @property {boolean} states
 * @property {number[]} widths
 */

/** Widths to capture: at most 4 between 320 and 1920, none within 50 px of the current one. */
export function planWidths(widths, currentWidth) {
  return [...new Set((widths ?? []).map(Number))]
    .filter((w) => w >= MIN_WIDTH && w <= MAX_WIDTH && Math.abs(w - currentWidth) > 50)
    .sort((a, b) => a - b)
    .slice(0, MAX_WIDTHS);
}

/** The stages that will run, for the progress list. */
export function planStages(options, baseRaw) {
  const stages = ['attach'];
  if (options.deepScan) stages.push('deep-scan');
  if (options.dark && canEmulateTheme(baseRaw))
    stages.push(baseRaw.colorScheme === 'dark' ? 'light' : 'dark');
  if (options.states) stages.push('states');
  for (const w of planWidths(options.widths, baseRaw.viewport?.width ?? 0))
    stages.push(`width-${w}`);
  stages.push('detach');
  return stages;
}

/** Path B only applies to the media mechanism; class and attribute sites are never toggled. */
export function canEmulateTheme(raw) {
  const signals = raw?.themeSignals;
  if (!signals?.darkMedia) return false;
  return !(signals.darkSelectors ?? []).length;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error(`${label} timed out`), { code: 'TIMEOUT' })),
        ms,
      );
    }),
  ]);
}

/**
 * Runs every selected stage after the basic capture. A failed stage keeps the others
 * (CAPTURE_PARTIAL). The caller attaches before and detaches after, in a finally block.
 * @param {object} input
 * @param {object} input.cdp CdpClient
 * @param {object} input.baseRaw RawSnapshotV2 from the basic capture
 * @param {AdvancedOptions} input.options
 * @param {(opts: object) => Promise<object>} input.collect runs collect() in the page
 * @param {(selector: string) => Promise<object|null>} input.readRecipe reads recipe styles
 * @param {(stage: string) => void} [input.onStage]
 * @param {AbortSignal} [input.signal]
 * @param {(ms: number) => Promise<void>} [input.wait]
 * @param {(mode: string) => Promise<object>} [input.onThemeCaptured] screenshot hook
 * @returns {Promise<{base: object, extra: Array<{mode: string, kind: string, method: string, viewportWidth: number, raw: object}>, failed: string[]}>}
 */
export async function runAdvancedPlan({
  cdp,
  baseRaw,
  options,
  collect,
  readRecipe,
  onStage = () => {},
  signal,
  wait = sleep,
  onThemeCaptured,
}) {
  const failed = [];
  const extra = [];
  let base = baseRaw;
  const started = Date.now();
  const check = () => {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
    if (Date.now() - started >= ADVANCED_TIMEOUT_MS)
      throw Object.assign(new Error('Advanced capture timed out'), { code: 'TIMEOUT' });
  };
  const stage = async (name, fn) => {
    check();
    onStage(name);
    try {
      // A stage never runs past the plan's own limit (AC-F23.9).
      const remaining = ADVANCED_TIMEOUT_MS - (Date.now() - started);
      await withTimeout(
        Promise.resolve().then(fn),
        Math.max(0, Math.min(STAGE_TIMEOUT_MS, remaining)),
        name,
      );
    } catch (error) {
      if (error?.code === 'CANCELLED' || error?.code === 'PAGE_CHANGED') throw error;
      failed.push(name);
    }
  };

  // 2. Deep scan: every stylesheet's text through the debugger, parsed in the page (AC-F23.3).
  if (options.deepScan) {
    await stage('deep-scan', async () => {
      const headers = [];
      const off = cdp.on('CSS.styleSheetAdded', (p) => headers.push(p.header));
      try {
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        await wait(50);
      } finally {
        off();
      }
      const texts = [];
      let bytes = 0;
      for (const header of headers) {
        if (header.isInline && !header.sourceURL) continue;
        const { text } = await cdp.send('CSS.getStyleSheetText', {
          styleSheetId: header.styleSheetId,
        });
        bytes += text.length;
        if (bytes > MAX_SHEET_BYTES) break;
        texts.push(text);
      }
      const raw = await collect({ sheetTexts: texts });
      if (raw)
        base = { ...raw, deepScan: { sheets: texts.length, capped: bytes > MAX_SHEET_BYTES } };
    });
  }

  // 3. The other theme through emulation, media mechanism only (AC-F13.3, AC-F13.4).
  let themeRaw = null;
  const other = base.colorScheme === 'dark' ? 'light' : 'dark';
  if (options.dark && canEmulateTheme(base)) {
    await stage(other, async () => {
      try {
        await cdp.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: other }],
        });
        await wait(200);
        themeRaw = await collect({});
        if (themeRaw) {
          const capture = {
            mode: other,
            kind: 'theme',
            method: 'emulated',
            viewportWidth: themeRaw.viewport.width,
            raw: themeRaw,
          };
          // A screenshot of the other theme has to be taken while the emulation is on (F36).
          if (onThemeCaptured) capture.screenshot = await onThemeCaptured(other).catch(() => null);
          extra.push(capture);
        }
      } finally {
        await cdp.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
      }
    });
  }

  // 4. Forced states on representative elements, in each captured theme (AC-F12.5).
  if (options.states) {
    await stage('states', async () => {
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      base = { ...base, stateSamples: await forceStates(cdp, base, readRecipe) };
      if (themeRaw) {
        try {
          await cdp.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: other }],
          });
          await wait(100);
          themeRaw.stateSamples = await forceStates(cdp, themeRaw, readRecipe);
        } finally {
          await cdp.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
        }
      }
    });
  }

  // 5. Widths, light theme only (F24).
  for (const width of planWidths(options.widths, base.viewport?.width ?? 0)) {
    await stage(`width-${width}`, async () => {
      try {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: base.viewport?.height ?? 800,
          deviceScaleFactor: 0,
          mobile: width < 768,
        });
        await wait(350);
        const raw = await collect({});
        if (raw)
          extra.push({
            mode: base.colorScheme,
            kind: 'width',
            method: 'emulated',
            viewportWidth: width,
            raw,
          });
      } finally {
        await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
      }
    });
  }
  return { base, extra, failed };
}

/**
 * Forces each state on up to 3 representatives per recipe (30 total), reads the computed recipe
 * styles and clears the forced state afterwards, even on error.
 */
export async function forceStates(cdp, raw, readRecipe) {
  const reps = [];
  const perVariant = new Map();
  for (const r of raw.representatives ?? []) {
    const n = perVariant.get(r.variant) ?? 0;
    if (n >= PER_RECIPE_TARGETS || reps.length >= MAX_STATE_TARGETS) continue;
    perVariant.set(r.variant, n + 1);
    reps.push(r);
  }
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const forced = [];
  const done = new Set();
  for (const rep of reps) {
    if (done.has(rep.variant)) continue;
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: rep.selector,
    });
    if (!nodeId) continue;
    const defaults = await readRecipe(rep.selector);
    if (!defaults) continue;
    for (const state of FORCED_STATES) {
      try {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });
        const styles = await readRecipe(rep.selector);
        const diff = {};
        for (const [prop, value] of Object.entries(styles ?? {}))
          if (value !== defaults[prop]) diff[prop] = value;
        if (Object.keys(diff).length)
          forced.push({
            kind: rep.kind,
            variant: rep.variant,
            state,
            styles: diff,
            source: 'forced',
          });
      } finally {
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {});
      }
    }
    done.add(rep.variant);
  }
  // Forced results replace the stylesheet approximation for every variant that was forced, even
  // when forcing showed no change: the stylesheet guess is then known to be wrong (AC-F12.5).
  const covered = done;
  return [...(raw.stateSamples ?? []).filter((s) => !covered.has(s.variant)), ...forced];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
