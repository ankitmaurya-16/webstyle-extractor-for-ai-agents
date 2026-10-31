import { formatFontStack } from '../../../src/analyze/units.js';
import { visible } from '../../../src/model/design.js';
import { t } from '../../../src/i18n.js';
import { SectionLabel } from '../components/Basics.jsx';
import { TokenRow } from '../components/TokenRow.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

const PROVIDERS = {
  'google-fonts': 'provider_google_fonts',
  'adobe-fonts': 'provider_adobe_fonts',
  'self-hosted': 'provider_self_hosted',
};

export function providerLabel(font) {
  if (!font?.provider) return t('provider_unknown');
  if (PROVIDERS[font.provider]) return t(PROVIDERS[font.provider]);
  return t('provider_other', font.providerHost ?? '');
}

export function TypeTab({ design }) {
  const { families, sizes, textStyles = [], letterSpacings = [] } = design.typography;
  const familyById = new Map(families.map((f) => [f.id, f]));
  const visibleSizes = visible(sizes).sort((a, b) => b.sizePx - a.sizePx);
  const webFonts = design.meta.webFonts ?? [];
  const stackOf = (id) => {
    const family = familyById.get(id);
    return family && !family.excluded ? formatFontStack(family.stack) : undefined;
  };

  const sizeRow = (s) => {
    const isHeading = s.headings.length > 0;
    return (
      <TokenRow
        key={s.id}
        token={s}
        category="text"
        siblings={sizes}
        detail={`${s.sizePx}/${s.lineHeightPx ?? 'normal'} ${s.fontWeight}${isHeading ? ` ${s.headings.join(' ')}` : ''}`}
      >
        <span
          className="min-w-0 flex-1 truncate text-text"
          style={{
            fontFamily: stackOf(s.familyId),
            fontSize: Math.min(s.sizePx, 28),
            fontWeight: s.fontWeight,
            lineHeight: 1.2,
          }}
          aria-hidden
        >
          {isHeading ? t('heading_sample') : t('body_sample')}
        </span>
      </TokenRow>
    );
  };
  const familyRow = (f) => (
    <TokenRow
      key={f.id}
      token={f}
      category="font"
      siblings={families}
      detail={`${formatFontStack(f.stack)}${f.webFont ? ` · ${providerLabel(f.webFont)}` : ` · ${t('system_font')}`}`}
    />
  );
  const styleRow = (s) => (
    <TokenRow
      key={s.id}
      token={s}
      category="textStyle"
      siblings={textStyles}
      detail={`${s.sizePx}/${s.lineHeightPx ?? 'normal'} ${s.fontWeight}${s.letterSpacingEm ? ` ${s.letterSpacingEm}em` : ''}${s.textTransform && s.textTransform !== 'none' ? ` ${s.textTransform}` : ''}`}
    >
      <span
        className="min-w-0 flex-1 truncate text-text"
        style={{
          fontFamily: stackOf(s.familyId) ?? s.family,
          fontSize: Math.min(s.sizePx, 24),
          fontWeight: s.fontWeight,
          letterSpacing: `${s.letterSpacingEm}em`,
          textTransform: s.textTransform,
          lineHeight: 1.2,
        }}
        aria-hidden
      >
        {t('style_sample')}
      </span>
    </TokenRow>
  );
  const trackingRow = (x) => (
    <TokenRow
      key={x.id}
      token={x}
      category="tracking"
      siblings={letterSpacings}
      detail={`${x.em}em`}
    />
  );

  if (families.length === 0 && sizes.length === 0)
    return <p className="mt-6 text-muted">{t('nothing_found')}</p>;

  return (
    <>
      <SectionLabel count={visible(families).length}>{t('families')}</SectionLabel>
      <ul className="flex flex-col">{visible(families).map(familyRow)}</ul>
      <ExcludedGroup tokens={families.filter((f) => f.excluded)} render={familyRow} />

      {webFonts.length > 0 && (
        <>
          <SectionLabel as="h3" count={webFonts.length}>
            {t('web_fonts')}
          </SectionLabel>
          <ul className="flex flex-col gap-1 rounded-card border border-border bg-surface p-2">
            {webFonts.map((f) => (
              <li key={f.family} className="flex items-center gap-2 font-mono text-sm">
                <span className="min-w-0 flex-1 truncate text-text">{f.family}</span>
                <span className="shrink-0 text-faint">{(f.weights ?? []).join(' ')}</span>
                <span className="shrink-0 text-muted">{providerLabel(f)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {visible(textStyles).length > 0 && (
        <>
          <SectionLabel count={visible(textStyles).length}>{t('text_styles')}</SectionLabel>
          <ul className="flex flex-col">{visible(textStyles).map(styleRow)}</ul>
          <ExcludedGroup tokens={textStyles.filter((s) => s.excluded)} render={styleRow} />
        </>
      )}

      <SectionLabel count={visibleSizes.length}>{t('scale')}</SectionLabel>
      <ul className="flex flex-col">{visibleSizes.map(sizeRow)}</ul>
      <ExcludedGroup tokens={sizes.filter((s) => s.excluded)} render={sizeRow} />

      {visible(letterSpacings).length > 0 && (
        <>
          <SectionLabel count={visible(letterSpacings).length}>{t('letter_spacing')}</SectionLabel>
          <ul className="flex flex-col">{visible(letterSpacings).map(trackingRow)}</ul>
          <ExcludedGroup tokens={letterSpacings.filter((s) => s.excluded)} render={trackingRow} />
        </>
      )}
      <p className="mt-3 text-sm text-faint">{t('fonts_note')}</p>
    </>
  );
}
