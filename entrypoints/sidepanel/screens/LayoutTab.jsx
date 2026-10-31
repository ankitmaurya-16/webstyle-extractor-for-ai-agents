import { visible } from '../../../src/model/design.js';
import { t } from '../../../src/i18n.js';
import { Banner, SectionLabel } from '../components/Basics.jsx';
import { TokenRow } from '../components/TokenRow.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

const FULL = 9999;
const sortBy = (key) => (list) => visible(list).sort((a, b) => a[key] - b[key]);

/** A section of token rows with its excluded group; nothing when the list is empty. */
function Section({ label, list, render, empty, count = true }) {
  const shown = visible(list);
  if ((list ?? []).length === 0 && !empty) return null;
  return (
    <>
      <SectionLabel count={count ? shown.length : undefined}>{label}</SectionLabel>
      {shown.length === 0 && empty ? (
        <p className="px-1 text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col">{render.sorted(list).map(render.row)}</ul>
      )}
      <ExcludedGroup tokens={(list ?? []).filter((x) => x.excluded)} render={render.row} />
    </>
  );
}

function Bar({ value, max }) {
  return (
    <span className="h-2 min-w-0 flex-1" aria-hidden>
      <span
        className="block h-2 rounded-swatch bg-accent/60"
        style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
      />
    </span>
  );
}

export function LayoutTab({ design }) {
  const spacing = design.spacing.tokens;
  const layout = design.layout ?? { containers: [], gridColumns: [], gaps: [] };
  const sheets = design.meta.stylesheets ?? { readable: 0, unreadable: 0 };
  const noReadable = sheets.readable === 0;
  const maxSpace = Math.max(1, ...visible(spacing).map((s) => s.px));
  const maxContainer = Math.max(1, ...visible(layout.containers).map((s) => s.px));

  const px = (key, list, category, extra = {}) => ({
    sorted: sortBy(key),
    row: (x) => (
      <TokenRow
        key={x.id}
        token={x}
        category={category}
        siblings={list}
        detail={extra.detail ? extra.detail(x) : `${x[key]}px`}
        leading={extra.leading?.(x)}
      >
        {extra.children?.(x)}
      </TokenRow>
    ),
  });

  return (
    <>
      {design.meta.partial.length > 0 && (
        <Banner>{noReadable ? t('partial_none') : t('partial_sheets', sheets.unreadable)}</Banner>
      )}
      <Section
        label={`${t('spacing')} · ${design.spacing.baseUnitPx ? t('base_unit', design.spacing.baseUnitPx) : t('no_base')}`}
        list={spacing}
        render={px('px', spacing, 'space', {
          children: (s) => <Bar value={s.px} max={maxSpace} />,
        })}
      />
      <Section
        label={t('containers')}
        list={layout.containers}
        render={px('px', layout.containers, 'container', {
          children: (s) => <Bar value={s.px} max={maxContainer} />,
        })}
      />
      <Section
        label={t('grid')}
        list={layout.gridColumns}
        render={px('value', layout.gridColumns, 'grid', {
          detail: (g) => t('columns', g.value),
          leading: (g) => (
            <span className="flex h-5 w-8 shrink-0 gap-px" aria-hidden>
              {Array.from({ length: Math.min(g.value, 12) }, (_, i) => (
                <span key={i} className="flex-1 rounded-[1px] bg-surface-3" />
              ))}
            </span>
          ),
        })}
      />
      <Section label={t('gaps')} list={layout.gaps} render={px('px', layout.gaps, 'gap')} />
      <Section
        label={t('radius')}
        list={design.radii}
        render={px('px', design.radii, 'radius', {
          detail: (r) => (r.px >= FULL ? 'full' : `${r.px}px`),
          leading: (r) => (
            <span
              className="size-5 shrink-0 border border-border-strong bg-surface-3"
              style={{ borderRadius: Math.min(r.px, 10) }}
              aria-hidden
            />
          ),
        })}
      />
      <Section
        label={
          design.meta.borderStyle ? `${t('borders')} · ${design.meta.borderStyle}` : t('borders')
        }
        list={design.borderWidths}
        render={px('px', design.borderWidths, 'border', {
          leading: (b) => (
            <span
              className="size-5 shrink-0 rounded-swatch border-border-strong"
              style={{ borderWidth: Math.min(b.px, 4), borderStyle: 'solid' }}
              aria-hidden
            />
          ),
        })}
      />
      <Section
        label={t('shadows')}
        list={design.shadows}
        render={px('blurPx', design.shadows, 'shadow', {
          detail: (s) => s.value,
          leading: (s) => (
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-swatch bg-preview"
              aria-hidden
            >
              <span className="size-4 rounded-[3px] bg-preview" style={{ boxShadow: s.value }} />
            </span>
          ),
        })}
      />
      <Section
        label={t('opacity')}
        list={design.opacities}
        render={px('value', design.opacities, 'opacity', {
          detail: (o) => String(o.value),
          leading: (o) => (
            <span
              className="size-5 shrink-0 rounded-swatch bg-text"
              style={{ opacity: o.value }}
              aria-hidden
            />
          ),
        })}
      />
      <Section
        label={t('z_index')}
        list={design.zIndex}
        render={{
          sorted: (list) => visible(list).sort((a, b) => b.value - a.value),
          row: (z) => (
            <TokenRow
              key={z.id}
              token={z}
              category="z"
              siblings={design.zIndex}
              detail={String(z.value)}
            />
          ),
        }}
      />
      <Section
        label={t('breakpoints')}
        list={design.breakpoints}
        empty={noReadable ? t('not_readable') : undefined}
        render={px('px', design.breakpoints, 'breakpoint')}
      />
      {design.responsive && <ResponsiveTable table={design.responsive} design={design} />}
    </>
  );
}

function ResponsiveTable({ table, design }) {
  const sizeName = (id) => design.typography.sizes.find((s) => s.id === id)?.name;
  const rows = [
    ...table.textSizes.map((r) => [
      r.label + (sizeName(r.tokenId) ? ` (${sizeName(r.tokenId)})` : ''),
      r.byWidth,
      'px',
    ]),
    [t('container_label'), table.containers, 'px'],
    [t('grid_columns_label'), table.gridColumns, ''],
    [t('spacing_base_label'), table.spacingBase, 'px'],
  ];
  return (
    <>
      <SectionLabel>{t('responsive')}</SectionLabel>
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="bg-surface text-faint">
              <th className="px-2 py-1 text-left font-normal" scope="col">
                {t('layout_label')}
              </th>
              {table.widths.map((w) => (
                <th key={w} className="px-2 py-1 text-right font-normal" scope="col">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, byWidth, unit]) => (
              <tr key={label} className="border-t border-border">
                <th className="px-2 py-1 text-left font-normal text-muted" scope="row">
                  {label}
                </th>
                {table.widths.map((w) => (
                  <td key={w} className="px-2 py-1 text-right text-text">
                    {byWidth?.[w] === null || byWidth?.[w] === undefined
                      ? '—'
                      : `${byWidth[w]}${unit}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
