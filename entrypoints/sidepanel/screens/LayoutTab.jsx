import { S } from '../strings.js';
import { Banner, SectionLabel } from '../components/Basics.jsx';
import { TokenRow } from '../components/TokenRow.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

const FULL = 9999;

export function LayoutTab({ design }) {
  const spacing = design.spacing.tokens;
  const sheets = design.meta.stylesheets ?? { readable: 0, unreadable: 0 };
  const noReadable = sheets.readable === 0;
  const visible = (list) =>
    list.filter((t) => !t.excluded).sort((a, b) => (a.px ?? a.blurPx) - (b.px ?? b.blurPx));
  const maxSpace = Math.max(1, ...visible(spacing).map((s) => s.px));

  const spaceRow = (s) => (
    <TokenRow key={s.id} token={s} category="space" siblings={spacing} detail={`${s.px}px`}>
      <span className="h-2 min-w-0 flex-1" aria-hidden>
        <span
          className="block h-2 rounded-swatch bg-accent/60"
          style={{ width: `${Math.max(2, (s.px / maxSpace) * 100)}%` }}
        />
      </span>
    </TokenRow>
  );
  const radiusRow = (r) => (
    <TokenRow
      key={r.id}
      token={r}
      category="radius"
      siblings={design.radii}
      detail={r.px >= FULL ? 'full' : `${r.px}px`}
      leading={
        <span
          className="size-5 shrink-0 border border-border-strong bg-surface-3"
          style={{ borderRadius: Math.min(r.px, 10) }}
          aria-hidden
        />
      }
    />
  );
  const shadowRow = (s) => (
    <TokenRow
      key={s.id}
      token={s}
      category="shadow"
      siblings={design.shadows}
      detail={s.value}
      leading={
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-swatch bg-preview"
          aria-hidden
        >
          <span className="size-4 rounded-[3px] bg-preview" style={{ boxShadow: s.value }} />
        </span>
      }
    />
  );
  const breakpointRow = (b) => (
    <TokenRow
      key={b.id}
      token={b}
      category="breakpoint"
      siblings={design.breakpoints}
      detail={`${b.px}px`}
    />
  );

  return (
    <>
      {design.meta.partial.length > 0 && (
        <Banner>{noReadable ? S.partialNone : S.partial(sheets.unreadable)}</Banner>
      )}
      <SectionLabel count={visible(spacing).length}>
        {S.spacing} · {design.spacing.baseUnitPx ? S.baseUnit(design.spacing.baseUnitPx) : S.noBase}
      </SectionLabel>
      <ul className="flex flex-col">{visible(spacing).map(spaceRow)}</ul>
      <ExcludedGroup tokens={spacing.filter((t) => t.excluded)} render={spaceRow} />

      <SectionLabel count={visible(design.radii).length}>{S.radius}</SectionLabel>
      <ul className="flex flex-col">{visible(design.radii).map(radiusRow)}</ul>
      <ExcludedGroup tokens={design.radii.filter((t) => t.excluded)} render={radiusRow} />

      <SectionLabel count={visible(design.shadows).length}>{S.shadows}</SectionLabel>
      <ul className="flex flex-col">{visible(design.shadows).map(shadowRow)}</ul>
      <ExcludedGroup tokens={design.shadows.filter((t) => t.excluded)} render={shadowRow} />

      <SectionLabel count={visible(design.breakpoints).length}>{S.breakpoints}</SectionLabel>
      {noReadable && design.breakpoints.length === 0 ? (
        <p className="px-1 text-muted">{S.notReadable}</p>
      ) : (
        <ul className="flex flex-col">{visible(design.breakpoints).map(breakpointRow)}</ul>
      )}
      <ExcludedGroup tokens={design.breakpoints.filter((t) => t.excluded)} render={breakpointRow} />
    </>
  );
}
