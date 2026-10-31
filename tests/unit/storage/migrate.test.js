import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { replay } from '../../../src/edit/apply-edit.js';
import { deriveEdits, migrateRecord } from '../../../src/storage/migrate.js';

// A v1 SnapshotRecord of the classic fixture, made with the v1 code, with one edit of every v1
// kind: renames (c11 blue to brand, s4 16px to gutter, t3 16px text to body), exclusions (c3
// #d1d5db, r4 9999px), a merge (c5 #4b5563 into c4 #6b7280), setRole surface on c2 #e5e7eb and
// clearRole danger.
const v1Record = () =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'tests/fixtures/migration/v1-classic-edited.json'), 'utf8'),
  );

describe('migration from v1 (v2 spec 6.4)', () => {
  it('step 1 wraps the v1 raw in one computed capture with v2 fields filled', () => {
    const v1 = v1Record();
    const { record } = migrateRecord(v1);
    expect(record.captures).toHaveLength(1);
    const [capture] = record.captures;
    expect(capture).toMatchObject({
      id: 'v1-classic-1',
      pageUrl: v1.url,
      mode: 'light',
      viewportWidth: v1.raw.viewport.width,
      method: 'computed',
      capturedAt: v1.capturedAt,
    });
    expect(capture.raw.gradients).toEqual([]);
    expect(capture.raw.variableDefs.length).toBe(Object.keys(v1.raw.cssVariables).length);
    for (const c of capture.raw.colors) {
      expect(c.effectiveHex, c.value).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.backdropHex).toBe(c.effectiveHex);
    }
  });

  it('step 1 takes the mode from the v1 color scheme', () => {
    const v1 = v1Record();
    v1.raw.colorScheme = 'dark';
    expect(migrateRecord(v1).record.captures[0].mode).toBe('dark');
  });

  it('step 2 analyzes the capture with the v2 engine', () => {
    const { record } = migrateRecord(v1Record());
    expect(record.extracted.schemaVersion).toBe(2);
    expect(record.extracted).toEqual(analyze(record.captures, { useSiteVariableNames: true }));
    expect(record.extracted.colors.every((c) => c.id.startsWith('color:'))).toBe(true);
  });

  it('step 3 derives the edit log by value from the v1 extracted and edited copies', () => {
    const { record, droppedEdits } = migrateRecord(v1Record());
    expect(droppedEdits).toBe(0);
    expect(record.staleEdits).toBe(0);
    expect(record.edits).toEqual(
      expect.arrayContaining([
        { kind: 'rename', tokenId: 'color:#2563eb', name: 'brand' },
        { kind: 'rename', tokenId: 'space:16', name: 'gutter' },
        { kind: 'rename', tokenId: 'text:16/24/400', name: 'body' },
        { kind: 'exclude', tokenId: 'color:#d1d5db' },
        { kind: 'exclude', tokenId: 'radius:9999' },
        { kind: 'merge', sourceId: 'color:#4b5563', targetId: 'color:#6b7280' },
        { kind: 'setRole', tokenId: 'color:#e5e7eb', role: 'surface', mode: 'light' },
        { kind: 'clearRole', role: 'danger', mode: 'light' },
      ]),
    );
    expect(record.edits).toHaveLength(8);
  });

  it('step 3 replays the derived log into the edited copy', () => {
    const { record } = migrateRecord(v1Record());
    expect(record.edited).toEqual(replay(record.extracted, record.edits).design);
    const color = (id) => record.edited.colors.find((c) => c.id === id);
    expect(color('color:#2563eb').name).toBe('brand');
    expect(color('color:#d1d5db').excluded).toBe(true);
    expect(color('color:#4b5563')).toBeUndefined();
    expect(color('color:#6b7280').mergedFrom).toContain('#4b5563');
    expect(record.edited.semantic.surface).toEqual({ light: 'color:#e5e7eb' });
    expect(record.edited.semantic.danger).toBeUndefined();
    expect(record.edited.spacing.tokens.find((t) => t.id === 'space:16').name).toBe('gutter');
  });

  it('step 3 drops and counts edits that cannot be matched by value', () => {
    const v1 = v1Record();
    // A v1 token renamed by the user whose value the v2 analysis does not find.
    const ghost = {
      ...v1.extracted.colors[0],
      id: 'c99',
      hex: '#abcdef',
      name: 'gray-500',
      roles: [],
    };
    v1.extracted.colors.push(ghost);
    v1.edited.colors.push({ ...ghost, name: 'ghost' });
    // A role moved to a token v2 does not have.
    v1.edited.colors.find((c) => c.roles.includes('text')).roles = [];
    v1.edited.colors.at(-1).roles = ['text'];
    const { record, droppedEdits } = migrateRecord(v1);
    expect(droppedEdits).toBe(2);
    expect(record.edits.some((e) => e.name === 'ghost')).toBe(false);
  });

  it('step 3 an unedited v1 record migrates with an empty log', () => {
    const v1 = v1Record();
    v1.edited = structuredClone(v1.extracted);
    const { record, droppedEdits } = migrateRecord(v1);
    expect(record.edits).toEqual([]);
    expect(droppedEdits).toBe(0);
    expect(record.edited).toEqual(record.extracted);
  });

  it('step 4 sets the v2 record fields', () => {
    const v1 = v1Record();
    const { record } = migrateRecord(v1);
    expect(record).toMatchObject({
      id: v1.id,
      schemaVersion: 2,
      kind: 'page',
      hostname: v1.hostname,
      title: v1.title,
      capturedAt: v1.capturedAt,
      updatedAt: v1.capturedAt,
      pages: [v1.url],
      mapping: null,
      screenshotIds: [],
      migratedFromV1: true,
    });
  });

  it('deriveEdits records merges only for colors and matches roles across ids', () => {
    const v1 = v1Record();
    const { extracted } = migrateRecord(v1).record;
    const same = deriveEdits(v1.extracted, structuredClone(v1.extracted), extracted, 'light');
    expect(same).toEqual({ edits: [], dropped: 0 });
    const edited = structuredClone(v1.extracted);
    edited.spacing.tokens = edited.spacing.tokens.filter((t) => t.px !== 4);
    // A spacing token missing from v1's edited copy is no merge v2 can express.
    expect(deriveEdits(v1.extracted, edited, extracted, 'light')).toEqual({
      edits: [],
      dropped: 1,
    });
  });
});
