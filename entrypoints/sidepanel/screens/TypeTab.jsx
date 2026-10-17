import { formatFontStack } from '../../../src/analyze/units.js';
import { S } from '../strings.js';
import { SectionLabel } from '../components/Basics.jsx';
import { TokenRow } from '../components/TokenRow.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

export function TypeTab({ design }) {
  const { families, sizes } = design.typography;
  const familyById = new Map(families.map((f) => [f.id, f]));
  const visibleSizes = sizes.filter((s) => !s.excluded).sort((a, b) => b.sizePx - a.sizePx);
  const sizeRow = (s) => {
    const family = familyById.get(s.familyId);
    const stack = family && !family.excluded ? formatFontStack(family.stack) : undefined;
    const isHeading = s.headings.length > 0;
    return (
      <TokenRow
        key={s.id}
        token={s}
        category="text"
        siblings={sizes}
        detail={`${s.sizePx}/${s.lineHeightPx ?? 'normal'} ${s.weight}${isHeading ? ` ${s.headings.join(' ')}` : ''}`}
      >
        <span
          className="min-w-0 flex-1 truncate text-text"
          style={{
            fontFamily: stack,
            fontSize: Math.min(s.sizePx, 28),
            fontWeight: s.weight,
            lineHeight: 1.2,
          }}
          aria-hidden
        >
          {isHeading ? S.headingSample : S.bodySample}
        </span>
      </TokenRow>
    );
  };

  if (families.length === 0 && sizes.length === 0)
    return <p className="mt-6 text-muted">{S.nothingFound}</p>;

  return (
    <>
      <SectionLabel count={families.filter((f) => !f.excluded).length}>{S.families}</SectionLabel>
      <ul className="flex flex-col">
        {families
          .filter((f) => !f.excluded)
          .map((f) => (
            <TokenRow
              key={f.id}
              token={f}
              category="font"
              siblings={families}
              detail={formatFontStack(f.stack)}
            />
          ))}
      </ul>
      <ExcludedGroup
        tokens={families.filter((f) => f.excluded)}
        render={(f) => (
          <TokenRow
            key={f.id}
            token={f}
            category="font"
            siblings={families}
            detail={formatFontStack(f.stack)}
            menuVisible
          />
        )}
      />

      <SectionLabel count={visibleSizes.length}>{S.scale}</SectionLabel>
      <ul className="flex flex-col">{visibleSizes.map(sizeRow)}</ul>
      <ExcludedGroup tokens={sizes.filter((s) => s.excluded)} render={sizeRow} />
      <p className="mt-3 text-sm text-faint">{S.fontsNote}</p>
    </>
  );
}
