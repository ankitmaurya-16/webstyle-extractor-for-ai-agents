import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { S } from '../strings.js';

export function SectionLabel({ children, count, as: Tag = 'h2' }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between">
      <Tag className="text-xs text-faint uppercase">{children}</Tag>
      {count !== undefined && <span className="font-mono text-xs text-faint">{count}</span>}
    </div>
  );
}

export function RoleBadge({ role }) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-surface-3 px-2 text-xs text-muted">
      {role}
    </span>
  );
}

/** Usage share as a 40 x 4 px bar and a percent. */
export function UsageBar({ share }) {
  const pct = Math.round(share * 100);
  const label = share > 0 && share < 0.01 ? '<1%' : `${pct}%`;
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label={`Usage ${label}`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-3 max-[379px]:hidden">
        <span
          className="block h-full bg-muted"
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
      </span>
      <span className="w-8 text-right font-mono text-[11px] text-faint">{label}</span>
    </span>
  );
}

export function Banner({ children }) {
  return (
    <div
      role="status"
      className="mt-4 flex items-start gap-2 rounded-card border border-border bg-surface p-3 text-muted"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

const STAGES = ['reading', 'analyzing', 'saving'];

export function ProgressList({ stage }) {
  const index = STAGES.indexOf(stage);
  return (
    <ol className="flex flex-col gap-1">
      {STAGES.map((s, i) => {
        const state = i < index ? 'done' : i === index ? 'active' : 'pending';
        return (
          <li
            key={s}
            className="flex h-8 items-center gap-3"
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className="flex size-4 items-center justify-center" aria-hidden>
              {state === 'done' && <Check size={16} className="text-success" />}
              {state === 'active' && <Loader2 size={16} className="animate-spin text-accent" />}
              {state === 'pending' && <span className="size-1.5 rounded-full bg-faint" />}
            </span>
            <span className={state === 'pending' ? 'text-faint' : 'text-text'}>
              {S.progress[s]}
              <span className="sr-only">
                {state === 'done' ? ' done' : state === 'active' ? ' in progress' : ' pending'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Centered icon, title, one line of body and an action. */
export function StateBlock({ icon: Icon, iconClass = 'text-faint', title, body, children }) {
  return (
    <section
      className="flex flex-col items-center px-4 py-12 text-center"
      aria-labelledby="state-title"
    >
      {Icon && <Icon size={24} className={iconClass} aria-hidden />}
      <h1 id="state-title" className="mt-3 text-md font-semibold">
        {title}
      </h1>
      {body && <p className="mt-1 max-w-[300px] text-muted">{body}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>
    </section>
  );
}

/** Top-five color strip used in Recent and History. */
export function ColorStrip({ colors }) {
  return (
    <span
      className="flex shrink-0 overflow-hidden rounded-swatch ring-1 ring-swatch-ring ring-inset"
      aria-hidden
    >
      {colors.slice(0, 5).map((hex, i) => (
        <span key={`${hex}-${i}`} className="block h-4 w-3" style={{ background: hex }} />
      ))}
      {colors.length === 0 && <span className="block h-4 w-[60px] bg-surface-3" />}
    </span>
  );
}
