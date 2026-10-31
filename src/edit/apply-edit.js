// applyEdit: the only way an edited design changes (AC-F6.6), and replay of the edit log onto a
// new analysis (v2 spec 6.3). Pure; returns new objects.

import { categories, findToken, forEachRecipeValue, isRef } from '../model/design.js';
import { SEMANTIC_ROLES, THEME_MODES } from '../model/types.js';

export const NAME_PATTERN = /^[a-z][a-z0-9-]*(\/\d{1,3})?$/;

/**
 * Edit shapes:
 *   { kind: 'rename', tokenId, name }               { kind: 'setRole', tokenId, role, mode }
 *   { kind: 'clearRole', role, mode }               { kind: 'exclude', tokenId }
 *   { kind: 'include', tokenId }                    { kind: 'merge', sourceId, targetId }
 *   { kind: 'renameComponent', componentId, name }  { kind: 'useSiteName', tokenId, use }
 * @returns {{ok: true, design: object} | {ok: false, error: 'INVALID_NAME'|'NAME_TAKEN'|'NOT_FOUND'|'SAME_TOKEN'}}
 */
export function applyEdit(design, edit) {
  return applyInPlace(structuredClone(design), edit);
}

function applyInPlace(next, edit) {
  switch (edit?.kind) {
    case 'rename':
      return rename(next, edit.tokenId, edit.name);
    case 'setRole':
      return setRole(next, edit.tokenId, edit.role, edit.mode ?? 'light');
    case 'clearRole':
      return clearRole(next, edit.role, edit.mode ?? 'light');
    case 'exclude':
      return setExcluded(next, edit.tokenId, true);
    case 'include':
      return setExcluded(next, edit.tokenId, false);
    case 'merge':
      return merge(next, edit.sourceId, edit.targetId);
    case 'renameComponent':
      return renameComponent(next, edit.componentId, edit.name);
    case 'useSiteName':
      return toggleSiteName(next, edit.tokenId, edit.use);
    default:
      return fail('NOT_FOUND');
  }
}

/**
 * Replays an edit log onto a fresh analysis. Edits whose token no longer exists are skipped and
 * counted as stale; they stay in the log (v2 spec 6.3).
 * @returns {{design: object, staleEdits: number}}
 */
export function replay(extracted, edits = []) {
  let design = structuredClone(extracted);
  let staleEdits = 0;
  for (const edit of edits) {
    const result = applyInPlace(design, edit);
    if (result.ok) design = result.design;
    else staleEdits += 1;
  }
  refreshRefs(design);
  return { design, staleEdits };
}

/** Rewrites every recipe reference's display name after renames and merges. */
export function refreshRefs(design) {
  for (const recipe of design.components ?? []) {
    forEachRecipeValue(recipe, (value) => {
      if (!isRef(value)) return;
      const found = findToken(design, value.id);
      if (found) value.ref = `${found.category}.${found.token.name}`;
    });
  }
  return design;
}

const ok = (design) => ({ ok: true, design });
const fail = (error) => ({ ok: false, error });

function rename(design, tokenId, rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!NAME_PATTERN.test(name)) return fail('INVALID_NAME');
  const found = findToken(design, tokenId);
  if (!found) return fail('NOT_FOUND');
  if (found.list.some((t) => t !== found.token && t.name === name)) return fail('NAME_TAKEN');
  found.token.name = name;
  refreshRefs(design);
  return ok(design);
}

function setRole(design, tokenId, role, mode) {
  if (!SEMANTIC_ROLES.includes(role) || !THEME_MODES.includes(mode)) return fail('NOT_FOUND');
  const token = design.colors.find((c) => c.id === tokenId);
  if (!token) return fail('NOT_FOUND');
  token.excluded = false;
  design.semantic ??= {};
  (design.semantic[role] ??= {})[mode] = tokenId;
  return ok(design);
}

function clearRole(design, role, mode) {
  if (!SEMANTIC_ROLES.includes(role)) return fail('NOT_FOUND');
  if (design.semantic?.[role]) {
    delete design.semantic[role][mode];
    if (Object.keys(design.semantic[role]).length === 0) delete design.semantic[role];
  }
  return ok(design);
}

function setExcluded(design, tokenId, excluded) {
  const found = findToken(design, tokenId);
  const recipe = (design.components ?? []).find((r) => r.id === tokenId);
  const token = found?.token ?? recipe;
  if (!token) return fail('NOT_FOUND');
  token.excluded = excluded;
  if (excluded && found?.category === 'color') {
    // Excluding a color clears its roles in every theme (AC-F6.5).
    for (const role of Object.keys(design.semantic ?? {})) {
      for (const [mode, id] of Object.entries(design.semantic[role]))
        if (id === tokenId) delete design.semantic[role][mode];
      if (Object.keys(design.semantic[role]).length === 0) delete design.semantic[role];
    }
  }
  return ok(design);
}

function merge(design, sourceId, targetId) {
  if (sourceId === targetId) return fail('SAME_TOKEN');
  const source = findToken(design, sourceId);
  const target = findToken(design, targetId);
  if (!source || !target || source.category !== target.category) return fail('NOT_FOUND');
  const s = source.token;
  const t = target.token;
  t.usageShare = Math.round(((t.usageShare ?? 0) + (s.usageShare ?? 0)) * 10000) / 10000;
  t.count = (t.count ?? 0) + (s.count ?? 0);
  if (source.category === 'color') {
    t.mergedFrom = [...new Set([...t.mergedFrom, s.hex, ...s.mergedFrom])].sort();
    t.contexts = [...new Set([...t.contexts, ...s.contexts])].sort();
    t.modes = [...new Set([...t.modes, ...s.modes])].sort();
    // Roles the source held move to the target so no role is lost.
    for (const role of Object.keys(design.semantic ?? {})) {
      for (const [mode, id] of Object.entries(design.semantic[role]))
        if (id === sourceId) design.semantic[role][mode] = targetId;
    }
    for (const c of design.colors) if (c.baseTokenId === sourceId) c.baseTokenId = targetId;
    for (const g of design.gradients ?? [])
      for (const stop of g.stops) if (stop.colorTokenId === sourceId) stop.colorTokenId = targetId;
  }
  if (source.category === 'text')
    t.headings = [...new Set([...(t.headings ?? []), ...(s.headings ?? [])])].sort();
  const list = categories(design)[source.category];
  list.splice(list.indexOf(s), 1);
  for (const recipe of design.components ?? []) {
    forEachRecipeValue(recipe, (value) => {
      if (isRef(value) && value.id === sourceId) value.id = targetId;
    });
  }
  if (design.focusRing?.colorTokenId === sourceId) design.focusRing.colorTokenId = targetId;
  refreshRefs(design);
  return ok(design);
}

function renameComponent(design, componentId, rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > 60) return fail('INVALID_NAME');
  const recipe = (design.components ?? []).find((r) => r.id === componentId);
  if (!recipe) return fail('NOT_FOUND');
  recipe.name = name;
  return ok(design);
}

function toggleSiteName(design, tokenId, use) {
  const found = findToken(design, tokenId);
  if (!found || !found.token.siteName) return fail('NOT_FOUND');
  const t = found.token;
  const name = use ? t.siteName : t.generatedName;
  if (found.list.some((o) => o !== t && o.name === name)) return fail('NAME_TAKEN');
  t.name = name;
  t.aliases = [use ? t.generatedName : t.siteName];
  refreshRefs(design);
  return ok(design);
}
