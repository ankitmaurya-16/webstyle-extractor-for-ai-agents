// Snapshot history in IndexedDB: snapshots, screenshots and linked projects (v2 spec 6.2).

import { openDB } from 'idb';
import { migrateRecord } from './migrate.js';

export const DB_NAME = 'webstyle';
export const DB_VERSION = 2;
export const STORE = 'snapshots';
export const SCREENSHOTS = 'screenshots';
export const PROJECTS = 'projects';

let dbPromise = null;
let migration = null;

function db() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('byCapturedAt', 'capturedAt');
        store.createIndex('byHostname', 'hostname');
      }
      if (oldVersion < 2) {
        const store = tx.objectStore(STORE);
        if (!store.indexNames.contains('byUpdatedAt')) store.createIndex('byUpdatedAt', 'updatedAt');
        database.createObjectStore(SCREENSHOTS, { keyPath: ['snapshotId', 'id'] }).createIndex('bySnapshot', 'snapshotId');
        database.createObjectStore(PROJECTS, { keyPath: 'id' });
        if (oldVersion === 1) migrateAll(store);
      }
    },
  });
  return dbPromise;
}

/** Migrates every v1 record inside the upgrade transaction (v2 spec 6.4). */
function migrateAll(store) {
  migration = { snapshots: 0, droppedEdits: 0 };
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const value = cursor.value;
    if (value.schemaVersion === 1) {
      try {
        const { record, droppedEdits } = migrateRecord(value);
        cursor.update(record);
        migration.snapshots += 1;
        migration.droppedEdits += droppedEdits;
      } catch {
        // A record that cannot be analyzed is left as is rather than lost.
      }
    }
    cursor.continue();
  };
}

/** The one-time migration result, returned once: { snapshots, droppedEdits } or null. */
export async function takeMigrationNotice() {
  await db();
  const notice = migration && migration.snapshots > 0 ? migration : null;
  migration = null;
  return notice;
}

/** Test hook: forget the open connection so a fresh fake database can be used. */
export function resetConnection() {
  dbPromise = null;
  migration = null;
}

export async function saveSnapshot(record) {
  await (await db()).put(STORE, record);
}

export async function getSnapshot(id) {
  return (await db()).get(STORE, id);
}

/** @returns {Promise<object[]>} SnapshotSummaryV2 list, newest first */
export async function listSnapshots() {
  const database = await db();
  const summaries = [];
  let cursor = await database.transaction(STORE).store.index('byCapturedAt').openCursor(null, 'prev');
  while (cursor) {
    summaries.push(toSummary(cursor.value));
    cursor = await cursor.continue();
  }
  return summaries;
}

export async function deleteSnapshot(id) {
  const database = await db();
  const tx = database.transaction([STORE, SCREENSHOTS], 'readwrite');
  await tx.objectStore(STORE).delete(id);
  const index = tx.objectStore(SCREENSHOTS).index('bySnapshot');
  let cursor = await index.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** @returns {Promise<number>} how many were deleted */
export async function deleteAllSnapshots() {
  const database = await db();
  const tx = database.transaction([STORE, SCREENSHOTS], 'readwrite');
  const count = await tx.objectStore(STORE).count();
  await tx.objectStore(STORE).clear();
  await tx.objectStore(SCREENSHOTS).clear();
  await tx.done;
  return count;
}

// ---- Screenshots (F36) ----

export async function saveScreenshots(items) {
  const database = await db();
  const tx = database.transaction(SCREENSHOTS, 'readwrite');
  for (const item of items) await tx.store.put(item);
  await tx.done;
}

export async function getScreenshots(snapshotId) {
  return (await db()).getAllFromIndex(SCREENSHOTS, 'bySnapshot', IDBKeyRange.only(snapshotId));
}

// ---- Projects (F37) ----

export async function listProjects() {
  return (await db()).getAll(PROJECTS);
}

export async function saveProject(project) {
  await (await db()).put(PROJECTS, project);
}

export async function deleteProject(id) {
  await (await db()).delete(PROJECTS, id);
}

export function toSummary(record) {
  const design = record.edited;
  const topColors = (design.colors ?? [])
    .filter((c) => !c.excluded && c.alpha >= 1)
    .sort((a, b) => b.usageShare - a.usageShare)
    .slice(0, 5)
    .map((c) => c.hex);
  return {
    id: record.id,
    hostname: record.hostname,
    title: record.title,
    capturedAt: record.capturedAt,
    updatedAt: record.updatedAt ?? record.capturedAt,
    kind: record.kind ?? 'page',
    pages: record.pages?.length ?? 1,
    modes: design.meta?.modes ?? [design.meta?.colorScheme ?? 'light'],
    topColors,
  };
}

/**
 * Builds a SnapshotRecordV2 after an analysis (AC-F8.1).
 * @param {{id: string, kind?: string, captures: object[], extracted: object, edited: object,
 *   edits?: object[], staleEdits?: number, previous?: object}} input
 */
export function makeRecord({ id, kind = 'page', captures, extracted, edited, edits = [], staleEdits = 0, previous }) {
  const first = captures[0];
  const now = Date.now();
  return {
    id,
    schemaVersion: 2,
    kind,
    url: first.pageUrl,
    hostname: extracted.meta.hostname,
    title: previous?.title ?? first.raw.title,
    capturedAt: previous?.capturedAt ?? first.capturedAt,
    updatedAt: now,
    pages: [...new Set(captures.filter((c) => c.kind !== 'width').map((c) => c.pageUrl))],
    captures,
    extracted,
    edits,
    edited,
    staleEdits,
    mapping: previous?.mapping ?? null,
    screenshotIds: previous?.screenshotIds ?? [],
    migratedFromV1: false,
  };
}
