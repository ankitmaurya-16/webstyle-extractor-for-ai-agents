// Maps Chrome's injection error text to our error codes. Chrome does not expose error codes, so
// the patterns below are matched against the message. Check them against new Chrome versions;
// tests/unit/platform/errors.test.js pins each one.

const RESTRICTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'chrome-search:',
  'chrome-untrusted:',
  'devtools:',
  'edge:',
  'brave:',
  'about:',
  'view-source:',
  'data:',
  'javascript:',
];

const RESTRICTED_HOSTS = ['chromewebstore.google.com'];

/** Message patterns, checked in order. The first match wins. */
export const ERROR_PATTERNS = [
  { pattern: /Cannot access a chrome:\/\/ URL/i, code: 'RESTRICTED_PAGE' },
  { pattern: /Cannot access a chrome-extension:\/\/ URL/i, code: 'RESTRICTED_PAGE' },
  { pattern: /The extensions gallery cannot be scripted/i, code: 'RESTRICTED_PAGE' },
  {
    pattern: /Cannot access contents of url "(view-source|about|data|chrome|devtools):/i,
    code: 'RESTRICTED_PAGE',
  },
  { pattern: /Cannot access contents of url "file:/i, code: 'FILE_ACCESS' },
  { pattern: /Frame with ID \d+ was removed/i, code: 'PAGE_CHANGED' },
  { pattern: /No frame with id/i, code: 'PAGE_CHANGED' },
  { pattern: /No tab with id/i, code: 'PAGE_CHANGED' },
  { pattern: /The tab was closed/i, code: 'PAGE_CHANGED' },
  { pattern: /Extension context invalidated/i, code: 'PAGE_CHANGED' },
  { pattern: /Missing host permission for the tab/i, code: 'NO_ACCESS' },
  { pattern: /Cannot access contents of the page/i, code: 'NO_ACCESS' },
  { pattern: /Cannot access contents of url/i, code: 'NO_ACCESS' },
  { pattern: /must request permission to access/i, code: 'NO_ACCESS' },
];

/**
 * Classifies a URL Chrome will never let an extension script. Returns null when the URL is
 * unknown or scriptable, so the caller still tries the injection.
 * @param {string|undefined} url
 */
export function classifyUrl(url) {
  if (!url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (RESTRICTED_SCHEMES.includes(parsed.protocol)) return 'RESTRICTED_PAGE';
  if (RESTRICTED_HOSTS.includes(parsed.hostname)) return 'RESTRICTED_PAGE';
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
    return 'RESTRICTED_PAGE';
  }
  return null;
}

/**
 * @param {unknown} error what executeScript rejected with
 * @param {string|undefined} url the tab URL when known
 * @returns {'RESTRICTED_PAGE'|'FILE_ACCESS'|'NO_ACCESS'|'PAGE_CHANGED'|'INJECTION_FAILED'}
 */
export function classifyInjectionError(error, url) {
  const message = errorMessage(error);
  for (const { pattern, code } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      // A file:// tab can fail with the generic permission text too.
      if (code === 'NO_ACCESS' && url?.startsWith('file:')) return 'FILE_ACCESS';
      return code;
    }
  }
  if (url?.startsWith('file:')) return 'FILE_ACCESS';
  // The PDF viewer runs inside another extension, so a PDF URL that fails is restricted.
  if (url && /\.pdf($|[?#])/i.test(url)) return 'RESTRICTED_PAGE';
  return 'INJECTION_FAILED';
}

/** @param {unknown} error */
export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error);
}
