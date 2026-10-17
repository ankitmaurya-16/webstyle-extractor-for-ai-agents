// mapping.md (v2 spec 9.9).

import { findToken } from '../model/design.js';
import { finish } from '../export/common.js';
import { table } from '../export/design-md.js';
import { mappingCounts } from './index.js';

const valueOf = (category, t) =>
  category === 'color' ? t.hex : category === 'text' ? `${t.sizePx}px` : t.px !== undefined ? `${t.px}px` : t.ms !== undefined ? `${t.ms}ms` : t.value ?? t.css ?? t.stack?.[0] ?? '';

export function exportMappingMd(design, mapping) {
  const c = mappingCounts(mapping);
  const rows = [...mapping.entries]
    .sort((a, b) => Number(a.status === 'none') - Number(b.status === 'none'))
    .map((e) => {
      const found = findToken(design, e.tokenId);
      const t = found?.token;
      return [t?.name ?? e.tokenId, t ? valueOf(e.category, t) : '', e.userToken ?? '-', e.status, e.delta ?? '-'];
    });
  return finish([
    `# Token mapping: ${design.meta.hostname}`,
    '',
    `Source token file: ${mapping.sourceName} · mapped ${new Date(mapping.importedAt).toISOString().slice(0, 10)}`,
    '',
    `${c.exact} exact · ${c.close} close · ${c.none} none`,
    '',
    ...table(['Extracted token', 'Value', 'Your token', 'Status', 'Distance'], rows),
  ]);
}
