import { useState } from 'react';
import { Pipette, Trash2 } from 'lucide-react';
import { useStore } from '../store.js';
import { S, SOURCE_URL, relativeDate } from '../strings.js';
import { Button, Keycap } from '../components/Button.jsx';
import { ColorStrip, SectionLabel } from '../components/Basics.jsx';
import { Header, HistoryButton } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';

export function Home() {
  const tab = useStore((s) => s.tab);
  const run = useStore((s) => s.run);
  const recent = useStore((s) => s.recent);
  const history = useStore((s) => s.history);
  const loaded = useStore((s) => s.historyLoaded);
  const { extract, openHistory, openSnapshot, openShortcuts, openUrl, deleteAll } =
    useStore.getState();
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <>
      <Header
        actions={<HistoryButton onClick={openHistory} />}
        menu={[
          { label: S.changeShortcut, onSelect: openShortcuts },
          { label: S.sourceCode, onSelect: () => openUrl(SOURCE_URL) },
          {
            label: S.deleteAllHistory,
            onSelect: () => setConfirmAll(true),
            danger: true,
            icon: Trash2,
          },
        ]}
      />
      <main className="p-4">
        <h1 className="truncate text-lg">{tab?.hostname ?? S.currentTab}</h1>
        {tab?.url && (
          <p className="truncate font-mono text-sm text-faint" title={tab.url}>
            {tab.url}
          </p>
        )}
        <Button
          variant="primary"
          className="mt-4 w-full"
          disabled={Boolean(run)}
          onClick={() => extract({ mode: 'new' })}
        >
          <Pipette size={16} aria-hidden />
          {S.extract}
        </Button>
        <p className="mt-2 text-sm text-faint">
          {S.orPress} <Keycap>{S.shortcut}</Keycap>
        </p>

        {loaded && recent.length > 0 && (
          <section aria-label={S.recent}>
            <SectionLabel>{S.recent}</SectionLabel>
            <ul className="flex flex-col">
              {recent.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openSnapshot(r.id)}
                    className="transition-quick flex h-8 w-full items-center gap-3 rounded-control px-1 text-left hover:bg-surface"
                  >
                    <ColorStrip colors={r.topColors} />
                    <span className="min-w-0 flex-1 truncate">{r.hostname}</span>
                    <span className="shrink-0 text-sm text-faint">
                      {relativeDate(r.capturedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {loaded && recent.length === 0 && (
          <ol className="mt-6 flex flex-col gap-2" aria-label="How it works">
            {S.firstRun.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-muted">
                <span className="flex size-5 items-center justify-center rounded-full bg-surface-3 font-mono text-[11px] text-text">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </main>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={S.confirmDeleteAll.title}
        body={S.confirmDeleteAll.body(history.length)}
        confirmLabel={S.confirmDeleteAll.confirm}
        danger
        onConfirm={deleteAll}
      />
    </>
  );
}
