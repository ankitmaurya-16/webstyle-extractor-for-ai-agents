// Message contracts between extension contexts, see docs/api.md.
// Message shapes:
//   Panel -> service worker:  { type: 'EXTRACT', tabId }
//   Service worker -> panel:  { type: 'SNAPSHOT', raw } | { type: 'EXTRACT_ERROR', code, detail? }
//   Panel -> analysis worker: { type: 'ANALYZE', requestId, raw }
//   Worker -> panel:          { type: 'PROGRESS', requestId, stage }
//                             | { type: 'RESULT', requestId, design }
//                             | { type: 'ERROR', requestId, code: 'ANALYSIS_FAILED', detail }

export const MSG = Object.freeze({
  EXTRACT: 'EXTRACT',
  SNAPSHOT: 'SNAPSHOT',
  EXTRACT_ERROR: 'EXTRACT_ERROR',
  ANALYZE: 'ANALYZE',
  PROGRESS: 'PROGRESS',
  RESULT: 'RESULT',
  ERROR: 'ERROR',
});

export const EXTRACT_ERROR_CODES = Object.freeze([
  'RESTRICTED_PAGE',
  'FILE_ACCESS',
  'NO_ACCESS',
  'TIMEOUT',
  'EMPTY_PAGE',
  'PAGE_CHANGED',
  'INJECTION_FAILED',
]);

export const ANALYZE_STAGES = Object.freeze(['normalize', 'cluster', 'roles', 'naming']);

export const EXTRACT_TIMEOUT_MS = 10_000;
export const ANALYZE_TIMEOUT_MS = 10_000;
export const PENDING_EXTRACT_MAX_AGE_MS = 10_000;
export const MIN_ELEMENTS = 30;
export const PENDING_EXTRACT_KEY = 'pendingExtract';

export const extractRequest = (tabId) => ({ type: MSG.EXTRACT, tabId });
export const snapshotReply = (raw) => ({ type: MSG.SNAPSHOT, raw });
export const extractError = (code, detail) =>
  detail === undefined
    ? { type: MSG.EXTRACT_ERROR, code }
    : { type: MSG.EXTRACT_ERROR, code, detail };

export const isExtractRequest = (m) =>
  typeof m === 'object' && m !== null && m.type === MSG.EXTRACT && Number.isInteger(m.tabId);
