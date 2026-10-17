// Applies a token mapping's names at export time (F38). Pure.

import { findToken } from '../model/design.js';
import { refreshRefs } from '../edit/apply-edit.js';
import { kebab } from '../detect/variable-rules.js';

/** A copy of the design with matched tokens renamed to the user's names (AC-F38.5). */
export function applyMapping(design, mapping) {
  if (!mapping || !mapping.useMyNames) return design;
  const next = structuredClone(design);
  const used = new Map();
  for (const entry of mapping.entries ?? []) {
    if (!entry.userToken || entry.status === 'none') continue;
    const found = findToken(next, entry.tokenId);
    if (!found) continue;
    let name = userTokenName(entry.userToken);
    const key = `${found.category}|${name}`;
    if (used.has(key)) continue;
    if (found.list.some((t) => t !== found.token && t.name === name)) name = `${name}-${found.token.name}`;
    used.set(key, true);
    if (!found.token.aliases?.includes(found.token.name)) found.token.aliases = [...(found.token.aliases ?? []), found.token.name];
    found.token.name = name;
  }
  return refreshRefs(next);
}

/** "brand.primary" or "--brand-primary" becomes "brand-primary". */
export const userTokenName = (token) => kebab(String(token).replace(/^--/, '').replace(/\./g, '-'));
