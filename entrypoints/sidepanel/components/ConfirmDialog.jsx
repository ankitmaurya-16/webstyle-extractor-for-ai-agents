import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './Button.jsx';
import { t } from '../../../src/i18n.js';

/** Confirmation and message dialogs. Escape closes and returns focus to the trigger. */
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, danger = false, onConfirm, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70" />
        <Dialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-[calc(100%-32px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-card border border-border-strong bg-surface-2 p-4 shadow-elevated">
          <Dialog.Title className="text-md font-semibold">{title}</Dialog.Title>
          {body ? <Dialog.Description className="mt-1 text-muted">{body}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
          {children}
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{onConfirm ? t('cancel') : t('close')}</Button>
            </Dialog.Close>
            {onConfirm && (
              <Button
                variant={danger ? 'danger' : 'primary'}
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              >
                {confirmLabel}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
