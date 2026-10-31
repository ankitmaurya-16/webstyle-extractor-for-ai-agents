import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import {
  DB_VERSION,
  deleteAllSnapshots,
  deleteProject,
  deleteSnapshot,
  getScreenshots,
  getSnapshot,
  listProjects,
  listSnapshots,
  makeRecord,
  resetConnection,
  saveProject,
  saveScreenshots,
  saveSnapshot,
  takeMigrationNotice,
  toSummary,
} from '../../../src/storage/snapshots.js';
import { analyze } from '../../../src/analyze/index.js';
import { captureOf, loadRaw } from '../helpers.js';
import { seedV1Database, v1Record } from '../sidepanel/fakes.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
});

function record(id, capturedAt, name = 'classic', extra = {}) {
  const raw = { ...loadRaw(name), capturedAt };
  const captures = [captureOf(raw)];
  const extracted = analyze(captures);
  return makeRecord({ id, captures, extracted, edited: structuredClone(extracted), ...extra });
}

const shot = (snapshotId, id) => ({
  snapshotId,
  id,
  recipeId: id.split(':').slice(0, -1).join(':'),
  mode: 'light',
  state: 'default',
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  width: 10,
  height: 10,
});

describe('snapshot storage v2', () => {
  it('AC-F8.1 saves a SnapshotRecordV2 with captures, extracted, edits and edited', async () => {
    await saveSnapshot(record('a', 1000));
    const stored = await getSnapshot('a');
    expect(stored).toMatchObject({
      id: 'a',
      schemaVersion: 2,
      kind: 'page',
      hostname: '127.0.0.1',
      capturedAt: 1000,
      pages: ['http://127.0.0.1:4173/classic.html'],
      edits: [],
      staleEdits: 0,
      mapping: null,
      screenshotIds: [],
      migratedFromV1: false,
    });
    expect(stored.captures[0].raw.elementsSampled).toBeGreaterThan(0);
    expect(stored.extracted).toEqual(stored.edited);
  });

  it('opens webstyle version 2 with the v2 stores and indexes', async () => {
    await listSnapshots();
    resetConnection();
    const db = await openDB('webstyle', DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['projects', 'screenshots', 'snapshots']);
    const tx = db.transaction(['snapshots', 'screenshots', 'projects']);
    expect([...tx.objectStore('snapshots').indexNames].sort()).toEqual([
      'byCapturedAt',
      'byHostname',
      'byUpdatedAt',
    ]);
    expect(tx.objectStore('screenshots').keyPath).toEqual(['snapshotId', 'id']);
    expect(tx.objectStore('projects').keyPath).toBe('id');
    db.close();
  });

  it('AC-F8.2 lists summaries newest first with kind, pages, modes and top colors', async () => {
    await saveSnapshot(record('old', 1000));
    await saveSnapshot(record('new', 3000, 'dark'));
    await saveSnapshot(record('mid', 2000, 'utility'));
    const list = await listSnapshots();
    expect(list.map((s) => s.id)).toEqual(['new', 'mid', 'old']);
    expect(Object.keys(list[0]).sort()).toEqual(
      [
        'capturedAt',
        'hostname',
        'id',
        'kind',
        'modes',
        'pages',
        'title',
        'topColors',
        'updatedAt',
      ].sort(),
    );
    expect(list[0]).toMatchObject({ kind: 'page', pages: 1, modes: ['dark'] });
    expect(list[0].topColors.length).toBeGreaterThan(0);
    expect(list[0].topColors.length).toBeLessThanOrEqual(5);
  });

  it('makeRecord keeps the title, capture time, mapping and screenshot ids of the previous record', () => {
    const previous = {
      ...record('a', 1000),
      title: 'Renamed',
      mapping: { sourceName: 'x' },
      screenshotIds: ['s'],
    };
    const next = record('a', 5000, 'classic', { previous, kind: 'site' });
    expect(next).toMatchObject({
      title: 'Renamed',
      capturedAt: 1000,
      kind: 'site',
      mapping: { sourceName: 'x' },
      screenshotIds: ['s'],
    });
    expect(next.updatedAt).toBeGreaterThanOrEqual(previous.updatedAt);
  });

  it('makeRecord lists each page once and leaves width captures out of the page list', () => {
    const raw = loadRaw('classic');
    const captures = [
      captureOf(raw),
      captureOf(raw, { id: 'w', kind: 'width', viewportWidth: 375 }),
      captureOf({ ...raw, url: 'http://127.0.0.1:4173/about.html' }, { id: 'b' }),
    ];
    const extracted = analyze(captures);
    const r = makeRecord({ id: 'x', kind: 'site', captures, extracted, edited: extracted });
    expect(r.pages).toEqual([
      'http://127.0.0.1:4173/classic.html',
      'http://127.0.0.1:4173/about.html',
    ]);
    expect(toSummary(r).pages).toBe(2);
  });

  it('AC-F8.4 deletes one snapshot', async () => {
    await saveSnapshot(record('a', 1000));
    await saveSnapshot(record('b', 2000));
    await deleteSnapshot('a');
    expect(await getSnapshot('a')).toBeUndefined();
    expect((await listSnapshots()).map((s) => s.id)).toEqual(['b']);
  });

  it('AC-F36.4 screenshots are stored per snapshot and deleted with their snapshot', async () => {
    await saveSnapshot(record('a', 1000));
    await saveSnapshot(record('b', 2000));
    await saveScreenshots([
      shot('a', 'button:primary:light'),
      shot('a', 'button:primary:dark'),
      shot('b', 'input:default:light'),
    ]);
    expect((await getScreenshots('a')).map((s) => s.id).sort()).toEqual([
      'button:primary:dark',
      'button:primary:light',
    ]);
    const [row] = await getScreenshots('b');
    expect(row).toMatchObject({ snapshotId: 'b', recipeId: 'input:default', width: 10 });
    expect(row.blob).toBeInstanceOf(Blob);
    await deleteSnapshot('a');
    expect(await getScreenshots('a')).toEqual([]);
    expect(await getScreenshots('b')).toHaveLength(1);
  });

  it('AC-F8.5 deletes all snapshots and their screenshots, keeping projects', async () => {
    await saveSnapshot(record('a', 1000));
    await saveSnapshot(record('b', 2000));
    await saveScreenshots([shot('a', 'x:light')]);
    await saveProject({ id: 'p', name: 'app', handle: null, fileMap: {}, lastWrittenAt: null });
    await expect(deleteAllSnapshots()).resolves.toBe(2);
    expect(await listSnapshots()).toEqual([]);
    expect(await getScreenshots('a')).toEqual([]);
    expect(await listProjects()).toHaveLength(1);
  });

  it('AC-F37.1 projects are saved, renamed and removed in their own store', async () => {
    const project = {
      id: 'p1',
      name: 'my-app',
      handle: { kind: 'directory', name: 'my-app' },
      fileMap: { 'design-md': 'DESIGN.md' },
      lastWrittenAt: null,
    };
    await saveProject(project);
    await saveProject({ id: 'p2', name: 'other', handle: null, fileMap: {}, lastWrittenAt: 5 });
    await saveProject({ ...project, name: 'renamed' });
    expect((await listProjects()).map((p) => [p.id, p.name])).toEqual([
      ['p1', 'renamed'],
      ['p2', 'other'],
    ]);
    await deleteProject('p1');
    expect((await listProjects()).map((p) => p.id)).toEqual(['p2']);
  });

  it('survives a connection reset', async () => {
    await saveSnapshot(record('a', 1000));
    resetConnection();
    expect((await getSnapshot('a')).id).toBe('a');
  });
});

describe('migration from v1 (v2 spec 6.4)', () => {
  it('upgrades v1 records in the upgrade transaction and returns the notice once', async () => {
    await seedV1Database([v1Record('a'), v1Record('b', { capturedAt: Date.UTC(2026, 5, 2) })]);
    const notice = await takeMigrationNotice();
    expect(notice).toEqual({ snapshots: 2, droppedEdits: 2 });
    await expect(takeMigrationNotice()).resolves.toBeNull();
    const a = await getSnapshot('a');
    expect(a).toMatchObject({
      schemaVersion: 2,
      kind: 'page',
      pages: ['https://old.example.com/'],
      updatedAt: a.capturedAt,
      mapping: null,
      screenshotIds: [],
      migratedFromV1: true,
    });
    expect(a.captures).toHaveLength(1);
    expect(a.captures[0]).toMatchObject({
      method: 'computed',
      kind: 'base',
      mode: 'light',
      viewportWidth: 1280,
    });
    expect(a.raw).toBeUndefined();
    expect(a.edits).toContainEqual({ kind: 'rename', tokenId: 'color:#2563eb', name: 'brand' });
    expect(a.edited.colors.find((c) => c.id === 'color:#2563eb').name).toBe('brand');
    expect((await listSnapshots()).map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('gives no notice for a fresh install', async () => {
    await expect(takeMigrationNotice()).resolves.toBeNull();
  });

  it('gives no notice when the v1 database was empty', async () => {
    await seedV1Database([]);
    await expect(takeMigrationNotice()).resolves.toBeNull();
    expect(await listSnapshots()).toEqual([]);
  });
});
