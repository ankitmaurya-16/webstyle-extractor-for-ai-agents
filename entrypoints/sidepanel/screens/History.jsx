import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { History as HistoryIcon, MoreHorizontal, Pipette } from 'lucide-react';
import { useStore } from '../store.js';
import { S, historyDate } from '../strings.js';
import { Button } from '../components/Button.jsx';
import { ColorStrip, StateBlock } from '../components/Basics.jsx';
import { Header, MENU_CONTENT, MENU_ITEM } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';

export function History() {
  const history = useStore((s) => s.history);
  const loaded = useStore((s) => s.historyLoaded);
  const { goHome, openSnapshot, deleteSnapshot, deleteAll, extract } = useStore.getState();
  const [confirmId, setConfirmId] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <>
      <Header
        onBack={goHome}
        title={S.history}
        actions={
          history.length > 0 && (
            <Button
              variant="ghost"
              className="h-7 text-danger hover:text-danger"
              onClick={() => setConfirmAll(true)}
            >
              {S.deleteAll}
            </Button>
          )
        }
      />
      <main className="p-4 pt-2">
        {loaded && history.length === 0 && (
          <StateBlock icon={HistoryIcon} title={S.historyEmpty.title} body={S.historyEmpty.body}>
            <Button
              variant="primary"
              onClick={() => {
                goHome();
                extract({ mode: 'new' });
              }}
            >
              <Pipette size={16} aria-hidden />
              {S.extract}
            </Button>
          </StateBlock>
        )}
        <ul className="flex flex-col">
          {history.map((r) => (
            <li
              key={r.id}
              className="group flex h-8 items-center gap-1 rounded-control hover:bg-surface"
            >
              <button
                type="button"
                onClick={() => openSnapshot(r.id)}
                className="flex h-8 min-w-0 flex-1 items-center gap-3 px-1 text-left"
              >
                <ColorStrip colors={r.topColors} />
                <span className="min-w-0 flex-1 truncate">{r.hostname}</span>
                <span className="shrink-0 text-sm text-faint">{historyDate(r.capturedAt)}</span>
              </button>
              <Menu.Root>
                <Menu.Trigger asChild>
                  <button
                    type="button"
                    aria-label={S.tokenMenu(r.hostname)}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <MoreHorizontal size={16} aria-hidden />
                  </button>
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
                    <Menu.Item className={MENU_ITEM} onSelect={() => openSnapshot(r.id)}>
                      {S.open}
                    </Menu.Item>
                    <Menu.Item
                      className={`${MENU_ITEM} text-danger`}
                      onSelect={() => setConfirmId(r.id)}
                    >
                      {S.delete}
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Portal>
              </Menu.Root>
            </li>
          ))}
        </ul>
      </main>
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
        title={S.confirmDelete.title}
        body={S.confirmDelete.body}
        confirmLabel={S.confirmDelete.confirm}
        danger
        onConfirm={() => deleteSnapshot(confirmId)}
      />
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
