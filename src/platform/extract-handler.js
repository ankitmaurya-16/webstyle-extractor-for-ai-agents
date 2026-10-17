// The service worker's EXTRACT logic. It keeps no state between events: everything it needs
// arrives with the message, and every listener it adds is removed before it replies.

import { classifyInjectionError, classifyUrl, errorMessage } from './errors.js';
import { executeExtractor, getTab, watchTabChange } from './chrome.js';
import { EXTRACT_TIMEOUT_MS, MIN_ELEMENTS, extractError, snapshotReply } from '../messaging.js';

const NO_RESULT = 'No result';
const NAVIGATION_GRACE_MS = 500;

/**
 * Injects the extractor into the tab and turns the outcome into a BackgroundReply.
 * @param {number} tabId
 * @param {{timeoutMs?: number}} [options]
 */
export async function handleExtract(tabId, { timeoutMs = EXTRACT_TIMEOUT_MS } = {}) {
  let tab;
  try {
    tab = await getTab(tabId);
  } catch (error) {
    return extractError('PAGE_CHANGED', errorMessage(error));
  }
  const url = tab?.url ?? tab?.pendingUrl;
  const restricted = classifyUrl(url);
  if (restricted) return extractError(restricted, url);

  let stopWatching = () => {};
  let timer;
  const pageChanged = new Promise((resolve) => {
    stopWatching = watchTabChange(tabId, () => resolve(extractError('PAGE_CHANGED')));
  });
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(extractError('TIMEOUT')), timeoutMs);
  });
  const injected = executeExtractor(tabId).then(
    (results) => toReply(results, url),
    (error) => extractError(classifyInjectionError(error, url), errorMessage(error)),
  );

  try {
    const reply = await Promise.race([injected, pageChanged, timedOut]);
    if (reply.code === 'INJECTION_FAILED' && reply.detail === NO_RESULT) {
      // Chrome resolves with a null result when the document is torn down mid-run, a moment
      // before the tab reports the navigation. Wait briefly for that report.
      const grace = new Promise((resolve) => setTimeout(() => resolve(reply), NAVIGATION_GRACE_MS));
      return await Promise.race([pageChanged, grace]);
    }
    return reply;
  } finally {
    clearTimeout(timer);
    stopWatching();
  }
}

function toReply(results, startUrl) {
  const first = Array.isArray(results) ? results[0] : undefined;
  const raw = first?.result;
  if (first?.error) return extractError('INJECTION_FAILED', errorMessage(first.error));
  if (!raw || typeof raw !== 'object') return extractError('INJECTION_FAILED', NO_RESULT);
  // A navigation that lands before the script runs is not seen by the tab listener, but the
  // snapshot then comes from a different page.
  if (startUrl && raw.url && raw.url !== startUrl) return extractError('PAGE_CHANGED', raw.url);
  if (typeof raw.elementsSampled !== 'number' || raw.elementsSampled < MIN_ELEMENTS) {
    return extractError('EMPTY_PAGE', `${raw.elementsSampled ?? 0} elements`);
  }
  return snapshotReply(raw);
}
