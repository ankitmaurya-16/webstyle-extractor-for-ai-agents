import * as Tooltip from '@radix-ui/react-tooltip';
import { forwardRef } from 'react';

const VARIANTS = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-text border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger text-on-accent hover:opacity-90',
};

export const Button = forwardRef(function Button(
  { variant = 'secondary', className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`transition-quick inline-flex h-8 items-center justify-center gap-2 rounded-control px-3 text-md whitespace-nowrap disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

/** 28 px icon button with a tooltip and an accessible name. */
export const IconButton = forwardRef(function IconButton(
  { label, children, className = '', ...props },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={`transition-quick inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-text ${className}`}
          {...props}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={4}
          className="animate-pop z-50 rounded-control border border-border-strong bg-surface-3 px-2 py-1 text-sm text-text shadow-elevated"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

export function Keycap({ children }) {
  return (
    <kbd className="rounded-swatch border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-sm text-muted">
      {children}
    </kbd>
  );
}
