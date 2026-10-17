import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './Button.jsx';
import { S } from '../strings.js';

/** Confirmation dialog for delete and reset. Escape closes and returns focus to the trigger. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70" />
        <Dialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border-strong bg-surface-2 p-4 shadow-elevated">
          <Dialog.Title className="text-md font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-muted">{body}</Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">{S.cancel}</Button>
            </Dialog.Close>
            <Button
              variant={danger ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
