import { describe, expect, it } from 'vitest';
import { diffDesigns } from '../../../src/diff/index.js';
import { exportDiffMd } from '../../../src/diff/diff-md.js';
import { applyEdit } from '../../../src/edit/apply-edit.js';
import { analyzeFixture } from '../helpers.js';
import { richDesign } from '../export/designs.js';

const classic = analyzeFixture('classic');
const utility = analyzeFixture('utility');
const rich = richDesign();

/** B is A with edits made through the edit log, plus direct changes for value changes. */
function editedPair() {
  const a = structuredClone(classic);
  let b = structuredClone(classic);
  b = applyEdit(b, { kind: 'rename', tokenId: 'color:#e5e7eb', name: 'hairline' }).design;
  b = applyEdit(b, { kind: 'exclude', tokenId: 'color:#fee2e2' }).design;
  // A changed value under the same name: brand moves to a darker blue the page also uses.
  const brand = b.colors.find((c) => c.id === 'color:#2563eb');
  Object.assign(brand, { id: 'color:#1e40af', hex: '#1e40af' });
  b.semantic.primary.light = 'color:#1e40af';
  b.radii.find((r) => r.name === 'radius-md').px = 8;
  b.spacing.tokens = b.spacing.tokens.filter((t) => t.px !== 48);
  return { a, b };
}

describe('snapshot diff (F39)', () => {
  it('AC-F39.2 tokens are matched by name first, then by value, per category', () => {
    const a = structuredClone(classic);
    const b = structuredClone(classic);
    // In B the name "brand" moves to another value and the old value is renamed.
    const old = b.colors.find((c) => c.id === 'color:#2563eb');
    old.name = 'accent';
    b.colors.push({ ...structuredClone(old), id: 'color:#1e40af', hex: '#1e40af', name: 'brand' });
    const color = diffDesigns(a, b).categories.color;
    expect(color.changed).toEqual([
      { name: 'brand', from: '#2563eb', to: '#1e40af', delta: expect.any(Number) },
    ]);
    expect(color.added).toEqual([{ name: 'accent', value: '#2563eb' }]);
    expect(color.renamed).toEqual([]);
    // The same value under another name in the same category is a rename.
    const c = structuredClone(classic);
    c.colors.find((x) => x.id === 'color:#2563eb').name = 'accent';
    expect(diffDesigns(a, c).categories.color.renamed).toEqual([
      { from: 'brand', to: 'accent', value: '#2563eb' },
    ]);
    // Categories never match across each other: a 16px space and a 16px text size stay apart.
    expect(diffDesigns(a, c).categories.space.renamed).toEqual([]);
  });

  it('AC-F39.3 reports added, removed, changed, renamed and unchanged on an edited pair', () => {
    const { a, b } = editedPair();
    const diff = diffDesigns(a, b);
    const color = diff.categories.color;
    expect(color.renamed).toEqual([{ from: 'gray-200', to: 'hairline', value: '#e5e7eb' }]);
    expect(color.removed).toEqual([{ name: 'red-100', value: '#fee2e2' }]);
    expect(color.changed).toEqual([
      { name: 'brand', from: '#2563eb', to: '#1e40af', delta: expect.any(Number) },
    ]);
    expect(color.changed[0].delta).toBeGreaterThan(0.05);
    expect(diff.categories.radius.changed).toEqual([
      { name: 'radius-md', from: '6px', to: '8px', delta: 2 },
    ]);
    expect(diff.categories.space.removed).toEqual([{ name: 'space-12', value: '48px' }]);
    const visibleColors = a.colors.filter((c) => !c.excluded).length;
    expect(color.unchanged).toBe(visibleColors - 3);
    expect(diff.counts).toMatchObject({ renamed: 1, removed: 2, changed: 2, added: 0 });
    const total = Object.values(diff.categories).reduce((n, cat) => n + cat.unchanged, 0);
    expect(diff.counts.unchanged).toBe(total);
  });

  it('AC-F39.3 an identical pair has only unchanged tokens', () => {
    const diff = diffDesigns(classic, structuredClone(classic));
    expect(diff.counts).toMatchObject({ added: 0, removed: 0, changed: 0, renamed: 0 });
    expect(diff.counts.unchanged).toBeGreaterThan(20);
    expect(diff.roles).toEqual([]);
    expect(diff.recipes).toEqual([]);
  });

  it('AC-F39.3 works across sites', () => {
    const diff = diffDesigns(classic, utility);
    expect(diff.a.sourceUrl).toBe(classic.meta.sourceUrl);
    expect(diff.b.sourceUrl).toBe(utility.meta.sourceUrl);
    expect(diff.counts.added + diff.counts.removed + diff.counts.changed).toBeGreaterThan(0);
    expect(diff.categories.color.added.map((x) => x.value)).toContain('#059669');
  });

  it('AC-F39.4 role changes are reported per theme', () => {
    const { a, b } = editedPair();
    expect(diffDesigns(a, b).roles).toEqual([
      {
        role: 'primary',
        mode: 'light',
        from: 'brand #2563eb',
        to: 'brand #1e40af',
        delta: expect.any(Number),
      },
    ]);
    const toRich = diffDesigns(classic, rich).roles;
    const dark = toRich.filter((r) => r.mode === 'dark');
    expect(dark.map((r) => r.role).sort()).toEqual(['background', 'primary', 'text']);
    expect(dark.find((r) => r.role === 'primary')).toMatchObject({
      from: null,
      to: 'blue-400 #60a5fa',
      delta: null,
    });
  });

  it('AC-F39.4 recipe changes are reported per property', () => {
    const changes = diffDesigns(classic, rich).recipes.filter(
      (r) => r.id === 'component:button:primary',
    );
    expect(changes).toContainEqual({
      id: 'component:button:primary',
      name: expect.any(String),
      mode: 'light',
      state: 'hover',
      prop: 'background-color',
      from: null,
      to: 'gray-900',
    });
    const b = structuredClone(classic);
    b.components = b.components.filter((r) => r.id !== 'component:card:default');
    expect(diffDesigns(classic, b).recipes).toEqual([
      { id: 'component:card:default', name: expect.any(String), change: 'removed' },
    ]);
    expect(diffDesigns(b, classic).recipes).toEqual([
      { id: 'component:card:default', name: expect.any(String), change: 'added' },
    ]);
  });

  it('AC-F39.5 stack changes report framework, icons and web fonts', () => {
    const diff = diffDesigns(classic, rich);
    expect(diff.stack.fonts).toEqual({ added: ['Helvetica Neue'], removed: [] });
    const cross = diffDesigns(classic, utility);
    expect(cross.stack.framework.added).toEqual(
      utility.meta.framework
        .map((f) => f.name)
        .filter((n) => !classic.meta.framework.some((f) => f.name === n)),
    );
    const b = structuredClone(classic);
    b.meta.icons = [
      {
        id: 'lucide',
        name: 'Lucide',
        version: null,
        confidence: { level: 'high', score: 1, reasons: [] },
        evidence: [],
      },
    ];
    expect(diffDesigns(classic, b).stack.icons).toEqual({ added: ['Lucide'], removed: [] });
    expect(diffDesigns(b, classic).stack.icons).toEqual({ added: [], removed: ['Lucide'] });
  });

  it('AC-F39.7 diff.md exports the same content in the documented order', async () => {
    const { a, b } = editedPair();
    const diff = diffDesigns(a, b);
    const md = exportDiffMd(diff);
    expect(md.split('\n')[0]).toBe('# 127.0.0.1 vs 127.0.0.1');
    expect(md).toContain(`A: ${a.meta.sourceUrl} (2026-10-18)`);
    const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'Summary',
      'Added',
      'Removed',
      'Changed',
      'Renamed',
      'Role changes',
      'Recipe changes',
      'Stack changes',
    ]);
    expect(md).toContain('- color: brand: #2563eb → #1e40af (OKLab distance');
    expect(md).toContain('- radius: radius-md: 6px → 8px (+2px)');
    expect(md).toContain('- color: gray-200 → hairline (#e5e7eb)');
    expect(md).toContain('- primary (light): brand #2563eb → brand #1e40af (OKLab distance');
    for (const [category, d] of Object.entries(diff.categories)) {
      expect(md).toContain(
        `- ${category}: ${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed`,
      );
    }
    await expect(md).toMatchFileSnapshot('../export/__snapshots__/classic/diff.md');
    await expect(exportDiffMd(diffDesigns(classic, rich))).toMatchFileSnapshot(
      '../export/__snapshots__/rich/diff.md',
    );
  });
});
