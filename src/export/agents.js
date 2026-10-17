// Agent rule files (F32): AGENTS.md and CLAUDE.md marked blocks, and the Cursor rules file.

import { modesOf, roleToken, visible } from '../model/design.js';
import { captureDate, finish, prepare } from './common.js';
import { agentRules } from './rules.js';

export const MARK_START = '<!-- webstyle:start -->';
export const MARK_END = '<!-- webstyle:end -->';

export function exportAgentsMd(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const rules = agentRules(d, ctx).map((r, i) => `${i + 1}. ${r.replace(/this file/g, 'DESIGN.md')}`);
  return finish([
    MARK_START,
    '## Design system',
    '',
    `This project follows DESIGN.md, extracted from ${d.meta.sourceUrl} on ${captureDate(d)} with WebStyle Extractor v${version}.`,
    'Theme tokens: design/theme.css.',
    '',
    ...rules,
    MARK_END,
  ]);
}

export function exportClaudeMd() {
  return finish([MARK_START, '## Design system', '', '@DESIGN.md', '', 'Follow DESIGN.md for all UI work in this project.', MARK_END]);
}

export function exportCursorRules(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const rules = agentRules(d, ctx).map((r, i) => `${i + 1}. ${r.replace(/this file/g, 'DESIGN.md')}`);
  return finish([
    '---',
    `description: Design system rules extracted from ${d.meta.hostname}`,
    'globs: ["**/*.{tsx,jsx,vue,svelte,html,css}"]',
    'alwaysApply: false',
    '---',
    '',
    'Follow the design system in @DESIGN.md.',
    '',
    ...rules,
    '',
    `Key tokens: ${keyTokens(d)}`,
  ]);
}

/** "background white / gray-950 · text ... · spacing base 4px · radius-md 8px · font Inter" */
export function keyTokens(d) {
  const modes = modesOf(d);
  const parts = [];
  for (const role of ['background', 'text', 'primary', 'border']) {
    const names = modes.map((m) => roleToken(d, role, m)?.name).filter(Boolean);
    if (names.length) parts.push(`${role} ${[...new Set(names)].join(' / ')}`);
  }
  if (d.spacing.baseUnitPx) parts.push(`spacing base ${d.spacing.baseUnitPx}px`);
  const radius = visible(d.radii).sort((a, b) => b.usageShare - a.usageShare)[0];
  if (radius) parts.push(`${radius.name} ${radius.px >= 9999 ? 'full' : `${radius.px}px`}`);
  const family = visible(d.typography.families)[0];
  if (family) parts.push(`font ${family.stack[0]}`);
  return parts.join(' · ');
}

/**
 * Merges a marked block into an existing file: replaces the text between existing markers, or
 * appends the block; nothing else changes (AC-F32.2).
 */
export function mergeMarkedBlock(existing, block) {
  const text = existing ?? '';
  const start = text.indexOf(MARK_START);
  const end = text.indexOf(MARK_END, start + MARK_START.length);
  const cleanBlock = block.replace(/\n+$/, '');
  if (start >= 0 && end >= 0) {
    return text.slice(0, start) + cleanBlock + text.slice(end + MARK_END.length);
  }
  if (!text) return `${cleanBlock}\n`;
  const sep = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${sep}${cleanBlock}\n`;
}
