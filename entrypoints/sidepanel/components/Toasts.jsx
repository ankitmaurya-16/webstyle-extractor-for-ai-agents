import * as Toast from '@radix-ui/react-toast';
import { Check, AlertTriangle } from 'lucide-react';
import { useStore } from '../store.js';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <>
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          duration={t.duration}
          type={t.kind === 'COPIED' ? 'background' : 'foreground'}
          onOpenChange={(open) => !open && dismiss(t.id)}
          className="animate-pop flex items-start gap-2 rounded-card border border-border-strong bg-surface-3 px-3 py-2 shadow-elevated"
        >
          {t.kind === 'COPIED' ? (
            <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          )}
          <Toast.Description className="text-text">{t.text}</Toast.Description>
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-32px)] max-w-[360px] -translate-x-1/2 flex-col items-center gap-2 outline-none" />
    </>
  );
}
