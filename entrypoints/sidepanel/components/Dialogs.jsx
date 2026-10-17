import { useStore } from '../store.js';
import { t } from '../../../src/i18n.js';
import { ConfirmDialog } from './ConfirmDialog.jsx';

const STATUS = { new: 'status_new', updated: 'status_updated', unchanged: 'status_unchanged', failed: 'status_failed' };

/** Store-driven dialogs: cross-site pages, write summaries and import or mapping errors. */
export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const { closeDialog, confirmCrossSite } = useStore.getState();
  if (!dialog) return null;
  const onOpenChange = (open) => !open && closeDialog();
  switch (dialog.kind) {
    case 'cross-site':
      return (
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title={t('cross_site_title')}
          body={t('cross_site_body', dialog.host, dialog.snapshotHost)}
          confirmLabel={t('add_anyway')}
          onConfirm={confirmCrossSite}
        />
      );
    case 'write-summary':
    case 'write-failed': {
      const failed = dialog.results.filter((r) => r.status === 'failed').map((r) => r.path);
      return (
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title={t('write_summary')}
          body={failed.length ? t('fs_write_failed', failed.join(', ')) : dialog.project}
        >
          <ul className="mt-2 flex flex-col font-mono text-sm">
            {dialog.results.map((r) => (
              <li key={r.path} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate text-text">{r.path}</span>
                <span className={r.status === 'failed' ? 'text-danger' : 'text-faint'}>{t(STATUS[r.status])}</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      );
    }
    case 'import-error':
      return (
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title={t('import_invalid_title')}
          body={dialog.code === 'IMPORT_TOO_NEW' ? t('import_too_new') : t('import_invalid', dialog.problem)}
        />
      );
    case 'mapping-error':
      return <ConfirmDialog open onOpenChange={onOpenChange} title={t('map_title')} body={t('mapping_parse_failed', dialog.file)} />;
    default:
      return null;
  }
}
