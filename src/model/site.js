// Same-site rule for merging pages (v2 spec decision log): the same hostname, or hostnames that
// share their last two labels. Pure.

const lastTwo = (host) =>
  String(host ?? '')
    .toLowerCase()
    .split('.')
    .filter(Boolean)
    .slice(-2)
    .join('.');

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function sameSite(a, b) {
  const ha = a.includes('://') ? hostOf(a) : a.toLowerCase();
  const hb = b.includes('://') ? hostOf(b) : b.toLowerCase();
  if (!ha || !hb) return false;
  if (ha === hb) return true;
  // IP addresses and single-label hosts only match exactly.
  if (/^[\d.]+$/.test(ha) || /^[\d.]+$/.test(hb) || !ha.includes('.') || !hb.includes('.'))
    return false;
  return lastTwo(ha) === lastTwo(hb);
}
