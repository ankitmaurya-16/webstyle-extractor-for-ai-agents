// Snapshot history in IndexedDB. Schema in docs/data-model.md.

import { openDB } from 'idb';

export const DB_NAME = 'webstyle';
export const DB_VERSION = 1;
export const STORE = 'snapshots';

let dbPromise = null;

function db() {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      // Bump DB_VERSION and add a branch here for each schema change.
      if (oldVersion < 1) {
        const store = database.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('byCapturedAt', 'capturedAt');
        store.createIndex('byHostname', 'hostname');
      }
    },
  });
  return dbPromise;
}

/** Test hook: forget the open connection so a fresh fake database can be used. */
export function resetConnection() {
  dbPromise = null;
}

export async function saveSnapshot(record) {
  await (await db()).put(STORE, record);
}

export async function getSnapshot(id) {
  return (await db()).get(STORE, id);
}

/** @returns {Promise<Array<{id, hostname, title, capturedAt, topColors}>>} newest first */
export async function listSnapshots() {
  const database = await db();
  const summaries = [];
  let cursor = await database
    .transaction(STORE)
    .store.index('byCapturedAt')
    .openCursor(null, 'prev');
  while (cursor) {
    summaries.push(toSummary(cursor.value));
    cursor = await cursor.continue();
  }
  return summaries;
}

export async function deleteSnapshot(id) {
  await (await db()).delete(STORE, id);
}

/** @returns {Promise<number>} how many were deleted */
export async function deleteAllSnapshots() {
  const database = await db();
  const tx = database.transaction(STORE, 'readwrite');
  const count = await tx.store.count();
  await tx.store.clear();
  await tx.done;
  return count;
}

export function toSummary(record) {
  const topColors = record.edited.colors
    .filter((c) => !c.excluded)
    .sort((a, b) => b.usageShare - a.usageShare)
    .slice(0, 5)
    .map((c) => c.hex);
  return {
    id: record.id,
    hostname: record.hostname,
    title: record.title,
    capturedAt: record.capturedAt,
    topColors,
  };
}

/** Builds the record saved after a completed extraction (AC-F8.1). */
export function makeRecord(raw, design, id) {
  return {
    id,
    schemaVersion: 1,
    url: raw.url,
    hostname: design.meta.hostname,
    title: raw.title,
    capturedAt: raw.capturedAt,
    raw,
    extracted: design,
    edited: structuredClone(design),
  };
}
