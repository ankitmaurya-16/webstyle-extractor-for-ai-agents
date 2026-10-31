// Write straight to a linked project folder (F37) through the File System Access API. Files are
// replaced except AGENTS.md and CLAUDE.md, which get the marked-block merge; nothing is deleted.

import { mergeMarkedBlock } from '../export/agents.js';
import { FILE_MAP, isValidRelativePath } from '../export/files.js';

const MARKED = new Set(['agents-md', 'claude-md']);

/** The default file map for a new project (v2 spec 9.2). */
export function defaultFileMap() {
  const map = {};
  for (const [format, paths] of Object.entries(FILE_MAP)) map[format] = paths[0];
  map.screenshots = 'design/screenshots/';
  return map;
}

/** Problems in a file map: paths that are not relative or contain `..` (AC-F37.2). */
export function fileMapErrors(fileMap) {
  return Object.entries(fileMap)
    .filter(([, path]) => !isValidRelativePath(path))
    .map(([format]) => format);
}

/**
 * Re-targets rendered files to a project's file map. A format's first file takes the mapped
 * path; extra files (tokens.dark.json, Figma modes) keep their names next to it.
 */
export function mapFiles(files, fileMap) {
  return files.map((f) => {
    const format = Object.keys(FILE_MAP).find((k) => FILE_MAP[k].includes(f.path));
    if (!format) {
      if (f.path.startsWith('design/screenshots/') && fileMap.screenshots) {
        return {
          ...f,
          format: 'screenshots',
          path: `${fileMap.screenshots.replace(/\/?$/, '/')}${f.path.split('/').pop()}`,
        };
      }
      return { ...f, format: null };
    }
    const index = FILE_MAP[format].indexOf(f.path);
    // The v3 config never lands on the project's own tailwind.config.js (AC-F37.6).
    const target =
      format === 'tailwind-v3' ? FILE_MAP[format][0] : (fileMap[format] ?? FILE_MAP[format][0]);
    if (index === 0) return { ...f, format, path: target };
    const dir = target.includes('/') ? target.slice(0, target.lastIndexOf('/') + 1) : '';
    return { ...f, format, path: `${dir}${f.path.split('/').pop()}` };
  });
}

/**
 * Decides what to write: new, updated or unchanged, merging marked blocks (AC-F37.5, F37.7).
 * Pure; `existing` maps path to current text (or undefined).
 */
export function planWrites(files, existing) {
  return files.map((f) => {
    const current = existing[f.path];
    let next = f.text;
    if (MARKED.has(f.format) && current !== undefined) next = mergeMarkedBlock(current, f.text);
    if (f.bytes) {
      const status =
        current === undefined ? 'new' : sameBytes(current, f.bytes) ? 'unchanged' : 'updated';
      return { ...f, status, next: f.bytes };
    }
    if (current === undefined) return { ...f, status: 'new', next };
    return { ...f, status: current === next ? 'unchanged' : 'updated', next };
  });
}

function sameBytes(a, b) {
  if (!(a instanceof Uint8Array) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function dirFor(root, path, create) {
  const parts = path.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create });
  return { dir, name: parts.at(-1) };
}

async function readExisting(root, path, binary) {
  try {
    const { dir, name } = await dirFor(root, path, false);
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return binary ? new Uint8Array(await file.arrayBuffer()) : await file.text();
  } catch {
    return undefined;
  }
}

/** FS_PERMISSION_DENIED when the browser refused access, FS_WRITE_FAILED otherwise (AC-F37.9). */
const failureCode = (error) =>
  error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
    ? 'FS_PERMISSION_DENIED'
    : 'FS_WRITE_FAILED';

/**
 * Writes files into a directory handle. Missing folders are created; unchanged files are not
 * rewritten; nothing is deleted.
 * @param {FileSystemDirectoryHandle} root
 * @param {Array<{path: string, format: string|null, text?: string, bytes?: Uint8Array}>} files
 * @returns {Promise<Array<{path: string, status: 'new'|'updated'|'unchanged'|'failed', code?: string, error?: string}>>}
 */
export async function writeToProject(root, files) {
  const existing = {};
  for (const f of files) existing[f.path] = await readExisting(root, f.path, Boolean(f.bytes));
  const plan = planWrites(files, existing);
  const results = [];
  for (const item of plan) {
    if (item.status === 'unchanged') {
      results.push({ path: item.path, status: 'unchanged' });
      continue;
    }
    try {
      const { dir, name } = await dirFor(root, item.path, true);
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(item.next);
      await writable.close();
      results.push({ path: item.path, status: item.status });
    } catch (error) {
      results.push({
        path: item.path,
        status: 'failed',
        code: failureCode(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

/** Permission check inside the click (AC-F37.4). Returns true when read-write is granted. */
export async function ensurePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

export const fileSystemSupported = () => typeof globalThis.showDirectoryPicker === 'function';
