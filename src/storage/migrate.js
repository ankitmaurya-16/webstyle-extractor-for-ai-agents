// v1 to v2 snapshot migration (v2 spec 6.4). Pure; used by the IndexedDB upgrade and by import.

import { analyze } from '../analyze/index.js';
import { upgradeRaw } from '../analyze/pool.js';
import { replay } from '../edit/apply-edit.js';
import { colorLookup } from '../analyze/colors.js';

/**
 * @param {object} v1 a schemaVersion 1 SnapshotRecord
 * @returns {{record: object, droppedEdits: number}}
 */
export function migrateRecord(v1) {
  const raw = upgradeRaw(v1.raw);
  const mode = raw.colorScheme === 'dark' ? 'dark' : 'light';
  const captures = [
    {
      id: `${v1.id}-1`,
      pageUrl: v1.url ?? raw.url,
      mode,
      viewportWidth: raw.viewport?.width ?? 0,
      method: 'computed',
      kind: 'base',
      capturedAt: v1.capturedAt,
      raw,
    },
  ];
  const extracted = analyze(captures, { useSiteVariableNames: true });
  const { edits, dropped } = deriveEdits(v1.extracted, v1.edited, extracted, mode);
  const { design, staleEdits } = replay(extracted, edits);
  return {
    record: {
      id: v1.id,
      schemaVersion: 2,
      kind: 'page',
      url: v1.url,
      hostname: v1.hostname,
      title: v1.title,
      capturedAt: v1.capturedAt,
      updatedAt: v1.capturedAt,
      pages: [v1.url],
      captures,
      extracted,
      edits,
      edited: design,
      staleEdits,
      mapping: null,
      screenshotIds: [],
      migratedFromV1: true,
    },
    droppedEdits: dropped + staleEdits,
  };
}

const V1_LISTS = [
  ['colors', (d) => d.colors],
  ['families', (d) => d.typography.families],
  ['sizes', (d) => d.typography.sizes],
  ['spacing', (d) => d.spacing.tokens],
  ['radii', (d) => d.radii],
  ['shadows', (d) => d.shadows],
  ['breakpoints', (d) => d.breakpoints],
];

/** Finds the v2 token a v1 token became, matched by value. */
function matcher(kind, v2) {
  switch (kind) {
    case 'colors': {
      const find = colorLookup(v2.colors);
      return (t) => find(t.hex);
    }
    case 'families':
      return (t) =>
        v2.typography.families.find((f) => f.stack[0]?.toLowerCase() === t.stack[0]?.toLowerCase());
    case 'sizes':
      return (t) => v2.typography.sizes.find((s) => s.sizePx === t.sizePx);
    case 'spacing':
      return (t) => v2.spacing.tokens.find((s) => s.px === t.px);
    case 'radii':
      return (t) => v2.radii.find((s) => s.px === t.px);
    case 'shadows':
      return (t) => v2.shadows.find((s) => s.value === t.value);
    case 'breakpoints':
      return (t) => v2.breakpoints.find((s) => s.px === t.px);
    default:
      return () => null;
  }
}

/**
 * Derives the edit log by comparing the v1 extracted and edited copies (renames, role changes,
 * exclusions and merges), matched by value. Unmatched edits are dropped and counted.
 */
export function deriveEdits(extracted, edited, v2, mode) {
  const edits = [];
  let dropped = 0;
  for (const [kind, get] of V1_LISTS) {
    const before = get(extracted) ?? [];
    const after = get(edited) ?? [];
    const toV2 = matcher(kind, v2);
    for (const token of before) {
      const now = after.find((t) => t.id === token.id);
      const target = toV2(token);
      if (!now) {
        // Merged away: the target is the token that lists its hex (colors only).
        const into =
          kind === 'colors' ? after.find((t) => t.mergedFrom?.includes(token.hex)) : null;
        const intoV2 = into ? toV2(into) : null;
        if (target && intoV2 && target.id !== intoV2.id)
          edits.push({ kind: 'merge', sourceId: target.id, targetId: intoV2.id });
        else dropped += 1;
        continue;
      }
      if (!target) {
        if (now.name !== token.name || now.excluded !== token.excluded) dropped += 1;
        continue;
      }
      if (now.name !== token.name)
        edits.push({ kind: 'rename', tokenId: target.id, name: now.name });
      if (now.excluded !== token.excluded)
        edits.push({ kind: now.excluded ? 'exclude' : 'include', tokenId: target.id });
    }
  }
  // Roles (colors only).
  const rolesIn = (design) => {
    const map = new Map();
    for (const c of design.colors ?? []) for (const r of c.roles ?? []) map.set(r, c);
    return map;
  };
  const before = rolesIn(extracted);
  const after = rolesIn(edited);
  const toV2 = matcher('colors', v2);
  for (const role of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(role);
    const b = after.get(role);
    if (a?.id === b?.id) continue;
    if (!b) {
      edits.push({ kind: 'clearRole', role, mode });
      continue;
    }
    const target = toV2(b);
    if (target) edits.push({ kind: 'setRole', tokenId: target.id, role, mode });
    else dropped += 1;
  }
  return { edits, dropped };
}
