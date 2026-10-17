import { useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { History as HistoryIcon, MoreHorizontal, Pipette } from 'lucide-react';
import { useStore } from '../store.js';
import { historyDate, t } from '../../../src/i18n.js';
import { Button } from '../components/Button.jsx';
import { ColorStrip, RoleBadge, StateBlock } from '../components/Basics.jsx';
import { Header, MENU_CONTENT, MENU_ITEM } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { KindIcon } from './Home.jsx';

export function History() {
  const history = useStore((s) => s.history);
  const loaded = useStore((s) => s.historyLoaded);
  const store = useStore.getState();
  const [confirm, setConfirm] = useState(null); // { kind: 'one'|'all'|'selected', id? }
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [exportDialog, setExportDialog] = useState(null); // ids
  const [includeShots, setIncludeShots] = useState(false);
  const fileInput = useRef(null);
  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };

  return (
    <>
      <Header
        onBack={store.goHome}
        title={t('history')}
        actions={
          history.length > 0 && (
            <Button variant="ghost" className="h-7" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? t('done') : t('select')}
            </Button>
          )
        }
        menu={[
          { label: t('import'), onSelect: () => fileInput.current?.click() },
          history.length > 0 ? { label: t('export_all'), onSelect: () => setExportDialog(history.map((h) => h.id)) } : null,
          history.length > 0 ? { label: t('delete_all'), onSelect: () => setConfirm({ kind: 'all' }), danger: true } : null,
        ]}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) store.importFile(file);
          e.target.value = '';
        }}
      />
      {selecting && (
        <div className="sticky top-11 z-10 flex flex-wrap gap-2 border-b border-border bg-bg px-4 py-2">
          <Button variant="primary" className="h-7" disabled={selected.length !== 2} onClick={() => store.compare(selected[0], selected[1])}>
            {t('compare')}
          </Button>
          <Button variant="secondary" className="h-7" disabled={selected.length === 0} onClick={() => setExportDialog(selected)}>
            {t('export_selected')}
          </Button>
          <Button variant="ghost" className="h-7 text-danger hover:text-danger" disabled={selected.length === 0} onClick={() => setConfirm({ kind: 'selected' })}>
            {t('delete_selected')}
          </Button>
        </div>
      )}
      <main className="p-4 pt-2">
        {loaded && history.length === 0 && (
          <StateBlock icon={HistoryIcon} title={t('history_empty_title')} body={t('history_empty_body')}>
            <Button
              variant="primary"
              onClick={() => {
                store.goHome();
                store.extract({ intent: 'new' });
              }}
            >
              <Pipette size={16} aria-hidden />
              {t('extract')}
            </Button>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              {t('import')}
            </Button>
          </StateBlock>
        )}
        <ul className="flex flex-col">
          {history.map((r) => (
            <li key={r.id} className="group flex min-h-8 items-center gap-1 rounded-control hover:bg-surface" data-snapshot={r.id}>
              {selecting && (
                <input
                  type="checkbox"
                  aria-label={t('select_snapshot', r.hostname)}
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                  className="ml-1 size-3.5 shrink-0 accent-accent"
                />
              )}
              <button
                type="button"
                onClick={() => (selecting ? toggle(r.id) : store.openSnapshot(r.id))}
                className="flex h-8 min-w-0 flex-1 items-center gap-2 px-1 text-left"
              >
                <KindIcon kind={r.kind} />
                <ColorStrip colors={r.topColors} />
                <span className="min-w-0 flex-1 truncate">
                  {r.hostname}
                  {r.pages > 1 && <span className="text-faint"> · {t('pages_count', r.pages)}</span>}
                </span>
                {(r.modes ?? []).length > 1 && <RoleBadge role={`${t('light')} · ${t('dark')}`} />}
                <span className="shrink-0 text-sm text-faint">{historyDate(r.capturedAt)}</span>
              </button>
              {!selecting && (
                <Menu.Root>
                  <Menu.Trigger asChild>
                    <button
                      type="button"
                      aria-label={t('token_menu', r.hostname)}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-text"
                    >
                      <MoreHorizontal size={16} aria-hidden />
                    </button>
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
                      <Menu.Item className={MENU_ITEM} onSelect={() => store.openSnapshot(r.id)}>
                        {t('open')}
                      </Menu.Item>
                      <Menu.Item className={MENU_ITEM} onSelect={() => setExportDialog([r.id])}>
                        {t('export_snapshot')}
                      </Menu.Item>
                      <Menu.Item className={`${MENU_ITEM} text-danger`} onSelect={() => setConfirm({ kind: 'one', id: r.id })}>
                        {t('delete')}
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Portal>
                </Menu.Root>
              )}
            </li>
          ))}
        </ul>
      </main>
      <ConfirmDialog
        open={confirm?.kind === 'one'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('confirm_delete_title')}
        body={t('confirm_delete_body')}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => store.deleteSnapshot(confirm.id)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'selected'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('confirm_delete_selected_title')}
        body={t('confirm_delete_all_body', selected.length)}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => {
          store.deleteMany(selected);
          stopSelecting();
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'all'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('confirm_delete_all_title')}
        body={t('confirm_delete_all_body', history.length)}
        confirmLabel={t('delete_all')}
        danger
        onConfirm={store.deleteAll}
      />
      <ConfirmDialog
        open={exportDialog !== null}
        onOpenChange={(open) => !open && setExportDialog(null)}
        title={t('export_title')}
        confirmLabel={t('export_button')}
        onConfirm={() => store.exportSnapshotsToFile(exportDialog, { includeScreenshots: includeShots })}
      >
        <label className="mt-3 flex items-center gap-2 text-text">
          <input type="checkbox" checked={includeShots} onChange={(e) => setIncludeShots(e.target.checked)} className="size-3.5 accent-accent" />
          {t('include_screenshots_export')}
        </label>
      </ConfirmDialog>
    </>
  );
}
