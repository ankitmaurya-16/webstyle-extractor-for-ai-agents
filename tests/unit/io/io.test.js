import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FORMAT,
  ImportError,
  MAX_IMPORT_BYTES,
  VERSION,
  exportFileName,
  exportSnapshots,
  importSnapshots,
} from '../../../src/io/index.js';
import { makeRecord } from '../../../src/storage/snapshots.js';
import { analyzeFixture, capturesFor, loadRaw } from '../helpers.js';

const fixture = (name) =>
  readFileSync(resolve(process.cwd(), `tests/fixtures/snapshots/${name}`), 'utf8');
const NOW = Date.UTC(2026, 9, 25, 12);

function record(id, name = 'classic') {
  const captures = capturesFor(loadRaw(name));
  const design = analyzeFixture(name);
  return makeRecord({ id, captures, extracted: design, edited: structuredClone(design) });
}

function importError(text, options) {
  try {
    importSnapshots(text, options);
  } catch (error) {
    return error;
  }
  throw new Error('expected the import to fail');
}

describe('snapshot export (F40)', () => {
  it('AC-F40.1 single, selected and full exports use the documented names and structure', () => {
    const a = record('a');
    const b = record('b', 'dark');
    expect(exportFileName([a], NOW)).toBe('127.0.0.1-2026-10-25.webstyle.json');
    expect(exportFileName([a, b], NOW)).toBe('webstyle-history-2026-10-25.webstyle.json');
    const doc = JSON.parse(exportSnapshots([a, b], { now: NOW }));
    expect(Object.keys(doc)).toEqual(['format', 'version', 'exportedAt', 'snapshots']);
    expect(doc).toMatchObject({ format: 'webstyle-snapshots', version: 2, exportedAt: NOW });
    expect([FORMAT, VERSION]).toEqual(['webstyle-snapshots', 2]);
    expect(doc.snapshots.map((s) => s.id)).toEqual(['a', 'b']);
    expect(doc.snapshots[0]).toEqual(JSON.parse(JSON.stringify(a)));
  });

  it('AC-F40.2 project links are never exported', () => {
    const linked = {
      ...record('a'),
      projectId: 'p1',
      project: { id: 'p1', name: 'site', handle: {} },
    };
    const text = exportSnapshots([linked], { now: NOW });
    const doc = JSON.parse(text);
    expect(doc.snapshots[0].projectId).toBeUndefined();
    expect(doc.snapshots[0].project).toBeUndefined();
    expect(text).not.toContain('"handle"');
  });

  it('AC-F40.2 AC-F36.8 screenshots are included only when chosen', () => {
    const a = record('a');
    expect(JSON.parse(exportSnapshots([a], { now: NOW })).screenshots).toBeUndefined();
    expect(
      JSON.parse(exportSnapshots([a], { now: NOW, screenshots: [] })).screenshots,
    ).toBeUndefined();
    const shot = {
      snapshotId: 'a',
      id: 's1',
      recipeId: 'component:button:primary',
      mode: 'light',
      base64: 'data:image/png;base64,iVBORw0KGgo=',
    };
    const doc = JSON.parse(exportSnapshots([a], { now: NOW, screenshots: [shot] }));
    expect(doc.screenshots).toEqual([shot]);
  });
});

describe('snapshot import (F40)', () => {
  it('imports what it exports', () => {
    const a = record('a');
    const { snapshots, screenshots, migrated, copies } = importSnapshots(
      exportSnapshots([a], { now: NOW }),
    );
    expect(snapshots).toEqual([JSON.parse(JSON.stringify(a))]);
    expect({ screenshots, migrated, copies }).toEqual({ screenshots: [], migrated: 0, copies: 0 });
  });

  it('AC-F40.3 imports the valid v2 fixture', () => {
    const { snapshots } = importSnapshots(fixture('v2-export.webstyle.json'));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      id: 'v2-cross-origin',
      schemaVersion: 2,
      kind: 'page',
      migratedFromV1: false,
    });
    expect(snapshots[0].edited.colors.length).toBeGreaterThan(0);
  });

  it('AC-F40.3 validates with zod and raises IMPORT_INVALID with the first problem', () => {
    const invalid = importError(fixture('invalid.webstyle.json'));
    expect(invalid).toBeInstanceOf(ImportError);
    expect(invalid.code).toBe('IMPORT_INVALID');
    expect(invalid.problem).toMatch(/^snapshots\.0\.captures: /);
    const notJson = importError('{ "format": ');
    expect(notJson).toMatchObject({
      code: 'IMPORT_INVALID',
      problem: 'the file is not valid JSON',
    });
    const wrongFormat = importError(
      JSON.stringify({ format: 'something-else', version: 2, exportedAt: 1, snapshots: [] }),
    );
    expect(wrongFormat.code).toBe('IMPORT_INVALID');
    expect(wrongFormat.problem).toMatch(/^format: /);
    const noSnapshots = importError(JSON.stringify({ format: FORMAT, version: 2, exportedAt: 1 }));
    expect(noSnapshots.problem).toMatch(/^snapshots: /);
    const badRecord = JSON.parse(exportSnapshots([record('a')], { now: NOW }));
    badRecord.snapshots[0].kind = 'poster';
    expect(importError(JSON.stringify(badRecord)).problem).toMatch(/^snapshots\.0\.kind: /);
  });

  it('AC-F40.4 a higher version raises IMPORT_TOO_NEW', () => {
    expect(importError(fixture('too-new.webstyle.json'))).toMatchObject({ code: 'IMPORT_TOO_NEW' });
    const newerRecord = JSON.parse(exportSnapshots([record('a')], { now: NOW }));
    newerRecord.snapshots[0].schemaVersion = 3;
    expect(importError(JSON.stringify(newerRecord))).toMatchObject({ code: 'IMPORT_TOO_NEW' });
  });

  it('AC-F40.5 version 1 records are migrated on import, with their edits carried over', () => {
    const { snapshots, migrated } = importSnapshots(fixture('v1-record.webstyle.json'));
    expect(migrated).toBe(1);
    const [s] = snapshots;
    expect(s).toMatchObject({
      id: 'v1-cross-origin',
      schemaVersion: 2,
      kind: 'page',
      migratedFromV1: true,
      mapping: null,
      screenshotIds: [],
    });
    expect(s.captures).toHaveLength(1);
    expect(s.edits).toContainEqual(expect.objectContaining({ kind: 'rename', name: 'brand-ink' }));
    expect(s.edited.colors.some((c) => c.name === 'brand-ink')).toBe(true);
    expect(s.extracted.colors.some((c) => c.name === 'brand-ink')).toBe(false);
  });

  it('AC-F40.6 id conflicts become copies with new ids and "(imported)" titles', () => {
    let n = 0;
    const newId = () => `new-${(n += 1)}`;
    const text = fixture('v2-export.webstyle.json');
    const doc = JSON.parse(text);
    doc.screenshots = [
      {
        snapshotId: 'v2-cross-origin',
        id: 's1',
        recipeId: 'component:button:primary',
        mode: 'light',
        base64: 'AAAA',
      },
    ];
    const result = importSnapshots(JSON.stringify(doc), {
      existingIds: new Set(['v2-cross-origin']),
      newId,
    });
    expect(result.copies).toBe(1);
    expect(result.snapshots[0].id).toBe('new-1');
    expect(result.snapshots[0].title).toBe(`${doc.snapshots[0].title} (imported)`);
    expect(result.screenshots[0].snapshotId).toBe('new-1');
    // Two records with one id in the same file: the second becomes a copy.
    const twice = {
      ...doc,
      screenshots: undefined,
      snapshots: [doc.snapshots[0], doc.snapshots[0]],
    };
    const pair = importSnapshots(JSON.stringify(twice), { newId });
    expect(pair.snapshots.map((s) => s.id)).toEqual(['v2-cross-origin', 'new-2']);
    // Without a conflict, ids are kept.
    expect(importSnapshots(text, { existingIds: new Set(['other']) }).snapshots[0].id).toBe(
      'v2-cross-origin',
    );
  });

  it('AC-F40.7 files over 50 MB are refused with a message', () => {
    expect(MAX_IMPORT_BYTES).toBe(50 * 1024 * 1024);
    const error = importError(' '.repeat(MAX_IMPORT_BYTES + 1));
    expect(error).toMatchObject({
      code: 'IMPORT_INVALID',
      problem: 'the file is larger than 50 MB',
    });
  });
});
