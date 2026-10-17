// Snapshot import and export as JSON (F40), validated with zod. Pure.

import { z } from 'zod';
import { migrateRecord } from '../storage/migrate.js';

export const FORMAT = 'webstyle-snapshots';
export const VERSION = 2;
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

export class ImportError extends Error {
  constructor(code, problem) {
    super(problem);
    this.code = code;
    this.problem = problem;
  }
}

const designSchema = z
  .object({
    schemaVersion: z.literal(2),
    meta: z.object({ sourceUrl: z.string(), hostname: z.string(), capturedAt: z.number() }).passthrough(),
    colors: z.array(z.object({ id: z.string(), name: z.string(), hex: z.string() }).passthrough()),
    components: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .passthrough();

const recordV2 = z
  .object({
    id: z.string().min(1),
    schemaVersion: z.literal(2),
    kind: z.enum(['page', 'site', 'component']),
    hostname: z.string(),
    title: z.string(),
    capturedAt: z.number(),
    captures: z.array(z.object({ id: z.string(), pageUrl: z.string(), mode: z.enum(['light', 'dark']), raw: z.object({}).passthrough() }).passthrough()).min(1),
    extracted: designSchema,
    edited: designSchema,
    edits: z.array(z.object({ kind: z.string() }).passthrough()),
  })
  .passthrough();

const recordV1 = z
  .object({ id: z.string(), schemaVersion: z.literal(1), raw: z.object({}).passthrough(), extracted: z.object({}).passthrough(), edited: z.object({}).passthrough() })
  .passthrough();

const screenshotSchema = z.object({ snapshotId: z.string(), id: z.string(), recipeId: z.string(), mode: z.string(), base64: z.string() }).passthrough();

const fileSchema = z.object({
  format: z.literal(FORMAT),
  version: z.number().int(),
  exportedAt: z.number(),
  snapshots: z.array(z.object({ schemaVersion: z.number() }).passthrough()),
  screenshots: z.array(screenshotSchema).optional(),
});

/** File name for an export (AC-F40.1). */
export function exportFileName(records, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (records.length === 1) return `${records[0].hostname}-${day}.webstyle.json`;
  return `webstyle-history-${day}.webstyle.json`;
}

/**
 * Serializes snapshots. Project links are never included; screenshots only when given
 * (AC-F40.2).
 * @param {object[]} records
 * @param {{screenshots?: Array<{snapshotId: string, id: string, recipeId: string, mode: string, base64: string}>, now?: number}} [options]
 */
export function exportSnapshots(records, { screenshots, now = Date.now() } = {}) {
  const doc = {
    format: FORMAT,
    version: VERSION,
    exportedAt: now,
    snapshots: records.map((r) => {
      const { projectId: _p, project: _q, ...rest } = r;
      return rest;
    }),
  };
  if (screenshots?.length) doc.screenshots = screenshots;
  return `${JSON.stringify(doc)}\n`;
}

const firstProblem = (error) => {
  const issue = error.issues?.[0];
  if (!issue) return 'unknown problem';
  return `${issue.path.length ? issue.path.join('.') : 'file'}: ${issue.message}`;
};

/**
 * Validates and upgrades an import (AC-F40.3 to AC-F40.7). Records whose id already exists
 * become copies with new ids.
 * @param {string} text
 * @param {{existingIds?: Set<string>, newId?: () => string}} [options]
 * @returns {{snapshots: object[], screenshots: object[], migrated: number, copies: number}}
 */
export function importSnapshots(text, { existingIds = new Set(), newId = () => crypto.randomUUID() } = {}) {
  const size = typeof text === 'string' ? new TextEncoder().encode(text).length : 0;
  if (size > MAX_IMPORT_BYTES) throw new ImportError('IMPORT_INVALID', 'the file is larger than 50 MB');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('IMPORT_INVALID', 'the file is not valid JSON');
  }
  if (json && typeof json === 'object' && typeof json.version === 'number' && json.version > VERSION) {
    throw new ImportError('IMPORT_TOO_NEW', 'made with a newer version');
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) throw new ImportError('IMPORT_INVALID', firstProblem(parsed.error));
  const snapshots = [];
  let migrated = 0;
  let copies = 0;
  const idMap = new Map();
  for (const [i, record] of parsed.data.snapshots.entries()) {
    if (record.schemaVersion > VERSION) throw new ImportError('IMPORT_TOO_NEW', 'made with a newer version');
    let upgraded;
    if (record.schemaVersion === 1) {
      const v1 = recordV1.safeParse(record);
      if (!v1.success) throw new ImportError('IMPORT_INVALID', `snapshots.${i}.${firstProblem(v1.error)}`);
      upgraded = migrateRecord(v1.data).record;
      migrated += 1;
    } else {
      const v2 = recordV2.safeParse(record);
      if (!v2.success) throw new ImportError('IMPORT_INVALID', `snapshots.${i}.${firstProblem(v2.error)}`);
      upgraded = v2.data;
    }
    if (existingIds.has(upgraded.id) || snapshots.some((s) => s.id === upgraded.id)) {
      const id = newId();
      idMap.set(upgraded.id, id);
      upgraded = { ...upgraded, id, title: `${upgraded.title} (imported)` };
      copies += 1;
    }
    snapshots.push(upgraded);
  }
  const screenshots = (parsed.data.screenshots ?? []).map((s) => ({ ...s, snapshotId: idMap.get(s.snapshotId) ?? s.snapshotId }));
  return { snapshots, screenshots, migrated, copies };
}
