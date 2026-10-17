// applyEdit: the only way the edited DesignSystem changes (AC-F6.6). Pure; returns a new object.

import { categories, findToken, isRef } from '../model/design.js';
import { SEMANTIC_ROLES } from '../model/types.js';

export const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Edit shapes:
 *   { kind: 'rename', tokenId, name }      { kind: 'setRole', tokenId, role }
 *   { kind: 'clearRole', role }            { kind: 'exclude', tokenId }
 *   { kind: 'include', tokenId }           { kind: 'merge', sourceId, targetId }
 * @returns {{ok: true, design: object} | {ok: false, error: 'INVALID_NAME'|'NAME_TAKEN'|'NOT_FOUND'|'SAME_TOKEN'}}
 */
export function applyEdit(design, edit) {
  const next = structuredClone(design);
  switch (edit?.kind) {
    case 'rename':
      return rename(next, edit.tokenId, edit.name);
    case 'setRole':
      return setRole(next, edit.tokenId, edit.role);
    case 'clearRole':
      return clearRole(next, edit.role);
    case 'exclude':
      return setExcluded(next, edit.tokenId, true);
    case 'include':
      return setExcluded(next, edit.tokenId, false);
    case 'merge':
      return merge(next, edit.sourceId, edit.targetId);
    default:
      return { ok: false, error: 'NOT_FOUND' };
  }
}

const ok = (design) => ({ ok: true, design });
const fail = (error) => ({ ok: false, error });

/** Rewrites every recipe reference to a token after it is renamed or merged. */
function updateRefs(design, fromId, category, token) {
  for (const recipe of design.components) {
    for (const [prop, value] of Object.entries(recipe.styles)) {
      if (isRef(value) && value.id === fromId) {
        recipe.styles[prop] = { ref: `${category}.${token.name}`, id: token.id, raw: value.raw };
      }
    }
  }
}

function rename(design, tokenId, rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!NAME_PATTERN.test(name)) return fail('INVALID_NAME');
  const found = findToken(design, tokenId);
  if (!found) return fail('NOT_FOUND');
  if (found.list.some((t) => t !== found.token && t.name === name)) return fail('NAME_TAKEN');
  found.token.name = name;
  updateRefs(design, tokenId, found.category, found.token);
  return ok(design);
}

function setRole(design, tokenId, role) {
  if (!SEMANTIC_ROLES.includes(role)) return fail('NOT_FOUND');
  const token = design.colors.find((c) => c.id === tokenId);
  if (!token) return fail('NOT_FOUND');
  for (const c of design.colors) c.roles = c.roles.filter((r) => r !== role);
  token.excluded = false;
  token.roles = SEMANTIC_ROLES.filter((r) => r === role || token.roles.includes(r));
  return ok(design);
}

function clearRole(design, role) {
  if (!SEMANTIC_ROLES.includes(role)) return fail('NOT_FOUND');
  for (const c of design.colors) c.roles = c.roles.filter((r) => r !== role);
  return ok(design);
}

function setExcluded(design, tokenId, excluded) {
  const found = findToken(design, tokenId) ?? findRecipe(design, tokenId);
  if (!found) return fail('NOT_FOUND');
  found.token.excluded = excluded;
  if (excluded && Array.isArray(found.token.roles)) found.token.roles = [];
  return ok(design);
}

function findRecipe(design, id) {
  const token = design.components.find((r) => r.id === id);
  return token ? { token } : null;
}

function merge(design, sourceId, targetId) {
  if (sourceId === targetId) return fail('SAME_TOKEN');
  const source = findToken(design, sourceId);
  const target = findToken(design, targetId);
  if (!source || !target || source.category !== target.category) return fail('NOT_FOUND');
  const s = source.token;
  const t = target.token;
  t.usageShare = Math.round((t.usageShare + s.usageShare) * 10000) / 10000;
  if (source.category === 'color') {
    t.mergedFrom = [...new Set([...t.mergedFrom, s.hex, ...s.mergedFrom])].sort();
    t.contexts = [...new Set([...t.contexts, ...s.contexts])].sort();
    // Roles the source held move to the target so no role is lost.
    if (!s.excluded)
      t.roles = SEMANTIC_ROLES.filter((r) => t.roles.includes(r) || s.roles.includes(r));
  }
  if (source.category === 'text') {
    t.headings = [...new Set([...t.headings, ...s.headings])].sort();
  }
  const list = categories(design)[source.category];
  list.splice(list.indexOf(s), 1);
  updateRefs(design, sourceId, target.category, t);
  return ok(design);
}
