import { describe, expect, it } from 'vitest';
import { NAME_PATTERN, applyEdit, replay } from '../../../src/edit/apply-edit.js';
import { exportFile } from '../../../src/export/index.js';
import { analyzeFixture, analyzeRaw, loadRaw } from '../helpers.js';

const classic = () => analyzeFixture('classic');
const color = (d, id) => d.colors.find((c) => c.id === id);
const recipe = (d, id) => d.components.find((r) => r.id === id);
const styles = (d, id, mode = 'light') => recipe(d, id).byMode[mode].default;
const ok = (result) => {
  expect(result.ok, result.error).toBe(true);
  return result.design;
};
const BLUE = 'color:#2563eb';
const INK = 'color:#111827';

describe('applyEdit on a v2 design', () => {
  it('AC-F6.6 never mutates its input', () => {
    const d = classic();
    const before = JSON.stringify(d);
    applyEdit(d, { kind: 'rename', tokenId: INK, name: 'night' });
    applyEdit(d, { kind: 'exclude', tokenId: INK });
    applyEdit(d, { kind: 'merge', sourceId: 'color:#4b5563', targetId: 'color:#6b7280' });
    applyEdit(d, { kind: 'setRole', tokenId: INK, role: 'border', mode: 'light' });
    expect(JSON.stringify(d)).toBe(before);
  });

  it('AC-F6.1 renames with lowercase letters, digits and hyphens', () => {
    const next = ok(applyEdit(classic(), { kind: 'rename', tokenId: INK, name: 'night-2' }));
    expect(color(next, INK).name).toBe('night-2');
    // Translucent names keep their alpha suffix.
    expect(NAME_PATTERN.test('black/10')).toBe(true);
    const t = analyzeFixture('translucent');
    const renamed = ok(
      applyEdit(t, { kind: 'rename', tokenId: 'color:#000000@10', name: 'hairline/10' }),
    );
    expect(color(renamed, 'color:#000000@10').name).toBe('hairline/10');
  });

  it('AC-F6.1 rejects invalid names and changes nothing', () => {
    const d = classic();
    for (const name of [
      'Ink',
      '2ink',
      'ink_dark',
      '',
      'ink dark',
      '-ink',
      'ink/',
      'ink/1000',
      null,
    ]) {
      expect(applyEdit(d, { kind: 'rename', tokenId: INK, name }), String(name)).toEqual({
        ok: false,
        error: 'INVALID_NAME',
      });
    }
  });

  it('AC-F6.1 rejects a name taken in the same category but allows it in another', () => {
    const d = classic();
    expect(applyEdit(d, { kind: 'rename', tokenId: INK, name: 'white' })).toEqual({
      ok: false,
      error: 'NAME_TAKEN',
    });
    expect(applyEdit(d, { kind: 'rename', tokenId: 'text:16/24/400', name: 'white' }).ok).toBe(
      true,
    );
    // Renaming a token to its own name is fine.
    expect(applyEdit(d, { kind: 'rename', tokenId: INK, name: color(d, INK).name }).ok).toBe(true);
  });

  it('AC-F6.1 updates recipe references after a rename', () => {
    const next = ok(applyEdit(classic(), { kind: 'rename', tokenId: BLUE, name: 'action' }));
    expect(styles(next, 'component:button:primary')['background-color']).toEqual({
      ref: 'color.action',
      id: BLUE,
      raw: '#2563eb',
    });
    expect(styles(next, 'component:link:default').color.ref).toBe('color.action');
  });

  it('AC-F6.2 moves a role per theme so it always points to one token', () => {
    const d = classic();
    const next = ok(
      applyEdit(d, { kind: 'setRole', tokenId: 'color:#6b7280', role: 'text', mode: 'light' }),
    );
    expect(next.semantic.text).toEqual({ light: 'color:#6b7280' });
    const cleared = ok(applyEdit(next, { kind: 'clearRole', role: 'text', mode: 'light' }));
    expect(cleared.semantic.text).toBeUndefined();
    // A dark role leaves the light one alone.
    const dark = ok(
      applyEdit(d, { kind: 'setRole', tokenId: INK, role: 'background', mode: 'dark' }),
    );
    expect(dark.semantic.background).toEqual({ light: 'color:#ffffff', dark: INK });
    const lightOnly = ok(applyEdit(dark, { kind: 'clearRole', role: 'background', mode: 'dark' }));
    expect(lightOnly.semantic.background).toEqual({ light: 'color:#ffffff' });
  });

  it('AC-F6.2 rejects unknown roles, modes and non-color tokens', () => {
    const d = classic();
    const fail = { ok: false, error: 'NOT_FOUND' };
    expect(applyEdit(d, { kind: 'setRole', tokenId: INK, role: 'brand', mode: 'light' })).toEqual(
      fail,
    );
    expect(applyEdit(d, { kind: 'setRole', tokenId: INK, role: 'text', mode: 'sepia' })).toEqual(
      fail,
    );
    expect(
      applyEdit(d, { kind: 'setRole', tokenId: 'space:16', role: 'text', mode: 'light' }),
    ).toEqual(fail);
    expect(applyEdit(d, { kind: 'clearRole', role: 'brand', mode: 'light' })).toEqual(fail);
  });

  it('AC-F6.2 a translucent token can take a role', () => {
    const t = analyzeFixture('translucent');
    const next = ok(
      applyEdit(t, {
        kind: 'setRole',
        tokenId: 'color:#000000@50',
        role: 'surface',
        mode: 'light',
      }),
    );
    expect(next.semantic.surface).toEqual({ light: 'color:#000000@50' });
  });

  it('AC-F6.3 merge adds usage, records the hex, moves roles and removes the source', () => {
    const d = classic();
    const source = color(d, 'color:#d1d5db');
    const target = color(d, 'color:#e5e7eb');
    const next = ok(applyEdit(d, { kind: 'merge', sourceId: source.id, targetId: target.id }));
    expect(color(next, source.id)).toBeUndefined();
    const merged = color(next, target.id);
    expect(merged.mergedFrom).toContain('#d1d5db');
    expect(merged.usageShare).toBeCloseTo(source.usageShare + target.usageShare, 3);
    // The merged-away token held the text role: the target takes it over.
    const roles = ok(applyEdit(d, { kind: 'merge', sourceId: INK, targetId: 'color:#4b5563' }));
    expect(roles.semantic.text).toEqual({ light: 'color:#4b5563' });
  });

  it('AC-F6.3 redirects recipe references, translucent bases and gradient stops', () => {
    const next = ok(applyEdit(classic(), { kind: 'merge', sourceId: BLUE, targetId: INK }));
    expect(styles(next, 'component:button:primary')['background-color']).toMatchObject({
      ref: `color.${color(next, INK).name}`,
      id: INK,
    });
    const t = analyzeFixture('translucent');
    const based = ok(
      applyEdit(t, { kind: 'merge', sourceId: 'color:#111827', targetId: 'color:#2563eb' }),
    );
    expect(color(based, 'color:#111827@60').baseTokenId).toBe('color:#2563eb');
    const g = structuredClone(t);
    g.gradients = [
      { id: 'gradient:1', name: 'g', css: '', stops: [{ colorTokenId: 'color:#111827' }] },
    ];
    const stops = ok(
      applyEdit(g, { kind: 'merge', sourceId: 'color:#111827', targetId: 'color:#2563eb' }),
    );
    expect(stops.gradients[0].stops[0].colorTokenId).toBe('color:#2563eb');
  });

  it('rejects merging a token into itself, across categories or into nothing', () => {
    const d = classic();
    const id = 'color:#ffffff';
    expect(applyEdit(d, { kind: 'merge', sourceId: id, targetId: id })).toEqual({
      ok: false,
      error: 'SAME_TOKEN',
    });
    expect(applyEdit(d, { kind: 'merge', sourceId: id, targetId: 'radius:8' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(applyEdit(d, { kind: 'exclude', tokenId: 'nope' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(applyEdit(d, { kind: 'teleport' })).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('AC-F6.4 exclude hides a token from every export and include restores it', () => {
    const d = classic();
    const id = 'color:#d1d5db';
    const excluded = ok(applyEdit(d, { kind: 'exclude', tokenId: id }));
    expect(color(excluded, id).excluded).toBe(true);
    for (const format of ['css-vars', 'tailwind-v4', 'dtcg']) {
      expect(exportFile(format, excluded, '2.0.0'), format).not.toContain('gray-300');
    }
    const included = ok(applyEdit(excluded, { kind: 'include', tokenId: id }));
    expect(exportFile('css-vars', included, '2.0.0')).toContain('--color-gray-300: #d1d5db;');
  });

  it('AC-F6.5 excluding a color clears its roles in every theme; recipes fall back to raw values', () => {
    const d = analyzeFixture('dark-media');
    const shared = 'color:#111827'; // light text and dark surface
    const next = ok(applyEdit(d, { kind: 'exclude', tokenId: shared }));
    expect(next.semantic.text).toEqual({ dark: 'color:#e5e7eb' });
    expect(next.semantic.surface).toEqual({ light: 'color:#f3f4f6' });
    const c = ok(applyEdit(classic(), { kind: 'exclude', tokenId: BLUE }));
    expect(c.semantic.primary).toBeUndefined();
    const md = exportFile('design-md', c, '2.0.0');
    expect(md).toContain('#2563eb');
    expect(md).not.toMatch(/\| primary\s+\| brand/);
  });

  it('excludes and renames components', () => {
    const d = classic();
    const hidden = ok(applyEdit(d, { kind: 'exclude', tokenId: 'component:badge:info' }));
    expect(recipe(hidden, 'component:badge:info').excluded).toBe(true);
    const named = ok(
      applyEdit(d, {
        kind: 'renameComponent',
        componentId: 'component:button:primary',
        name: ' CTA ',
      }),
    );
    expect(recipe(named, 'component:button:primary').name).toBe('CTA');
    expect(
      applyEdit(d, { kind: 'renameComponent', componentId: 'component:button:primary', name: ' ' }),
    ).toEqual({
      ok: false,
      error: 'INVALID_NAME',
    });
    expect(
      applyEdit(d, { kind: 'renameComponent', componentId: 'component:x:y', name: 'X' }),
    ).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('useSiteName switches between the site and generated names and refuses a taken name', () => {
    const d = classic();
    const generated = ok(applyEdit(d, { kind: 'useSiteName', tokenId: BLUE, use: false }));
    expect(color(generated, BLUE)).toMatchObject({ name: 'blue-600', aliases: ['brand'] });
    expect(styles(generated, 'component:button:primary')['background-color'].ref).toBe(
      'color.blue-600',
    );
    const back = ok(applyEdit(generated, { kind: 'useSiteName', tokenId: BLUE, use: true }));
    expect(color(back, BLUE)).toMatchObject({ name: 'brand', aliases: ['blue-600'] });
    const taken = ok(applyEdit(generated, { kind: 'rename', tokenId: INK, name: 'brand' }));
    expect(applyEdit(taken, { kind: 'useSiteName', tokenId: BLUE, use: true })).toEqual({
      ok: false,
      error: 'NAME_TAKEN',
    });
  });
});

describe('edit log replay (v2 spec 6.3)', () => {
  const log = [
    { kind: 'rename', tokenId: BLUE, name: 'action' },
    { kind: 'setRole', tokenId: 'color:#e5e7eb', role: 'surface', mode: 'light' },
    { kind: 'clearRole', role: 'danger', mode: 'light' },
    { kind: 'exclude', tokenId: 'radius:9999' },
    { kind: 'exclude', tokenId: 'color:#d1d5db' },
    { kind: 'include', tokenId: 'color:#d1d5db' },
    { kind: 'merge', sourceId: 'color:#4b5563', targetId: 'color:#6b7280' },
    { kind: 'renameComponent', componentId: 'component:button:primary', name: 'Call to action' },
    { kind: 'useSiteName', tokenId: INK, use: false },
  ];

  it('replays every edit kind in order onto a fresh analysis', () => {
    const { design, staleEdits } = replay(classic(), log);
    expect(staleEdits).toBe(0);
    expect(color(design, BLUE).name).toBe('action');
    expect(design.semantic.surface).toEqual({ light: 'color:#e5e7eb' });
    expect(design.semantic.danger).toBeUndefined();
    expect(design.radii.find((r) => r.id === 'radius:9999').excluded).toBe(true);
    expect(color(design, 'color:#d1d5db').excluded).toBe(false);
    expect(color(design, 'color:#4b5563')).toBeUndefined();
    expect(color(design, 'color:#6b7280').mergedFrom).toContain('#4b5563');
    expect(recipe(design, 'component:button:primary').name).toBe('Call to action');
    expect(color(design, INK).name).toBe('gray-900');
    expect(styles(design, 'component:heading:h1').color.ref).toBe('color.gray-900');
    expect(styles(design, 'component:button:primary')['background-color'].ref).toBe('color.action');
  });

  it('gives the same result as applying the edits one by one, without touching the input', () => {
    const extracted = classic();
    const before = JSON.stringify(extracted);
    let stepwise = extracted;
    for (const edit of log) stepwise = ok(applyEdit(stepwise, edit));
    expect(replay(extracted, log).design).toEqual(stepwise);
    expect(JSON.stringify(extracted)).toBe(before);
  });

  it('re-applies the log after a re-run: ids are value-based, so the same tokens match', () => {
    const first = analyzeRaw(loadRaw('classic'));
    const second = analyzeRaw(loadRaw('classic'));
    expect(second.colors.map((c) => c.id)).toEqual(first.colors.map((c) => c.id));
    expect(replay(second, log).design).toEqual(replay(first, log).design);
  });

  it('skips and counts stale edits but keeps them in the log', () => {
    const edits = [
      { kind: 'rename', tokenId: 'color:#abcdef', name: 'gone' },
      ...log,
      { kind: 'exclude', tokenId: 'space:999' },
      { kind: 'merge', sourceId: 'color:#4b5563', targetId: 'color:#6b7280' }, // already merged
    ];
    const copy = structuredClone(edits);
    const { design, staleEdits } = replay(classic(), edits);
    expect(staleEdits).toBe(3);
    expect(edits).toEqual(copy);
    expect(color(design, BLUE).name).toBe('action');
  });

  it('applies a once-stale edit when a later analysis brings its token back', () => {
    const edit = { kind: 'rename', tokenId: 'color:#0000001a', name: 'unused' };
    const rename = { kind: 'rename', tokenId: 'color:#000000@10', name: 'hairline/10' };
    expect(replay(classic(), [rename]).staleEdits).toBe(1);
    const back = replay(analyzeFixture('translucent'), [rename, edit]);
    expect(back.staleEdits).toBe(1);
    expect(color(back.design, 'color:#000000@10').name).toBe('hairline/10');
  });

  it('an empty log (reset to extracted) gives the extracted design', () => {
    const extracted = classic();
    expect(replay(extracted, [])).toEqual({ design: extracted, staleEdits: 0 });
    expect(replay(extracted)).toEqual({ design: extracted, staleEdits: 0 });
  });
});
