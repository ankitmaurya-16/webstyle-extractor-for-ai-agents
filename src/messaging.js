// Message contracts between extension contexts (docs/api.md, docs/v2-spec.md section 7).
//
// Panel <-> service worker, over the 'panel' port (and runtime.sendMessage for EXTRACT):
//   EXTRACT { requestId, tabId, intent: 'new'|'rerun'|'add-page'|'component', snapshotId?,
//             rootSelector?, autoScroll, advanced: AdvancedOptions|null, screenshots }
//     -> CAPTURES { requestId, captures, warnings, screenshot? } | EXTRACT_ERROR { requestId, code, detail? }
//   EXTRACT_PROGRESS { requestId, stage }          (service worker to panel)
//   CANCEL { requestId }
//   PICK_START { tabId } -> PICK_READY | EXTRACT_ERROR;  PICK_STOP { tabId }
//   HIGHLIGHT_SHOW { tabId, tokenId, match } -> HIGHLIGHT_COUNT { count };  HIGHLIGHT_CLEAR { tabId }
// Picker script to panel (runtime.sendMessage): PICK_RESULT { selector, rect, tag, role },
//   PICK_HOVER { tag, width, height }, PICK_CANCELLED
// Panel <-> analysis worker:
//   ANALYZE { requestId, captures, edits, options } -> PROGRESS* then RESULT { requestId, extracted, edited, staleEdits } | ERROR
//   MAP { requestId, design, fileText, fileName } -> MAP_RESULT { requestId, mapping } | ERROR MAPPING_PARSE_FAILED
//   DIFF { requestId, a, b } -> DIFF_RESULT { requestId, diff }

export const MSG = Object.freeze({
  EXTRACT: 'EXTRACT',
  CAPTURES: 'CAPTURES',
  SNAPSHOT: 'SNAPSHOT',
  EXTRACT_ERROR: 'EXTRACT_ERROR',
  EXTRACT_PROGRESS: 'EXTRACT_PROGRESS',
  CANCEL: 'CANCEL',
  PICK_START: 'PICK_START',
  PICK_READY: 'PICK_READY',
  PICK_RESULT: 'PICK_RESULT',
  PICK_HOVER: 'PICK_HOVER',
  PICK_CANCELLED: 'PICK_CANCELLED',
  PICK_STOP: 'PICK_STOP',
  HIGHLIGHT_SHOW: 'HIGHLIGHT_SHOW',
  HIGHLIGHT_COUNT: 'HIGHLIGHT_COUNT',
  HIGHLIGHT_CLEAR: 'HIGHLIGHT_CLEAR',
  ANALYZE: 'ANALYZE',
  PROGRESS: 'PROGRESS',
  RESULT: 'RESULT',
  ERROR: 'ERROR',
  MAP: 'MAP',
  MAP_RESULT: 'MAP_RESULT',
  DIFF: 'DIFF',
  DIFF_RESULT: 'DIFF_RESULT',
});

export const EXTRACT_ERROR_CODES = Object.freeze([
  'RESTRICTED_PAGE',
  'FILE_ACCESS',
  'NO_ACCESS',
  'TIMEOUT',
  'EMPTY_PAGE',
  'PAGE_CHANGED',
  'INJECTION_FAILED',
  'DEBUGGER_DENIED',
  'DEBUGGER_ATTACH_FAILED',
  'PICK_FAILED',
]);

export const PANEL_PORT = 'panel';
export const EXTRACT_TIMEOUT_MS = 10_000;
export const ADVANCED_TIMEOUT_MS = 20_000;
export const STAGE_TIMEOUT_MS = 8_000;
export const ANALYZE_TIMEOUT_MS = 10_000;
export const PENDING_EXTRACT_MAX_AGE_MS = 10_000;
export const MIN_ELEMENTS = 30;
export const PENDING_EXTRACT_KEY = 'pendingExtract';
export const ACTIVE_CAPTURE_KEY = 'activeCapture';

export const extractError = (code, detail, requestId) => {
  const msg = { type: MSG.EXTRACT_ERROR, code };
  if (detail !== undefined) msg.detail = detail;
  if (requestId !== undefined) msg.requestId = requestId;
  return msg;
};

export const isExtractRequest = (m) =>
  typeof m === 'object' && m !== null && m.type === MSG.EXTRACT && Number.isInteger(m.tabId);

/** Default options for an EXTRACT request. */
export function extractRequest(tabId, options = {}) {
  return {
    type: MSG.EXTRACT,
    requestId: options.requestId ?? null,
    tabId,
    intent: options.intent ?? 'new',
    snapshotId: options.snapshotId ?? null,
    rootSelector: options.rootSelector ?? null,
    autoScroll: Boolean(options.autoScroll),
    advanced: options.advanced ?? null,
    screenshots: Boolean(options.screenshots),
  };
}
