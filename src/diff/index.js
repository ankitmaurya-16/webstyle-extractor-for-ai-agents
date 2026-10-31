// Snapshot diff (F39). Tokens are matched per category by name first, then by stable id (value).
// Pure.

import { differenceEuclidean, parse } from 'culori';
import { categories, isRef, visible } from '../model/design.js';
import { SEMANTIC_ROLES, THEME_MODES } from '../model/types.js';

const distance = differenceEuclidean('oklab');

function valueOf(category, t) {
  switch (category) {
    case 'color':
      return t.hex;
    case 'text':
      return `${t.sizePx}px/${t.lineHeightPx ?? 'normal'} ${t.fontWeight}`;
    case 'textStyle':
      return `${t.sizePx}/${t.lineHeightPx ?? 'normal'} ${t.fontWeight} ${t.letterSpacingEm}em ${t.textTransform}`;
    case 'font':
      return t.stack.join(', ');
    case 'shadow':
      return t.value;
    case 'gradient':
      return t.css;
    case 'easing':
      return t.css;
    case 'duration':
      return `${t.ms}ms`;
    case 'tracking':
      return `${t.em}em`;
    case 'grid':
    case 'opacity':
    case 'z':
      return String(t.value);
    default:
      return `${t.px}px`;
  }
}

function delta(category, a, b) {
  if (category === 'color')
    return Math.round(distance(parse(a.hex.slice(0, 7)), parse(b.hex.slice(0, 7))) * 1000) / 1000;
  if (a.px !== undefined && b.px !== undefined) return Math.round((b.px - a.px) * 100) / 100;
  if (a.sizePx !== undefined) return Math.round((b.sizePx - a.sizePx) * 100) / 100;
  if (a.ms !== undefined) return b.ms - a.ms;
  return null;
}

/**
 * @returns {object} DiffResult
 */
export function diffDesigns(a, b) {
  const ca = categories(a);
  const cb = categories(b);
  const result = {
    a: summary(a),
    b: summary(b),
    categories: {},
    roles: [],
    recipes: [],
    stack: {},
    counts: { added: 0, removed: 0, changed: 0, renamed: 0, unchanged: 0 },
  };
  for (const category of Object.keys(ca)) {
    const left = visible(ca[category]);
    const right = visible(cb[category]);
    const usedRight = new Set();
    const out = { added: [], removed: [], changed: [], renamed: [], unchanged: 0 };
    const leftover = [];
    for (const t of left) {
      const same = right.find((r) => !usedRight.has(r) && r.name === t.name);
      if (same) {
        usedRight.add(same);
        if (valueOf(category, t) === valueOf(category, same)) out.unchanged += 1;
        else
          out.changed.push({
            name: t.name,
            from: valueOf(category, t),
            to: valueOf(category, same),
            delta: delta(category, t, same),
          });
      } else leftover.push(t);
    }
    for (const t of leftover) {
      const same = right.find((r) => !usedRight.has(r) && r.id === t.id);
      if (same) {
        usedRight.add(same);
        out.renamed.push({ from: t.name, to: same.name, value: valueOf(category, t) });
      } else out.removed.push({ name: t.name, value: valueOf(category, t) });
    }
    for (const r of right)
      if (!usedRight.has(r)) out.added.push({ name: r.name, value: valueOf(category, r) });
    if (
      out.added.length ||
      out.removed.length ||
      out.changed.length ||
      out.renamed.length ||
      out.unchanged
    ) {
      result.categories[category] = out;
      for (const k of ['added', 'removed', 'changed', 'renamed']) result.counts[k] += out[k].length;
      result.counts.unchanged += out.unchanged;
    }
  }
  // Role changes per theme (AC-F39.4).
  const tokenName = (d, id) => d.colors.find((c) => c.id === id)?.name ?? null;
  const hexOf = (d, id) => d.colors.find((c) => c.id === id)?.hex ?? null;
  for (const role of SEMANTIC_ROLES) {
    for (const mode of THEME_MODES) {
      const ia = a.semantic?.[role]?.[mode];
      const ib = b.semantic?.[role]?.[mode];
      if (!ia && !ib) continue;
      // Ids are values, so the same id is the same color; a new name alone is under Renamed.
      if (ia === ib) continue;
      const fromHex = hexOf(a, ia);
      const toHex = hexOf(b, ib);
      result.roles.push({
        role,
        mode,
        from: ia ? `${tokenName(a, ia)} ${fromHex}` : null,
        to: ib ? `${tokenName(b, ib)} ${toHex}` : null,
        delta:
          fromHex && toHex
            ? Math.round(distance(parse(fromHex.slice(0, 7)), parse(toHex.slice(0, 7))) * 1000) /
              1000
            : null,
      });
    }
  }
  // Recipe property changes.
  const plain = (d, v) => {
    if (!isRef(v)) return String(v ?? '');
    for (const list of Object.values(categories(d))) {
      const t = list.find((x) => x.id === v.id);
      if (t) return t.name;
    }
    return v.raw;
  };
  for (const ra of a.components ?? []) {
    const rb = (b.components ?? []).find((r) => r.id === ra.id);
    if (!rb) {
      result.recipes.push({ id: ra.id, name: ra.name, change: 'removed' });
      continue;
    }
    for (const mode of THEME_MODES) {
      for (const state of Object.keys({ ...ra.byMode[mode], ...rb.byMode[mode] })) {
        const sa = ra.byMode[mode]?.[state] ?? {};
        const sb = rb.byMode[mode]?.[state] ?? {};
        for (const prop of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
          const va = plain(a, sa[prop]);
          const vb = plain(b, sb[prop]);
          if (va !== vb)
            result.recipes.push({
              id: ra.id,
              name: ra.name,
              mode,
              state,
              prop,
              from: va || null,
              to: vb || null,
            });
        }
      }
    }
  }
  for (const rb of b.components ?? []) {
    if (!(a.components ?? []).some((r) => r.id === rb.id))
      result.recipes.push({ id: rb.id, name: rb.name, change: 'added' });
  }
  // Stack changes (AC-F39.5).
  const setDiff = (x, y) => ({
    added: y.filter((v) => !x.includes(v)),
    removed: x.filter((v) => !y.includes(v)),
  });
  const names = (list) => (list ?? []).map((d) => d.name);
  result.stack = {
    framework: setDiff(names(a.meta.framework), names(b.meta.framework)),
    icons: setDiff(names(a.meta.icons), names(b.meta.icons)),
    fonts: setDiff(
      (a.meta.webFonts ?? []).map((f) => f.family),
      (b.meta.webFonts ?? []).map((f) => f.family),
    ),
  };
  return result;
}

function summary(d) {
  return { hostname: d.meta.hostname, sourceUrl: d.meta.sourceUrl, capturedAt: d.meta.capturedAt };
}
