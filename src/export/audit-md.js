// audit.md (F29, v2 spec 9.9).

import { findToken } from '../model/design.js';
import { captureDate, finish, prepare } from './common.js';

export function exportAuditMd(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const a = d.audit;
  const name = (id) => findToken(d, id)?.token.name ?? id;
  const out = [
    `# Consistency report: ${d.meta.hostname}`,
    '',
    `Extracted ${captureDate(d)} from ${d.meta.sourceUrl} · WebStyle Extractor v${version}`,
    '',
  ];
  out.push('## Summary', '');
  out.push(`- Colors: ${a.colorsBeforeMerge} found, ${a.colorsAfterMerge} after merging`);
  if (a.offScaleSpacing) out.push(`- Off-scale spacing values: ${a.offScaleSpacing.length}`);
  out.push(`- Contrast failures: ${a.contrastFailures}`);
  out.push(`- Focus style: ${a.missingFocusStyle ? 'missing (browser default)' : 'present'}`);
  out.push(`- Low-confidence items: ${a.lowConfidence.length}`, '');
  out.push('## Near-duplicate colors', '');
  if (a.nearDuplicateGroups.length)
    for (const g of a.nearDuplicateGroups)
      out.push(`- ${g.kept} kept; merged ${g.merged.join(', ')}`);
  else out.push('None.');
  out.push('');
  if (a.offScaleSpacing) {
    out.push('## Off-scale spacing', '');
    if (a.offScaleSpacing.length)
      for (const s of a.offScaleSpacing)
        out.push(`- ${s.px}px (${Math.round(s.usageShare * 1000) / 10}%)`);
    else out.push('None.');
    out.push('');
  }
  out.push('## Distinct counts', '');
  for (const [k, v] of Object.entries(a.distinct)) out.push(`- ${k}: ${v}`);
  out.push('', '## Contrast failures', '');
  if ((a.contrastFailureList ?? []).length) {
    for (const c of a.contrastFailureList)
      out.push(
        `- ${name(c.textTokenId)} on ${name(c.backgroundTokenId)}: ${c.ratio}:1 (${c.mode})`,
      );
  } else out.push('None.');
  out.push(
    '',
    '## Focus style',
    '',
    a.missingFocusStyle
      ? 'No focus style found on buttons, links or inputs; the browser default is used.'
      : 'A focus style exists.',
  );
  out.push('', '## Variable conflicts across pages', '');
  if (a.variableConflicts.length)
    for (const c of a.variableConflicts)
      out.push(`- ${c.name}: kept ${c.kept}; also ${c.others.join(', ')}`);
  else out.push('None.');
  out.push('', '## Low-confidence items', '');
  if (a.lowConfidence.length) for (const id of a.lowConfidence) out.push(`- ${name(id)}`);
  else out.push('None.');
  return finish(out);
}
