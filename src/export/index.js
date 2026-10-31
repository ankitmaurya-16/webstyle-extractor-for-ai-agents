// Export entry points. Each format renders one or more files; the zip, project writes and the
// CLI place them by the file map (v2 spec 9.2).

import { strToU8, zipSync } from 'fflate';
import { exportDesignMd } from './design-md.js';
import { exportDtcg, exportDtcgFiles } from './dtcg.js';
import { exportTailwindV4 } from './tailwind-v4.js';
import { exportTailwindV3 } from './tailwind-v3.js';
import { exportCssVars } from './css-vars.js';
import { exportShadcn } from './shadcn.js';
import { exportStyleguide } from './styleguide.js';
import { exportAgentsMd, exportClaudeMd, exportCursorRules } from './agents.js';
import { exportFigmaFiles } from './figma.js';
import { exportPrompt } from './prompt.js';
import { exportAuditMd } from './audit-md.js';
import { EXPORT_FORMATS } from '../model/types.js';
import { EXPORT_LABELS, FILE_MAP, baseName, screenshotPath } from './files.js';

export {
  exportDesignMd,
  exportDtcg,
  exportTailwindV4,
  exportTailwindV3,
  exportCssVars,
  exportShadcn,
  exportStyleguide,
  exportAgentsMd,
  exportClaudeMd,
  exportCursorRules,
  exportPrompt,
  exportAuditMd,
  FILE_MAP,
  EXPORT_LABELS,
};

/**
 * @typedef {object} ExportContext
 * @property {object|null} [mapping] TokenMapping (F38)
 * @property {'oklch'|'hsl'} [shadcnFormat]
 * @property {Array<{recipeId: string, mode: string, bytes?: Uint8Array, dataUrl?: string}>} [screenshots]
 */

/**
 * Renders a format to its files.
 * @param {string} format
 * @param {object} design
 * @param {string} version
 * @param {ExportContext} [ctx]
 * @returns {Array<{path: string, text: string}>}
 */
export function renderFormat(format, design, version, ctx = {}) {
  const [first, second, third] = FILE_MAP[format] ?? [];
  switch (format) {
    case 'design-md':
      return [{ path: first, text: exportDesignMd(design, version, ctx) }];
    case 'prompt':
      return [{ path: first, text: exportPrompt(design, version, ctx) }];
    case 'dtcg': {
      const { light, dark } = exportDtcgFiles(design, version, ctx);
      return [{ path: first, text: light }, ...(dark ? [{ path: second, text: dark }] : [])];
    }
    case 'tailwind-v4':
      return [{ path: first, text: exportTailwindV4(design, version, ctx) }];
    case 'tailwind-v3':
      return [{ path: first, text: exportTailwindV3(design, version, ctx) }];
    case 'css-vars':
      return [{ path: first, text: exportCssVars(design, version, ctx) }];
    case 'shadcn':
      return [{ path: first, text: exportShadcn(design, version, ctx) }];
    case 'styleguide':
      return [{ path: first, text: exportStyleguide(design, version, ctx) }];
    case 'agents-md':
      return [{ path: first, text: exportAgentsMd(design, version, ctx) }];
    case 'cursor-rules':
      return [{ path: first, text: exportCursorRules(design, version, ctx) }];
    case 'claude-md':
      return [{ path: first, text: exportClaudeMd(design, version, ctx) }];
    case 'figma': {
      const files = exportFigmaFiles(design, version, ctx);
      return [
        { path: first, text: files.primitives },
        ...(files.light ? [{ path: second, text: files.light }] : []),
        ...(files.dark ? [{ path: third, text: files.dark }] : []),
      ];
    }
    case 'audit':
      return [{ path: first, text: exportAuditMd(design, version, ctx) }];
    default:
      throw new Error(`Unknown export format ${format}`);
  }
}

/** The main text of a format: what the preview shows and Copy copies (AC-F7.2). */
export function exportFile(format, design, version, ctx = {}) {
  // A single file never carries the PNGs, so DESIGN.md must not link them (AC-F36.6).
  return renderFormat(format, design, version, { ...ctx, screenshots: [] })[0].text;
}

/** Download name for one file: example.com-DESIGN.md. */
export const downloadName = (design, format) =>
  `${design.meta.hostname}-${baseName(FILE_MAP[format][0])}`;
export const zipName = (design) => `${design.meta.hostname}-webstyle.zip`;

/**
 * Every selected format plus screenshots, laid out by the file map. Ordered and deterministic.
 * @param {object} design
 * @param {string} version
 * @param {{formats?: string[], ctx?: ExportContext, includeScreenshots?: boolean}} [options]
 * @returns {Array<{path: string, text?: string, bytes?: Uint8Array}>}
 */
export function exportFiles(
  design,
  version,
  { formats = EXPORT_FORMATS, ctx = {}, includeScreenshots = false } = {},
) {
  const files = [];
  const shots = includeScreenshots ? (ctx.screenshots ?? []) : [];
  const exportCtx = {
    ...ctx,
    screenshots: shots,
    screenshotData: includeScreenshots ? ctx.screenshotData : [],
  };
  for (const format of EXPORT_FORMATS) {
    if (!formats.includes(format)) continue;
    files.push(...renderFormat(format, design, version, exportCtx));
  }
  for (const shot of shots) {
    const recipe = design.components.find((r) => r.id === shot.recipeId);
    if (recipe && shot.bytes)
      files.push({ path: screenshotPath(recipe, shot.mode), bytes: shot.bytes });
  }
  return files;
}

/**
 * The zip of the selected formats. File times are the capture time so the bytes are identical
 * for the same design (AC-F7.8).
 * @returns {Uint8Array}
 */
export function exportZip(design, version, options = {}) {
  const entries = {};
  const mtime = new Date(Math.max(design.meta.capturedAt, Date.UTC(1980, 0, 2)));
  for (const file of exportFiles(design, version, options)) {
    entries[file.path] = [file.bytes ?? strToU8(file.text), { mtime }];
  }
  return zipSync(entries, { level: 6 });
}
