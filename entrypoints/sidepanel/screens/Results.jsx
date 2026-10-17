import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useStore } from '../store.js';
import { S, shortDate } from '../strings.js';
import { Header } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { ColorsTab } from './ColorsTab.jsx';
import { TypeTab } from './TypeTab.jsx';
import { LayoutTab } from './LayoutTab.jsx';
import { ComponentsTab } from './ComponentsTab.jsx';
import { ExportTab } from './ExportTab.jsx';

const TABS = [
  ['colors', ColorsTab],
  ['type', TypeTab],
  ['layout', LayoutTab],
  ['components', ComponentsTab],
  ['export', ExportTab],
];

export function Results() {
  const record = useStore((s) => s.record);
  const resultsTab = useStore((s) => s.resultsTab);
  const { goHome, setResultsTab, extract, resetToExtracted, deleteSnapshot } = useStore.getState();
  const [confirm, setConfirm] = useState(null); // 'reset' | 'delete' | null
  if (!record) return null;
  const design = record.edited;

  return (
    <>
      <Header
        onBack={goHome}
        title={`${design.meta.hostname} · ${shortDate(design.meta.capturedAt)}`}
        menu={[
          { label: S.rerun, onSelect: () => extract({ mode: 'rerun' }), icon: RotateCcw },
          { label: S.resetToExtracted, onSelect: () => setConfirm('reset') },
          { label: S.delete, onSelect: () => setConfirm('delete'), danger: true, icon: Trash2 },
        ]}
      />
      <Tabs.Root value={resultsTab} onValueChange={setResultsTab}>
        <Tabs.List
          aria-label="Results"
          className="scrollbar-thin sticky top-11 z-10 flex h-9 overflow-x-auto border-b border-border bg-bg px-2"
        >
          {TABS.map(([id]) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="transition-quick relative shrink-0 px-2 text-base font-medium text-muted hover:text-text data-[state=active]:text-text data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-accent"
            >
              {S.tabs[id]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TABS.map(([id, Panel]) => (
          <Tabs.Content key={id} value={id} className="px-4 pb-16 outline-none">
            <Panel design={design} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={S.confirmReset.title}
        body={S.confirmReset.body}
        confirmLabel={S.confirmReset.confirm}
        onConfirm={resetToExtracted}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={S.confirmDelete.title}
        body={S.confirmDelete.body}
        confirmLabel={S.confirmDelete.confirm}
        danger
        onConfirm={() => deleteSnapshot(record.id)}
      />
    </>
  );
}
