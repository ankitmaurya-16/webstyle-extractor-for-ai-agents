// UI strings (F44). t() reads chrome.i18n so a translated messages.json takes over; outside the
// extension (tests, the CLI) it falls back to the bundled English file. Exports stay in English
// and never call t() (AC-F44.4).

import messages from '../public/_locales/en/messages.json';

const dev = import.meta.env?.DEV === true || import.meta.env?.MODE === 'test';

function fallback(key, subs) {
  const entry = messages[key];
  if (!entry) return undefined;
  return entry.message.replace(/\$p(\d)\$/g, (_, n) => String(subs[Number(n) - 1] ?? ''));
}

/**
 * @param {string} key snake_case message key
 * @param {...(string|number)} subs substitutions for $1 to $9
 */
export function t(key, ...subs) {
  const values = subs.map(String);
  let text;
  try {
    text = globalThis.chrome?.i18n?.getMessage?.(key, values) || undefined;
  } catch {
    text = undefined;
  }
  text ??= fallback(key, values);
  if (text === undefined) {
    // A missing key is a programmer error in development; users see the key, not a crash.
    if (dev) throw new Error(`Missing message: ${key}`);
    return key;
  }
  return text;
}

export const hasMessage = (key) => key in messages;

export function uiLocale() {
  try {
    return globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || 'en';
  } catch {
    return 'en';
  }
}

/** Numbers and dates through Intl with the UI locale (AC-F44.5). */
export const formatNumber = (n, options) => new Intl.NumberFormat(uiLocale(), options).format(n);

export const formatPercent = (share) => {
  if (share > 0 && share < 0.01) return `<${formatNumber(0.01, { style: 'percent' })}`;
  return formatNumber(share, { style: 'percent', maximumFractionDigits: 0 });
};

export const shortDate = (ts) =>
  new Intl.DateTimeFormat(uiLocale(), { month: 'short', day: 'numeric' }).format(new Date(ts));

export const timeOfDay = (ts) =>
  new Intl.DateTimeFormat(uiLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(ts));

export function relativeDate(ts, now = Date.now()) {
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return t('just_now');
  if (minutes < 60) return t('minutes_ago', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('hours_ago', hours);
  return shortDate(ts);
}

export function historyDate(ts, now = Date.now()) {
  const d = new Date(ts);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) return t('today_at', timeOfDay(ts));
  return new Intl.DateTimeFormat(uiLocale(), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  return `${formatNumber(bytes / 1024, { maximumFractionDigits: 1 })} KB`;
}
