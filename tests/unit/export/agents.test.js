import { describe, expect, it } from 'vitest';
import {
  exportAgentsMd,
  exportClaudeMd,
  exportCursorRules,
  exportDesignMd,
  FILE_MAP,
} from '../../../src/export/index.js';
import { MARK_END, MARK_START, keyTokens, mergeMarkedBlock } from '../../../src/export/agents.js';
import { FIXTURE_NAMES } from '../helpers.js';
import { VERSION, fixtureDesigns, richDesign } from './designs.js';

const designs = { ...fixtureDesigns(), rich: richDesign() };
const ALL = [...FIXTURE_NAMES, 'rich'];

/** Numbered rules of a Markdown file, with DESIGN.md's "this file" read as "DESIGN.md". */
const rulesOf = (text) =>
  [...text.matchAll(/^\d+\. (.+)$/gm)].map((m) => m[1].replace(/this file/g, 'DESIGN.md'));

/** A tiny YAML reader for the flat front matter Cursor uses: key: scalar or JSON array. */
function frontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z]+): (.+)$/.exec(line);
    if (!kv) throw new Error(`Not a flat YAML line: ${line}`);
    const value = kv[2];
    out[kv[1]] = /^[[{]|^(true|false)$/.test(value) ? JSON.parse(value) : value;
  }
  return out;
}

describe('agent rule files (F32)', () => {
  it.each(ALL)(
    'AC-F32.1 AGENTS.md is a marked block with heading, source, rules and pointers on %s',
    (name) => {
      const d = designs[name];
      const text = exportAgentsMd(d, VERSION);
      const lines = text.trimEnd().split('\n');
      expect(lines[0]).toBe(MARK_START);
      expect(lines.at(-1)).toBe(MARK_END);
      expect(lines[1]).toBe('## Design system');
      expect(text).toContain(
        `This project follows DESIGN.md, extracted from ${d.meta.sourceUrl} on 2026-10-1`,
      );
      expect(text).toContain('Theme tokens: design/theme.css.');
      expect(rulesOf(text).length).toBeGreaterThan(2);
      expect(text.split(MARK_START)).toHaveLength(2);
    },
  );

  it('AC-F32.1 AC-F32.5 the CLAUDE.md block holds the heading, the @DESIGN.md import and one line', () => {
    expect(exportClaudeMd(designs.classic, VERSION)).toBe(
      `${MARK_START}\n## Design system\n\n@DESIGN.md\n\nFollow DESIGN.md for all UI work in this project.\n${MARK_END}\n`,
    );
    expect(exportClaudeMd(designs.rich, VERSION).split('\n')).toContain('@DESIGN.md');
  });

  it.each(ALL)(
    'AC-F32.3 the .mdc front matter is valid YAML with description, globs and alwaysApply on %s',
    (name) => {
      const text = exportCursorRules(designs[name], VERSION);
      const fm = frontMatter(text);
      expect(Object.keys(fm)).toEqual(['description', 'globs', 'alwaysApply']);
      expect(fm.description).toBe(
        `Design system rules extracted from ${designs[name].meta.hostname}`,
      );
      expect(fm.globs).toEqual(['**/*.{tsx,jsx,vue,svelte,html,css}']);
      expect(fm.alwaysApply).toBe(false);
      expect(text).toContain('\nFollow the design system in @DESIGN.md.\n');
      expect(text).toMatch(/\nKey tokens: .+\n$/);
    },
  );

  it.each(ALL)(
    'AC-F32.4 the rules in AGENTS.md and the Cursor rules match DESIGN.md on %s',
    (name) => {
      const d = designs[name];
      const design = rulesOf(
        exportDesignMd(d, VERSION).split('## Rules for the agent')[1].split('\n## ')[0],
      );
      expect(design.length).toBeGreaterThan(2);
      expect(rulesOf(exportAgentsMd(d, VERSION))).toEqual(design);
      expect(rulesOf(exportCursorRules(d, VERSION))).toEqual(design);
    },
  );

  it('AC-F32.4 the rules stay identical with a token mapping', () => {
    const mapping = { sourceName: 'tokens.json', importedAt: 0, useMyNames: false, entries: [] };
    const d = designs.rich;
    const design = rulesOf(
      exportDesignMd(d, VERSION, { mapping }).split('## Rules for the agent')[1].split('\n## ')[0],
    );
    expect(design.at(-1)).toMatch(/^Prefer the existing tokens from tokens\.json\./);
    expect(rulesOf(exportAgentsMd(d, VERSION, { mapping }))).toEqual(design);
    expect(rulesOf(exportCursorRules(d, VERSION, { mapping }))).toEqual(design);
  });

  it('the Cursor key-token line names semantic tokens per theme, spacing, radius and font', () => {
    expect(keyTokens(designs.rich)).toBe(
      'background white / gray-extra-1 · text gray-900 / white · primary blue-600 / blue-400 · border gray-200 · spacing base 4px · radius-md 6px · font Helvetica Neue',
    );
  });

  it('AC-F32.6 paths follow the default file map', () => {
    expect(FILE_MAP['agents-md']).toEqual(['AGENTS.md']);
    expect(FILE_MAP['claude-md']).toEqual(['CLAUDE.md']);
    expect(FILE_MAP['cursor-rules']).toEqual(['.cursor/rules/design-system.mdc']);
  });

  it.each(ALL)('AC-F32.7 snapshots cover all three outputs on %s', async (name) => {
    const d = designs[name];
    await expect(exportAgentsMd(d, VERSION)).toMatchFileSnapshot(
      `./__snapshots__/${name}/AGENTS.md`,
    );
    await expect(exportClaudeMd(d, VERSION)).toMatchFileSnapshot(
      `./__snapshots__/${name}/CLAUDE.md`,
    );
    await expect(exportCursorRules(d, VERSION)).toMatchFileSnapshot(
      `./__snapshots__/${name}/.cursor/rules/design-system.mdc`,
    );
  });
});

describe('marked-block merge (F32)', () => {
  const block = `${MARK_START}\n## Design system\n\nnew rules\n${MARK_END}\n`;

  it('AC-F32.2 replaces only the text between existing markers', () => {
    const before = '# Project\n\nIntro text.\n\n';
    const after = '\n\n## Testing\n\nRun pnpm test.\n';
    const existing = `${before}${MARK_START}\nold rules\nmore old rules\n${MARK_END}${after}`;
    const merged = mergeMarkedBlock(existing, block);
    expect(merged).toBe(`${before}${block.trimEnd()}${after}`);
    expect(merged.startsWith(before)).toBe(true);
    expect(merged.endsWith(after)).toBe(true);
    expect(mergeMarkedBlock(merged, block)).toBe(merged);
  });

  it('AC-F32.2 appends the block when there are no markers, leaving the file as it was', () => {
    expect(mergeMarkedBlock('# Project\n', block)).toBe(`# Project\n\n${block}`);
    expect(mergeMarkedBlock('# Project', block)).toBe(`# Project\n\n${block}`);
    expect(mergeMarkedBlock('# Project\n\n', block)).toBe(`# Project\n\n${block}`);
    expect(mergeMarkedBlock('', block)).toBe(block);
    expect(mergeMarkedBlock(undefined, block)).toBe(block);
  });

  it('AC-F32.2 a start marker without an end marker counts as no markers', () => {
    const existing = `# Notes\n\nSee ${MARK_START} in the docs.\n`;
    expect(mergeMarkedBlock(existing, block)).toBe(`${existing}\n${block}`);
  });

  it('AC-F32.2 Windows line endings outside the markers are kept', () => {
    const existing = `# Project\r\n\r\n${MARK_START}\r\nold\r\n${MARK_END}\r\nTail\r\n`;
    const merged = mergeMarkedBlock(existing, block);
    expect(merged.startsWith('# Project\r\n\r\n')).toBe(true);
    expect(merged.endsWith(`${MARK_END}\r\nTail\r\n`)).toBe(true);
  });
});
