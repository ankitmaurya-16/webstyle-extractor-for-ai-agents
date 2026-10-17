import { useStore } from '../store.js';
import { historyDate, t } from '../../../src/i18n.js';
import { ColorStrip } from './Basics.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';

/** "Compare with…": choose another snapshot from history (F39). */
export function SnapshotPicker({ open, onOpenChange, exclude, onPick }) {
  const history = useStore((s) => s.history);
  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} title={t('choose_snapshot')}>
      <ul className="mt-2 flex flex-col">
        {history
          .filter((h) => h.id !== exclude)
          .map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onPick(h.id)}
                className="transition-quick flex h-8 w-full items-center gap-2 rounded-control px-1 text-left hover:bg-surface-3"
              >
                <ColorStrip colors={h.topColors} />
                <span className="min-w-0 flex-1 truncate">{h.hostname}</span>
                <span className="shrink-0 text-sm text-faint">{historyDate(h.capturedAt)}</span>
              </button>
            </li>
          ))}
      </ul>
    </ConfirmDialog>
  );
}
