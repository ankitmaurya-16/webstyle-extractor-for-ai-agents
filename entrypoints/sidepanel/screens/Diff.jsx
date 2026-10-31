import { useState } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import { useStore } from '../store.js';
import { shortDate, t } from '../../../src/i18n.js';
import { Button } from '../components/Button.jsx';
import { RoleBadge, SectionLabel, Segmented } from '../components/Basics.jsx';
import { Header } from '../components/Header.jsx';

const FILTERS = ['all', 'added', 'removed', 'changed', 'renamed'];
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6,8}$/i.test(v.split(' ').pop());
const hexOf = (v) => String(v).split(' ').pop();

function Chip({ value }) {
  if (!isHex(value)) return null;
  return (
    <span
      className="size-3 shrink-0 rounded-swatch ring-1 ring-swatch-ring ring-inset"
      style={{ background: hexOf(value) }}
      aria-hidden
    />
  );
}

/** Old and new values with an arrow, a status badge and the distance (DiffRow). */
function DiffRow({ status, name, from, to, delta }) {
  return (
    <li className="flex min-h-8 items-center gap-1.5 px-1 font-mono text-sm" data-status={status}>
      <RoleBadge
        role={t(`filter_${status}`)}
        tone={status === 'added' ? 'success' : status === 'removed' ? 'danger' : 'neutral'}
      />
      <span className="shrink-0 text-text">{name}</span>
      <Chip value={from} />
      {from !== undefined && <span className="min-w-0 truncate text-muted">{from ?? '—'}</span>}
      {to !== undefined && <ArrowRight size={12} className="shrink-0 text-faint" aria-hidden />}
      <Chip value={to} />
      {to !== undefined && <span className="min-w-0 truncate text-text">{to ?? '—'}</span>}
      {delta !== null && delta !== undefined && (
        <span className="ml-auto shrink-0 text-faint">({delta})</span>
      )}
    </li>
  );
}

export function Diff() {
  const diff = useStore((s) => s.diff);
  const { goBack, exportDiff } = useStore.getState();
  const [filter, setFilter] = useState('all');
  if (!diff) return null;
  const { result } = diff;
  const c = result.counts;
  const show = (status) => filter === 'all' || filter === status;
  const empty =
    c.added + c.removed + c.changed + c.renamed === 0 &&
    result.roles.length === 0 &&
    result.recipes.length === 0;

  return (
    <>
      <Header onBack={goBack} title={t('diff_title')} />
      <main className="p-4 pt-2 pb-16">
        <p className="flex flex-wrap gap-x-3 text-sm text-muted">
          <span>
            A {diff.a.hostname} · {shortDate(diff.a.capturedAt)}
          </span>
          <span>
            B {diff.b.hostname} · {shortDate(diff.b.capturedAt)}
          </span>
        </p>
        <p className="mt-1 text-text">
          {t('diff_counts', c.added, c.removed, c.changed, c.renamed)}
        </p>
        <Segmented
          className="mt-3"
          label={t('diff_title')}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f, label: t(`filter_${f}`) }))}
        />
        {empty && <p className="mt-6 text-muted">{t('no_differences')}</p>}
        {Object.entries(result.categories).map(([category, d]) => {
          const rows = [
            ...(show('added')
              ? d.added.map((x) => ({ status: 'added', name: x.name, to: x.value }))
              : []),
            ...(show('removed')
              ? d.removed.map((x) => ({ status: 'removed', name: x.name, from: x.value }))
              : []),
            ...(show('changed')
              ? d.changed.map((x) => ({
                  status: 'changed',
                  name: x.name,
                  from: x.from,
                  to: x.to,
                  delta: x.delta,
                }))
              : []),
            ...(show('renamed')
              ? d.renamed.map((x) => ({ status: 'renamed', name: x.to, from: x.from, to: x.value }))
              : []),
          ];
          if (!rows.length) return null;
          return (
            <section key={category}>
              <SectionLabel count={rows.length}>{category}</SectionLabel>
              <ul>
                {rows.map((r, i) => (
                  <DiffRow key={`${r.status}-${r.name}-${i}`} {...r} />
                ))}
              </ul>
            </section>
          );
        })}
        {filter === 'all' && result.roles.length > 0 && (
          <section>
            <SectionLabel count={result.roles.length}>{t('role_changes')}</SectionLabel>
            <ul>
              {result.roles.map((r) => (
                <DiffRow
                  key={`${r.role}-${r.mode}`}
                  status="changed"
                  name={`${r.role} (${t(r.mode)})`}
                  from={r.from}
                  to={r.to}
                  delta={r.delta}
                />
              ))}
            </ul>
          </section>
        )}
        {filter === 'all' && result.recipes.length > 0 && (
          <section>
            <SectionLabel count={result.recipes.length}>{t('recipe_changes')}</SectionLabel>
            <ul>
              {result.recipes.map((r, i) => (
                <DiffRow
                  key={`${r.id}-${r.prop ?? r.change}-${r.mode ?? ''}-${r.state ?? ''}-${i}`}
                  status={r.change ?? 'changed'}
                  name={r.prop ? `${r.name} ${r.state} ${r.prop}` : r.name}
                  from={r.change ? undefined : r.from}
                  to={r.change ? undefined : r.to}
                />
              ))}
            </ul>
          </section>
        )}
        {filter === 'all' &&
          Object.values(result.stack ?? {}).some((s) => s.added.length || s.removed.length) && (
            <section>
              <SectionLabel>{t('stack_changes')}</SectionLabel>
              <ul>
                {Object.entries(result.stack).flatMap(([kind, s]) => [
                  ...s.added.map((name) => (
                    <DiffRow key={`${kind}+${name}`} status="added" name={`${kind}: ${name}`} />
                  )),
                  ...s.removed.map((name) => (
                    <DiffRow key={`${kind}-${name}`} status="removed" name={`${kind}: ${name}`} />
                  )),
                ])}
              </ul>
            </section>
          )}
        <Button variant="secondary" className="mt-6" onClick={exportDiff}>
          <Download size={16} aria-hidden />
          {t('export_diff')}
        </Button>
      </main>
    </>
  );
}
