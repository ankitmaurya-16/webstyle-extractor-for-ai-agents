import { describe, expect, it } from 'vitest';
import { applyEdit } from '../../../src/edit/apply-edit.js';
import { analyze } from '../../../src/analyze/index.js';
import { exportFile } from '../../../src/export/index.js';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import { loadRaw } from '../helpers.js';

const design = () => analyze(loadRaw('classic'));
const color = (d, name) => d.colors.find((c) => c.name === name);
const ok = (result) => {
  expect(result.ok).toBe(true);
  return result.design;
};

describe('applyEdit', () => {
  it('AC-F6.6 never mutates its input', () => {
    const d = design();
    const before = JSON.stringify(d);
    applyEdit(d, { kind: 'rename', tokenId: color(d, 'gray-900').id, name: 'ink' });
    applyEdit(d, { kind: 'exclude', tokenId: color(d, 'gray-900').id });
    expect(JSON.stringify(d)).toBe(before);
  });

  it('AC-F6.1 renames with lowercase letters, digits and hyphens', () => {
    const d = design();
    const next = ok(
      applyEdit(d, { kind: 'rename', tokenId: color(d, 'gray-900').id, name: 'ink-2' }),
    );
    expect(color(next, 'ink-2').hex).toBe('#111827');
  });

  it('AC-F6.1 rejects invalid names and changes nothing', () => {
    const d = design();
    const id = color(d, 'gray-900').id;
    for (const name of ['Ink', '2ink', 'ink_dark', '', 'ink dark', '-ink']) {
      expect(applyEdit(d, { kind: 'rename', tokenId: id, name })).toEqual({
        ok: false,
        error: 'INVALID_NAME',
      });
    }
  });

  it('AC-F6.1 rejects a name taken in the same category but allows it in another', () => {
    const d = design();
    expect(
      applyEdit(d, { kind: 'rename', tokenId: color(d, 'gray-900').id, name: 'white' }),
    ).toEqual({ ok: false, error: 'NAME_TAKEN' });
    const size = d.typography.sizes[0];
    expect(applyEdit(d, { kind: 'rename', tokenId: size.id, name: 'white' }).ok).toBe(true);
  });

  it('AC-F6.1 updates recipe references after a rename', () => {
    const d = design();
    const next = ok(
      applyEdit(d, { kind: 'rename', tokenId: color(d, 'blue-600').id, name: 'brand' }),
    );
    const primary = next.components.find((r) => r.variant === 'primary');
    expect(primary.styles['background-color'].ref).toBe('color.brand');
  });

  it('AC-F6.2 moves a role so it always points to one token', () => {
    const d = design();
    const next = ok(
      applyEdit(d, { kind: 'setRole', tokenId: color(d, 'gray-600').id, role: 'text' }),
    );
    expect(next.colors.filter((c) => c.roles.includes('text')).map((c) => c.name)).toEqual([
      'gray-600',
    ]);
    const cleared = ok(applyEdit(next, { kind: 'clearRole', role: 'text' }));
    expect(cleared.colors.some((c) => c.roles.includes('text'))).toBe(false);
  });

  it('AC-F6.3 merge adds usage, records the hex and removes the source', () => {
    const d = design();
    const source = color(d, 'gray-300');
    const target = color(d, 'gray-200');
    const next = ok(applyEdit(d, { kind: 'merge', sourceId: source.id, targetId: target.id }));
    expect(color(next, 'gray-300')).toBeUndefined();
    const merged = color(next, 'gray-200');
    expect(merged.mergedFrom).toContain(source.hex);
    expect(merged.usageShare).toBeCloseTo(source.usageShare + target.usageShare, 3);
  });

  it('AC-F6.3 redirects recipe references from the merged token', () => {
    const d = design();
    const next = ok(
      applyEdit(d, {
        kind: 'merge',
        sourceId: color(d, 'blue-600').id,
        targetId: color(d, 'gray-900').id,
      }),
    );
    const primary = next.components.find((r) => r.variant === 'primary');
    expect(primary.styles['background-color'].ref).toBe('color.gray-900');
  });

  it('rejects merging a token into itself, across categories or into nothing', () => {
    const d = design();
    const id = color(d, 'white').id;
    expect(applyEdit(d, { kind: 'merge', sourceId: id, targetId: id })).toEqual({
      ok: false,
      error: 'SAME_TOKEN',
    });
    expect(applyEdit(d, { kind: 'merge', sourceId: id, targetId: d.radii[0].id })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(applyEdit(d, { kind: 'exclude', tokenId: 'nope' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('AC-F6.4 exclude hides a token from every export and include restores it', () => {
    const d = design();
    const id = color(d, 'gray-300').id;
    const excluded = ok(applyEdit(d, { kind: 'exclude', tokenId: id }));
    expect(color(excluded, 'gray-300').excluded).toBe(true);
    // The hex can still appear inside a recipe's raw border value (AC-F6.5); the token cannot.
    for (const format of EXPORT_FORMATS) {
      expect(exportFile(format, excluded, '1.0.0'), format).not.toMatch(/gray-300|"300"|300:/);
    }
    const included = ok(applyEdit(excluded, { kind: 'include', tokenId: id }));
    expect(exportFile('css-vars', included, '1.0.0')).toContain('--color-gray-300: #d1d5db;');
  });

  it('AC-F6.5 excluding clears its roles and recipes fall back to raw values', () => {
    const d = design();
    const next = ok(applyEdit(d, { kind: 'exclude', tokenId: color(d, 'blue-600').id }));
    expect(color(next, 'blue-600').roles).toEqual([]);
    const md = exportFile('design-md', next, '1.0.0');
    expect(md).toContain('background #2563eb');
    expect(md).not.toContain('primary (blue-600)');
  });
});
