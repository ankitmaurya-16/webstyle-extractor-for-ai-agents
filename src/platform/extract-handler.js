// The service worker's EXTRACT logic (F1, F22, F23, F36). It keeps no state between events:
// everything arrives with the message, and every listener, overlay and debugger session it
// starts is cleaned up before it replies.

import { classifyInjectionError, classifyUrl, errorMessage } from './errors.js';
import { getTab, watchTabChange } from './chrome.js';
import {
  ACTIVE_CAPTURE_KEY,
  EXTRACT_TIMEOUT_MS,
  MIN_ELEMENTS,
  MSG,
  extractError,
} from '../messaging.js';
import { chromeDebuggerClient } from '../advanced/cdp-client.js';
import { runAdvancedPlan } from '../advanced/plan.js';

const NAVIGATION_GRACE_MS = 500;
const AUTO_SCROLL_EXTRA_MS = 6_000;

const api = () => globalThis.chrome;
const sameDocument = (a, b) => String(a).split('#')[0] === String(b).split('#')[0];

/** Injects the extractor, which installs self.__webstyle once per frame (AC-F23.2). */
async function inject(tabId, allFrames) {
  await api().scripting.executeScript({ target: { tabId, allFrames }, files: ['/extractor.js'] });
}

/** Runs collect() through the installed API with options (AC-F23.2). */
function collectIn(tabId, allFrames, options) {
  return api().scripting.executeScript({
    target: allFrames ? { tabId, allFrames: true } : { tabId, frameIds: [0] },
    func: (opts) => (self.__webstyle ? self.__webstyle.collect(opts) : null),
    args: [options],
  });
}

async function readRecipe(tabId, selector) {
  const [r] = await api().scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (sel) => (self.__webstyle ? self.__webstyle.readRecipe(sel) : null),
    args: [selector],
  });
  return r?.result ?? null;
}

/** Merges same-origin frame captures into the page capture (AC-F22.2). */
export function mergeFrames(top, frames) {
  const merged = { ...top };
  const lists = [
    'colors',
    'fontFamilies',
    'fontSizes',
    'fontWeights',
    'lineHeights',
    'letterSpacings',
    'textTransforms',
    'textStyles',
    'spacing',
    'radii',
    'shadows',
    'borderWidths',
    'borderStyles',
    'opacities',
    'durations',
    'easings',
    'transitionProperties',
    'gradients',
    'containers',
    'gridColumns',
    'gaps',
    'iconSizes',
    'iconStrokes',
    'contrastSamples',
    'samples',
    'zIndices',
    'frameworkSignals',
    'iconSignals',
    'variableDefs',
  ];
  for (const frame of frames) {
    for (const key of lists) merged[key] = [...(merged[key] ?? []), ...(frame[key] ?? [])];
    merged.elementsSampled += frame.elementsSampled;
    merged.fontFaces = [...(merged.fontFaces ?? []), ...(frame.fontFaces ?? [])];
    merged.breakpoints = [
      ...new Set([...(merged.breakpoints ?? []), ...(frame.breakpoints ?? [])]),
    ];
  }
  const total = top.frameCount ?? frames.length;
  merged.coverage = {
    ...(top.coverage ?? {}),
    frames: { read: frames.length, skipped: Math.max(0, total - frames.length) },
  };
  return merged;
}

const toCapture = (raw, extra) => ({
  id: crypto.randomUUID(),
  pageUrl: raw.url,
  mode: raw.colorScheme === 'dark' ? 'dark' : 'light',
  viewportWidth: raw.viewport?.width ?? 0,
  method: 'computed',
  kind: 'base',
  capturedAt: raw.capturedAt,
  raw,
  ...extra,
});

async function setActiveCapture(value) {
  try {
    if (value) await api().storage.session.set({ [ACTIVE_CAPTURE_KEY]: value });
    else await api().storage.session.remove(ACTIVE_CAPTURE_KEY);
  } catch {
    // Session storage is best effort; cleanup still runs in finally blocks.
  }
}

/** Takes one screenshot of the visible tab, or null (AC-F36.7). */
async function screenshot(windowId) {
  try {
    const dataUrl = await api().tabs.captureVisibleTab(windowId, { format: 'png' });
    return { dataUrl, at: Date.now() };
  } catch {
    return null;
  }
}

/**
 * @param {object} msg EXTRACT request
 * @param {{signal?: AbortSignal, onProgress?: (stage: string) => void, timeoutMs?: number}} [ctx]
 */
export async function handleExtract(msg, { signal, onProgress = () => {}, timeoutMs } = {}) {
  const tabId = typeof msg === 'number' ? msg : msg.tabId;
  const request = typeof msg === 'number' ? { tabId } : msg;
  const requestId = request.requestId ?? undefined;
  let tab;
  try {
    tab = await getTab(tabId);
  } catch (error) {
    return extractError('PAGE_CHANGED', errorMessage(error), requestId);
  }
  const url = tab?.url ?? tab?.pendingUrl;
  const restricted = classifyUrl(url);
  if (restricted) return extractError(restricted, url, requestId);

  const basicTimeout =
    (timeoutMs ?? EXTRACT_TIMEOUT_MS) + (request.autoScroll ? AUTO_SCROLL_EXTRA_MS : 0);
  let stopWatching = () => {};
  let timer;
  let navigated = false;
  const pageChanged = new Promise((resolve) => {
    stopWatching = watchTabChange(tabId, () => {
      navigated = true;
      resolve(extractError('PAGE_CHANGED', undefined, requestId));
    });
  });
  const cancelled = new Promise((resolve) => {
    if (signal?.aborted) resolve({ type: 'CANCELLED' });
    signal?.addEventListener('abort', () => resolve({ type: 'CANCELLED' }), { once: true });
  });
  let cdp = null;
  await setActiveCapture({ tabId, debuggerAttached: false, overlays: [], startedAt: Date.now() });

  try {
    // ---- Basic capture ----
    const allFrames = request.intent !== 'component';
    const basic = (async () => {
      try {
        await inject(tabId, allFrames);
      } catch (error) {
        return extractError(classifyInjectionError(error, url), errorMessage(error), requestId);
      }
      onProgress(request.autoScroll ? 'scrolling' : 'reading');
      let results;
      try {
        results = await collectIn(tabId, allFrames, {
          autoScroll: request.autoScroll,
          rootSelector: request.rootSelector ?? null,
        });
      } catch (error) {
        return extractError(classifyInjectionError(error, url), errorMessage(error), requestId);
      }
      if (request.autoScroll) onProgress('reading');
      const top = results?.find((r) => r.frameId === 0)?.result;
      if (!top || typeof top !== 'object')
        return extractError('INJECTION_FAILED', 'No result', requestId);
      // A navigation that lands before the script runs is not seen by the tab listener, but the
      // snapshot then comes from a different page.
      if (url && top.url && !sameDocument(top.url, url))
        return extractError('PAGE_CHANGED', top.url, requestId);
      const frames = results.filter((r) => r.frameId !== 0 && r.result).map((r) => r.result);
      return { raw: mergeFrames(top, frames) };
    })();
    let timedOut;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(
        () => resolve((timedOut = extractError('TIMEOUT', undefined, requestId))),
        basicTimeout,
      );
    });
    let outcome = await Promise.race([basic, pageChanged, timeout, cancelled]);
    clearTimeout(timer);
    if (outcome.type === 'CANCELLED') return outcome;
    if (outcome.type === MSG.EXTRACT_ERROR) {
      if (outcome.code === 'INJECTION_FAILED' && outcome.detail === 'No result' && !timedOut) {
        // Chrome resolves with a null result when the document is torn down mid-run, a moment
        // before the tab reports the navigation. Wait briefly for that report.
        const grace = new Promise((resolve) =>
          setTimeout(() => resolve(outcome), NAVIGATION_GRACE_MS),
        );
        outcome = await Promise.race([pageChanged, grace]);
      }
      return outcome;
    }
    const base = outcome.raw;
    const minimum = request.intent === 'component' ? 1 : MIN_ELEMENTS;
    if (typeof base.elementsSampled !== 'number' || base.elementsSampled < minimum) {
      return extractError('EMPTY_PAGE', `${base.elementsSampled ?? 0} elements`, requestId);
    }

    const screenshots = [];
    if (request.screenshots) {
      const shot = await screenshot(tab.windowId);
      if (shot)
        screenshots.push({
          mode: base.colorScheme,
          ...shot,
          dpr: base.devicePixelRatio ?? 1,
          representatives: base.representatives,
        });
    }

    // ---- Advanced capture (F23) ----
    const warnings = [];
    let captures = [toCapture(base)];
    if (request.advanced) {
      if (!api().debugger) return extractError('DEBUGGER_DENIED', undefined, requestId);
      cdp = chromeDebuggerClient(api(), tabId);
      onProgress('attach');
      try {
        await cdp.attach();
      } catch (error) {
        return extractError('DEBUGGER_ATTACH_FAILED', errorMessage(error), requestId);
      }
      await setActiveCapture({
        tabId,
        debuggerAttached: true,
        overlays: [],
        startedAt: Date.now(),
      });
      const detached = new Promise((resolve) => {
        const listener = (source) => {
          if (source.tabId === tabId)
            resolve(extractError('PAGE_CHANGED', 'Debugger detached', requestId));
        };
        api().debugger.onDetach?.addListener(listener);
        signal?.addEventListener('abort', () => api().debugger.onDetach?.removeListener(listener), {
          once: true,
        });
      });
      const controller = new AbortController();
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      const plan = runAdvancedPlan({
        cdp,
        baseRaw: base,
        options: request.advanced,
        collect: async (opts) => {
          const [r] = await collectIn(tabId, false, {
            ...opts,
            autoScroll: false,
            rootSelector: request.rootSelector ?? null,
          });
          return r?.result ?? null;
        },
        readRecipe: (selector) => readRecipe(tabId, selector),
        onStage: onProgress,
        signal: controller.signal,
        onThemeCaptured: async (mode) => {
          if (!request.screenshots) return null;
          // captureVisibleTab is rate-limited; keep shots at least 500 ms apart (AC-F36.2).
          const last = screenshots.at(-1)?.at ?? 0;
          const gap = Date.now() - last;
          if (gap < 500) await new Promise((r) => setTimeout(r, 500 - gap));
          const shot = await screenshot(tab.windowId);
          if (shot)
            screenshots.push({
              mode,
              ...shot,
              dpr: base.devicePixelRatio ?? 1,
              representatives: base.representatives,
            });
          return null;
        },
      });
      const result = await Promise.race([plan, pageChanged, cancelled, detached]);
      if (result.type === 'CANCELLED') {
        controller.abort();
        return result;
      }
      if (result.type === MSG.EXTRACT_ERROR) {
        controller.abort();
        return result;
      }
      captures = [
        toCapture(result.base),
        ...result.extra.map((e) =>
          toCapture(e.raw, {
            mode: e.mode,
            kind: e.kind,
            method: e.method,
            viewportWidth: e.viewportWidth,
          }),
        ),
      ];
      warnings.push(...result.failed);
      onProgress('detach');
    }
    if (navigated) return extractError('PAGE_CHANGED', undefined, requestId);
    return { type: MSG.CAPTURES, requestId, captures, warnings, screenshots };
  } catch (error) {
    if (error?.code === 'CANCELLED') return { type: 'CANCELLED' };
    if (error?.code === 'TIMEOUT') return extractError('TIMEOUT', errorMessage(error), requestId);
    return extractError('INJECTION_FAILED', errorMessage(error), requestId);
  } finally {
    clearTimeout(timer);
    stopWatching();
    // The debugger is always detached here, whatever happened (AC-F23.6).
    if (cdp) await cdp.detach();
    await setActiveCapture(null);
  }
}

/** On service-worker start: detach a debugger left attached by a restart (AC-F23.7). */
export async function recoverActiveCapture() {
  let record;
  try {
    record = (await api().storage.session.get(ACTIVE_CAPTURE_KEY))[ACTIVE_CAPTURE_KEY];
  } catch {
    return;
  }
  if (!record) return;
  if (record.debuggerAttached && api().debugger) {
    await api()
      .debugger.detach({ tabId: record.tabId })
      .catch(() => {});
  }
  await cleanupOverlays(record.tabId);
  await setActiveCapture(null);
}

/** Removes the picker and highlight overlays from a tab, if present. */
export async function cleanupOverlays(tabId) {
  if (tabId === undefined || tabId === null) return;
  try {
    await api().scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => {
        self.__webstylePicker?.stop?.();
        self.__webstyleHighlighter?.clear?.();
      },
    });
  } catch {
    // The tab is gone or not accessible; its overlays went with it.
  }
}
