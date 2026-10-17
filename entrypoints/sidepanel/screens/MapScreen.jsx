import { useRef, useState } from 'react';
import { ArrowRight, Download, FileUp } from 'lucide-react';
import { useStore } from '../store.js';
import { t } from '../../../src/i18n.js';
import { findToken } from '../../../src/model/design.js';
import { mappingCounts } from '../../../src/mapping/index.js';
import { Button } from '../components/Button.jsx';
import { RoleBadge, SwitchRow } from '../components/Basics.jsx';
import { Header } from '../components/Header.jsx';

const TONES = { exact: 'success', close: 'warning', none: 'danger' };

/** Map to my tokens (F38). */
export function MapScreen() {
  const record = useStore((s) => s.record);
  const { goBack, mapFile, setUseMyNames, exportMapping } = useStore.getState();
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const input = useRef(null);
  if (!record) return null;
  const mapping = record.mapping;
  const counts = mappingCounts(mapping);
  const entries = (mapping?.entries ?? []).filter((e) => !unmatchedOnly || e.status === 'none');

  return (
    <>
      <Header onBack={goBack} title={t('map_title')} />
      <main className="p-4 pt-2 pb-16">
        <input
          ref={input}
          type="file"
          accept=".json,.css,application/json,text/css"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) mapFile(file);
            e.target.value = '';
          }}
        />
        <Button variant={mapping ? 'secondary' : 'primary'} onClick={() => input.current?.click()}>
          <FileUp size={16} aria-hidden />
          {t('choose_token_file')}
        </Button>
        {mapping && (
          <>
            <p className="mt-3 text-text">
              <span className="font-mono">{mapping.sourceName}</span> · {t('map_counts', counts.exact, counts.close, counts.none)}
            </p>
            <div className="mt-2">
              <SwitchRow id="map-unmatched" label={t('unmatched_only')} checked={unmatchedOnly} onChange={setUnmatchedOnly} />
            </div>
            <ul className="mt-2 flex flex-col">
              {entries.map((e) => {
                const token = findToken(record.edited, e.tokenId)?.token;
                if (!token) return null;
                return (
                  <li key={e.tokenId} className="flex min-h-8 items-center gap-1.5 px-1 font-mono text-sm" data-status={e.status}>
                    {token.hex && <span className="size-3 shrink-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" style={{ background: token.hex }} aria-hidden />}
                    <span className="shrink-0 text-text">{token.name}</span>
                    <ArrowRight size={12} className="shrink-0 text-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-muted">{e.userToken ?? '—'}</span>
                    {e.delta !== null && <span className="shrink-0 text-faint">{e.delta}</span>}
                    <RoleBadge role={t(`status_${e.status}`)} tone={TONES[e.status]} />
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <SwitchRow id="map-use-names" label={t('use_my_names')} checked={mapping.useMyNames} onChange={setUseMyNames} />
            </div>
            <Button variant="secondary" className="mt-3" onClick={exportMapping}>
              <Download size={16} aria-hidden />
              {t('export_mapping')}
            </Button>
          </>
        )}
      </main>
    </>
  );
}
