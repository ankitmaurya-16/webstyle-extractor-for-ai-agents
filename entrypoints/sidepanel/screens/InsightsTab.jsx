import { useState } from 'react';
import { findToken } from '../../../src/model/design.js';
import { formatNumber, t } from '../../../src/i18n.js';
import { LevelBadge, RoleBadge, SectionLabel, StatCard, SwitchRow } from '../components/Basics.jsx';

const NON_TEXT = { 'focus-ring': 'focus_ring_vs_bg', 'input-border': 'input_border_vs_bg' };

function Detection({ items, extra }) {
  if (!items?.length) return <p className="px-1 text-muted">{t('none_detected')}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((d) => (
        <li key={d.id ?? d.name} className="flex min-h-8 flex-wrap items-center gap-x-2 px-1">
          <span className="text-text">
            {d.name}
            {d.version ? ` ${d.version}` : ''}
          </span>
          <RoleBadge
            role={d.confidence?.level ?? 'low'}
            tone={
              d.confidence?.level === 'high'
                ? 'success'
                : d.confidence?.level === 'low'
                  ? 'warning'
                  : 'neutral'
            }
          />
          {extra?.(d)}
          <span className="w-full truncate font-mono text-[11px] text-faint">
            {(d.evidence ?? d.confidence?.reasons ?? []).join(', ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InsightsTab({ design }) {
  const [failingOnly, setFailingOnly] = useState(false);
  const name = (id) => findToken(design, id)?.token.name ?? id;
  const hex = (id) => findToken(design, id)?.token.hex;
  const contrast = (design.contrast ?? []).filter((c) => !failingOnly || c.level === 'fail');
  const audit = design.audit ?? {};
  const coverage = design.meta.coverage ?? {};
  const lowConfidence = audit.lowConfidence ?? [];

  return (
    <>
      <SectionLabel>{t('framework')}</SectionLabel>
      <Detection items={design.meta.framework} />

      <SectionLabel>{t('icons')}</SectionLabel>
      <Detection
        items={design.meta.icons}
        extra={() =>
          design.meta.iconSizePx && (
            <span className="font-mono text-sm text-muted">
              {t('icon_size', design.meta.iconSizePx, design.meta.iconStroke ?? '—')}
            </span>
          )
        }
      />

      <SectionLabel
        action={
          <SwitchRow
            id="failing-only"
            label={t('failing_only')}
            checked={failingOnly}
            onChange={setFailingOnly}
          />
        }
      >
        {t('accessibility')}
      </SectionLabel>
      {contrast.length === 0 && <p className="px-1 text-muted">{t('nothing_found')}</p>}
      <ul className="flex flex-col">
        {contrast.map((c) => (
          <li
            key={`${c.mode}|${c.textTokenId}|${c.backgroundTokenId}|${c.large}`}
            className="flex min-h-8 items-center gap-2 px-1"
            data-level={c.level}
          >
            <span
              className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded-swatch font-semibold ring-1 ring-swatch-ring"
              style={{ color: hex(c.textTokenId), background: hex(c.backgroundTokenId) }}
              aria-hidden
            >
              {t('contrast_sample')}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-text">
              {name(c.textTokenId)} / {name(c.backgroundTokenId)}
              {design.meta.modes?.length > 1 ? ` · ${t(c.mode)}` : ''}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-sm text-muted">
              {formatNumber(c.ratio, { maximumFractionDigits: 1 })}
            </span>
            <LevelBadge level={c.level} />
          </li>
        ))}
      </ul>
      {(design.nonTextContrast ?? []).length > 0 && (
        <>
          <SectionLabel as="h3">{t('non_text_checks')}</SectionLabel>
          <ul className="flex flex-col">
            {design.nonTextContrast.map((c) => (
              <li key={c.check} className="flex min-h-8 items-center gap-2 px-1">
                <span className="min-w-0 flex-1 text-text">
                  {t(NON_TEXT[c.check] ?? 'non_text_checks')}
                </span>
                <span className="font-mono text-sm text-muted">
                  {formatNumber(c.ratio, { maximumFractionDigits: 1 })}
                </span>
                <RoleBadge
                  role={c.pass ? t('pass') : t('fail')}
                  tone={c.pass ? 'success' : 'danger'}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionLabel>{t('consistency')}</SectionLabel>
      <ul className="flex flex-col gap-1">
        <StatCard
          label={t('colors_merged', audit.colorsBeforeMerge ?? 0, audit.colorsAfterMerge ?? 0)}
          items={(audit.nearDuplicateGroups ?? []).map((g) => `${g.kept} ← ${g.merged.join(', ')}`)}
        />
        <StatCard
          label={t('off_scale', (audit.offScaleSpacing ?? []).length)}
          items={(audit.offScaleSpacing ?? []).map((o) => `${o.px}px`)}
        />
        <StatCard
          label={t('distinct_counts')}
          items={Object.entries(audit.distinct ?? {}).map(([k, v]) => `${k}: ${v}`)}
        />
        <StatCard
          label={t('contrast_failures', audit.contrastFailures ?? 0)}
          items={(audit.contrastFailureList ?? []).map((f) =>
            typeof f === 'string'
              ? f
              : `${name(f.textTokenId)} / ${name(f.backgroundTokenId)} ${f.ratio}`,
          )}
        />
        {audit.missingFocusStyle && <StatCard label={t('focus_missing')} />}
        {(audit.variableConflicts ?? []).length > 0 && (
          <StatCard
            label={t('variable_conflicts', audit.variableConflicts.length)}
            items={audit.variableConflicts.map((v) => (typeof v === 'string' ? v : v.name))}
          />
        )}
      </ul>

      <SectionLabel count={lowConfidence.length}>{t('check_first')}</SectionLabel>
      {lowConfidence.length === 0 ? (
        <p className="px-1 text-muted">{t('none_detected')}</p>
      ) : (
        <ul className="flex flex-col">
          {lowConfidence.slice(0, 12).map((id) => {
            const found =
              findToken(design, id) ??
              (design.components.find((r) => r.id === id)
                ? { token: design.components.find((r) => r.id === id) }
                : null);
            const reasons = found?.token.confidence?.reasons ?? [];
            return (
              <li key={id} className="flex min-h-8 items-center gap-2 px-1">
                <span className="shrink-0 font-mono text-sm text-text">
                  {found?.token.name ?? id}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-faint">
                  {reasons.join(' · ')}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 px-1 text-sm text-faint" data-testid="coverage-line">
        {t(
          'coverage_line',
          coverage.frames?.read ?? 0,
          coverage.frames?.skipped ?? 0,
          coverage.shadowRoots ?? 0,
        )}
        {coverage.autoScrolled ? ` · ${t('auto_scrolled')}` : ''}
      </p>
    </>
  );
}
