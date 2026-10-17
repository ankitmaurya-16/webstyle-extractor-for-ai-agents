// Export entry points. Each exporter is a pure function from a DesignSystem to file text.

import { strToU8, zipSync } from 'fflate';
import { exportDesignMd } from './design-md.js';
import { exportDtcg } from './dtcg.js';
import { exportTailwindV4 } from './tailwind-v4.js';
import { exportTailwindV3 } from './tailwind-v3.js';
import { exportCssVars } from './css-vars.js';
import { EXPORT_FORMATS } from '../model/types.js';

export { exportDesignMd, exportDtcg, exportTailwindV4, exportTailwindV3, exportCssVars };

export const EXPORT_FILES = Object.freeze({
  'design-md': 'DESIGN.md',
  dtcg: 'tokens.json',
  'tailwind-v4': 'theme.css',
  'tailwind-v3': 'tailwind.config.js',
  'css-vars': 'variables.css',
});

export const EXPORT_LABELS = Object.freeze({
  'design-md': 'DESIGN.md',
  dtcg: 'tokens.json',
  'tailwind-v4': 'theme.css (Tailwind v4)',
  'tailwind-v3': 'tailwind.config.js (Tailwind v3)',
  'css-vars': 'variables.css',
});

const EXPORTERS = {
  'design-md': exportDesignMd,
  dtcg: exportDtcg,
  'tailwind-v4': exportTailwindV4,
  'tailwind-v3': exportTailwindV3,
  'css-vars': exportCssVars,
};

/** @param {import('../model/types.js').ExportFormat} format */
export function exportFile(format, design, version) {
  const exporter = EXPORTERS[format];
  if (!exporter) throw new Error(`Unknown export format ${format}`);
  return exporter(design, version);
}

/** Download name for one file: example.com-DESIGN.md. */
export const downloadName = (design, format) => `${design.meta.hostname}-${EXPORT_FILES[format]}`;
export const zipName = (design) => `${design.meta.hostname}-webstyle.zip`;

/**
 * All five files in one zip. File times are the capture time so the bytes are identical for
 * the same DesignSystem.
 * @returns {Uint8Array}
 */
export function exportZip(design, version) {
  const files = {};
  const mtime = new Date(Math.max(design.meta.capturedAt, Date.UTC(1980, 0, 2)));
  for (const format of EXPORT_FORMATS) {
    files[EXPORT_FILES[format]] = [strToU8(exportFile(format, design, version)), { mtime }];
  }
  return zipSync(files, { level: 6 });
}
