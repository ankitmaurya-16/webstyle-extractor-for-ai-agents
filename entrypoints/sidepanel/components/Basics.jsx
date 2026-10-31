import { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Tooltip from '@radix-ui/react-tooltip';
import { AlertTriangle, Check, ChevronRight, Info, Loader2, X } from 'lucide-react';
import { formatPercent, t } from '../../../src/i18n.js';
import { stageLabel, useStore } from '../store.js';

export function SectionLabel({ children, count, as: Tag = 'h2', action }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-2">
      <Tag className="text-xs text-faint uppercase">{children}</Tag>
      <span className="flex items-center gap-2">
        {action}
        {count !== undefined && <span className="font-mono text-xs text-faint">{count}</span>}
      </span>
    </div>
  );
}

export function RoleBadge({ role, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    success: 'bg-surface-3 text-success',
    warning: 'bg-surface-3 text-warning',
    danger: 'bg-surface-3 text-danger',
  };
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-full px-2 text-xs ${tones[tone]}`}
    >
      {role}
    </span>
  );
}

/** Usage share as a 40 x 4 px bar and a percent. */
export function UsageBar({ share }) {
  const pct = Math.round(share * 100);
  const label = formatPercent(share);
  return (
    <span className="flex shrink-0 items-center gap-1.5" aria-label={label}>
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

/** Full-width note, info or warning, optionally dismissible. */
export function Banner({ children, tone = 'warning', onDismiss, action }) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      role="status"
      className="mt-4 flex items-start gap-2 rounded-card border border-border bg-surface-2 p-3 text-muted"
    >
      <Icon
        size={16}
        className={`mt-0.5 shrink-0 ${tone === 'info' ? 'text-accent' : 'text-warning'}`}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {children}
        {action && <span className="mt-2 block">{action}</span>}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('dismiss')}
          className="transition-quick -m-1 inline-flex size-6 shrink-0 items-center justify-center rounded-control text-faint hover:text-text"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Only the stages that will run (v2 spec 10.2). */
export function ProgressList({ stages, stage }) {
  const index = stages.indexOf(stage);
  return (
    <ol className="flex flex-col gap-1">
      {stages.map((s, i) => {
        const state = i < index ? 'done' : i === index ? 'active' : 'pending';
        return (
          <li
            key={s}
            className="flex h-8 items-center gap-3"
            aria-current={state === 'active' ? 'step' : undefined}
            data-stage={s}
          >
            <span className="flex size-4 items-center justify-center" aria-hidden>
              {state === 'done' && <Check size={16} className="text-success" />}
              {state === 'active' && <Loader2 size={16} className="animate-spin text-accent" />}
              {state === 'pending' && <span className="size-1.5 rounded-full bg-faint" />}
            </span>
            <span className={state === 'pending' ? 'text-faint' : 'text-text'}>
              {stageLabel(s)}
              <span className="sr-only">
                {' '}
                {state === 'done'
                  ? t('stage_done', '')
                  : state === 'active'
                    ? t('in_progress')
                    : t('stage_pending')}
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

/** 8 px: hollow ring for medium, filled warning dot for low, nothing for high (F28). */
export function ConfidenceDot({ confidence }) {
  if (!confidence || confidence.level === 'high') return null;
  const label = confidence.level === 'low' ? t('confidence_low') : t('confidence_medium');
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span
          role="img"
          tabIndex={0}
          aria-label={`${label}: ${(confidence.reasons ?? []).join('; ')}`}
          data-confidence={confidence.level}
          className={`inline-block size-2 shrink-0 rounded-full ${confidence.level === 'low' ? 'bg-warning' : 'border border-muted'}`}
        />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={4}
          className="animate-pop z-50 max-w-[240px] rounded-control border border-border-strong bg-surface-3 px-2 py-1 text-sm text-text shadow-elevated"
        >
          <p className="font-medium">{label}</p>
          <ul className="mt-0.5 text-muted">
            {(confidence.reasons ?? []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Swatch over a checkerboard so alpha shows, with the effective color as a second chip (F9). */
export function CheckerSwatch({ hex, effectiveHex, size = 20 }) {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      <span
        className="checker relative overflow-hidden rounded-swatch"
        style={{ width: size, height: size }}
      >
        <span className="absolute inset-0" style={{ background: hex }} />
        <span className="pointer-events-none absolute inset-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" />
      </span>
      {effectiveHex && (
        <span className="relative size-3 rounded-swatch" style={{ background: effectiveHex }}>
          <span className="pointer-events-none absolute inset-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" />
        </span>
      )}
    </span>
  );
}

export function GradientStrip({ css }) {
  return (
    <span
      className="relative block h-4 w-full rounded-swatch"
      style={{ backgroundImage: css }}
      aria-hidden
    >
      <span className="pointer-events-none absolute inset-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" />
    </span>
  );
}

/** 48 x 32 px SVG of an easing curve; the dot travels it on hover unless reduced motion. */
export function CurvePreview({ bezier }) {
  if (!bezier)
    return <span className="h-8 w-12 shrink-0 rounded-swatch bg-surface-2" aria-hidden />;
  const [x1, y1, x2, y2] = bezier;
  const W = 44;
  const H = 28;
  const px = (x) => 2 + x * W;
  const py = (y) => 2 + (1 - y) * H;
  const d = `M${px(0)},${py(0)} C${px(x1)},${py(y1)} ${px(x2)},${py(y2)} ${px(1)},${py(1)}`;
  return (
    <svg
      width="48"
      height="32"
      viewBox="0 0 48 32"
      className="curve shrink-0 overflow-visible rounded-swatch bg-surface-2"
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
      <circle
        r="2"
        cx="0"
        cy="0"
        className="curve-dot fill-text"
        style={{ offsetPath: `path('${d}')` }}
      />
    </svg>
  );
}

/**
 * Segmented control on Radix ToggleGroup; arrow keys move (ModeSwitch, StateSwitcher).
 * @param {{label: string, value: string, onChange: (v: string) => void, options: Array<{value: string, label: string, disabled?: boolean}>}} props
 */
export function Segmented({ label, value, onChange, options, className = '' }) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className={`inline-flex h-7 shrink-0 items-center rounded-control border border-border bg-surface p-0.5 ${className}`}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className="transition-quick h-full rounded-[4px] px-2 text-sm text-muted hover:text-text disabled:text-faint disabled:opacity-50 data-[state=on]:bg-surface-3 data-[state=on]:text-text"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** Labelled switch row. */
export function SwitchRow({ id, label, description, checked, onChange, disabled, trailing }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <Switch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="transition-quick relative h-4 w-7 shrink-0 rounded-full bg-surface-3 data-[state=checked]:bg-accent disabled:opacity-40"
      >
        <Switch.Thumb className="transition-quick block size-3 translate-x-0.5 rounded-full bg-text data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-on-accent" />
      </Switch.Root>
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-text">{label}</span>
        {description && <span className="block text-sm text-faint">{description}</span>}
      </label>
      {trailing}
    </div>
  );
}

/** Count with label and an expandable list (Insights). */
export function StatCard({ label, items }) {
  const [open, setOpen] = useState(false);
  const expandable = (items ?? []).length > 0;
  return (
    <li className="rounded-card border border-border bg-surface">
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setOpen(!open)}
        className="flex min-h-8 w-full items-center gap-2 px-3 py-1.5 text-left text-text disabled:cursor-default"
      >
        <span className="min-w-0 flex-1">{label}</span>
        {expandable && (
          <ChevronRight size={14} className={`text-faint ${open ? 'rotate-90' : ''}`} aria-hidden />
        )}
      </button>
      {open && (
        <ul className="border-t border-border px-3 py-2 font-mono text-sm text-muted">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Label, status and a Grant or Revoke button (Settings). */
export function PermissionRow({ label, granted, onGrant, onRevoke }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span className="min-w-0 flex-1">
        <span className="block text-text">{label}</span>
        <span className="block text-sm text-faint">
          {granted ? t('permission_granted') : t('permission_not_granted')}
        </span>
      </span>
      <button
        type="button"
        onClick={granted ? onRevoke : onGrant}
        className="transition-quick h-7 rounded-control border border-border bg-surface-2 px-2 text-sm text-text hover:border-border-strong"
      >
        {granted ? t('revoke') : t('grant')}
      </button>
    </div>
  );
}

export function LevelBadge({ level }) {
  const tone = level === 'fail' ? 'danger' : level === 'AA-large' ? 'warning' : 'success';
  return <RoleBadge role={level === 'fail' ? t('fail') : level} tone={tone} />;
}

/** Lowest confidence score first; tokens without a score keep their place at the end (F28). */
export function lowFirst(list, on) {
  if (!on) return list;
  const score = (x) => x.confidence?.score ?? Infinity;
  return [...list].sort((a, b) => score(a) - score(b));
}

/** "Low confidence first" switch shared by the token lists; the choice lives in the store. */
export function LowFirstToggle({ id }) {
  const checked = useStore((s) => s.sortLowFirst);
  const setSortLowFirst = useStore((s) => s.setSortLowFirst);
  return (
    <SwitchRow id={id} label={t('sort_low_first')} checked={checked} onChange={setSortLowFirst} />
  );
}
