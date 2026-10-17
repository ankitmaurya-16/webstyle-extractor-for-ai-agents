// diff.md (v2 spec 9.9).

import { finish } from '../export/common.js';

const date = (ts) => new Date(ts).toISOString().slice(0, 10);

export function exportDiffMd(diff) {
  const out = [`# ${diff.a.hostname} vs ${diff.b.hostname}`, ''];
  out.push(`A: ${diff.a.sourceUrl} (${date(diff.a.capturedAt)})`, `B: ${diff.b.sourceUrl} (${date(diff.b.capturedAt)})`, '');
  const c = diff.counts;
  out.push(`${c.added} added · ${c.removed} removed · ${c.changed} changed · ${c.renamed} renamed · ${c.unchanged} unchanged`, '');
  out.push('## Summary', '');
  for (const [category, d] of Object.entries(diff.categories)) {
    out.push(`- ${category}: ${d.added.length} added, ${d.removed.length} removed, ${d.changed.length} changed, ${d.renamed.length} renamed, ${d.unchanged} unchanged`);
  }
  out.push('');
  const section = (title, rows) => {
    out.push(`## ${title}`, '');
    if (rows.length) out.push(...rows);
    else out.push('None.');
    out.push('');
  };
  const all = (key, fmt) => Object.entries(diff.categories).flatMap(([cat, d]) => d[key].map((x) => `- ${cat}: ${fmt(x)}`));
  section('Added', all('added', (x) => `${x.name} ${x.value}`));
  section('Removed', all('removed', (x) => `${x.name} ${x.value}`));
  section('Changed', all('changed', (x) => `${x.name}: ${x.from} → ${x.to}${x.delta !== null ? ` (${x.delta})` : ''}`));
  section('Renamed', all('renamed', (x) => `${x.from} → ${x.to} (${x.value})`));
  section('Role changes', diff.roles.map((r) => `- ${r.role} (${r.mode}): ${r.from ?? 'none'} → ${r.to ?? 'none'}${r.delta !== null ? ` (${r.delta})` : ''}`));
  section(
    'Recipe changes',
    diff.recipes.map((r) => (r.change ? `- ${r.name}: ${r.change}` : `- ${r.name} ${r.state} (${r.mode}) ${r.prop}: ${r.from ?? 'none'} → ${r.to ?? 'none'}`)),
  );
  const stack = [];
  for (const [k, v] of Object.entries(diff.stack)) {
    for (const x of v.added) stack.push(`- ${k}: added ${x}`);
    for (const x of v.removed) stack.push(`- ${k}: removed ${x}`);
  }
  section('Stack changes', stack);
  return finish(out);
}
