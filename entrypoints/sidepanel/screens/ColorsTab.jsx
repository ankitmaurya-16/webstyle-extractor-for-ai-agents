import { useState } from 'react';
import { HUE_FAMILIES, STEPS } from '../../../src/model/types.js';
import { modesOf, rolesOf, semanticRows, visible } from '../../../src/model/design.js';
import { t } from '../../../src/i18n.js';
import {
  CheckerSwatch,
  ConfidenceDot,
  GradientStrip,
  RoleBadge,
  SectionLabel,
  UsageBar,
} from '../components/Basics.jsx';
import { HighlightButton, TokenRow } from '../components/TokenRow.jsx';
import { TokenMenu } from '../components/TokenMenu.jsx';
import { Swatch } from '../components/Swatch.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

export function ColorsTab({ design, mode }) {
  const colors = design.colors;
  const shown = visible(colors);
  const opaque = shown.filter((c) => c.alpha >= 1);
  const translucent = shown.filter((c) => c.alpha < 1);
  const modes = modesOf(design);
  const rows = semanticRows(design);
  const scaled = HUE_FAMILIES.map((family) => [
    family,
    opaque.filter((c) => c.family === family && c.step !== null),
  ]).filter(([, list]) => list.length > 0);
  const others = opaque.filter((c) => c.step === null);
  const gradients = visible(design.gradients);
  const [selected, setSelected] = useState(null);
  const roles = (token) => rolesOf(design, token.id, mode);

  if (colors.length === 0) return <p className="mt-6 text-muted">{t('nothing_found')}</p>;

  return (
    <>
      <SectionLabel count={rows.length}>{t('semantic')}</SectionLabel>
      <ul className="flex flex-col">
        {rows.map(({ role, byMode }) => {
          const token = byMode[mode] ?? Object.values(byMode).find(Boolean);
          const confidence = design.roleConfidence?.[role]?.[mode];
          return (
            <li
              key={role}
              className="group flex min-h-8 items-center gap-1.5 rounded-control px-1 hover:bg-surface"
              data-role={role}
            >
              <span className="flex shrink-0 gap-0.5">
                {modes.map((m) =>
                  byMode[m] ? (
                    <Swatch key={m} hex={byMode[m].hex} />
                  ) : (
                    <span
                      key={m}
                      className="size-5 rounded-swatch border border-dashed border-border"
                    />
                  ),
                )}
              </span>
              <RoleBadge role={role} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-sm text-text">
                  {modes.map((m) => byMode[m]?.name ?? '—').join(' · ')}
                </span>
                {token?.siteVariable && (
                  <span className="truncate font-mono text-[11px] text-faint">
                    {token.siteVariable}
                  </span>
                )}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <ConfidenceDot confidence={confidence} />
                {token && <UsageBar share={token.usageShare} />}
                {token && <HighlightButton tokenId={token.id} name={token.name} />}
                {token && <TokenMenu token={token} category="color" siblings={colors} />}
              </span>
            </li>
          );
        })}
      </ul>
      {!rows.some((r) => r.role === 'primary') && (
        <p className="mt-1 px-1 text-muted">{t('no_primary')}</p>
      )}

      <SectionLabel count={opaque.length}>{t('scales')}</SectionLabel>
      <div className="flex flex-col gap-3">
        {scaled.map(([family, list]) => (
          <div key={family}>
            <ScaleStrip family={family} tokens={list} selected={selected} onSelect={setSelected} />
            {list
              .filter((x) => x.id === selected)
              .map((x) => (
                <ul key={x.id} className="mt-1">
                  <TokenRow
                    token={x}
                    category="color"
                    siblings={colors}
                    detail={x.hex}
                    roles={roles(x)}
                    menuVisible
                  />
                  {x.mergedFrom.length > 0 && (
                    <li className="px-1 font-mono text-sm text-faint">
                      {t('merged_from')}: {x.mergedFrom.join(', ')}
                    </li>
                  )}
                </ul>
              ))}
          </div>
        ))}
      </div>
      {others.length > 0 && (
        <>
          <SectionLabel as="h3" count={others.length}>
            {t('other_colors')}
          </SectionLabel>
          <ul className="flex flex-col">
            {others.map((x) => (
              <TokenRow
                key={x.id}
                token={x}
                category="color"
                siblings={colors}
                detail={x.hex}
                roles={roles(x)}
              />
            ))}
          </ul>
        </>
      )}

      {translucent.length > 0 && (
        <>
          <SectionLabel count={translucent.length}>{t('translucent')}</SectionLabel>
          <ul className="flex flex-col">
            {translucent.map((x) => (
              <TokenRow
                key={x.id}
                token={x}
                category="color"
                siblings={colors}
                hex={null}
                leading={<CheckerSwatch hex={x.hex} effectiveHex={x.effectiveHex} />}
                detail={`${x.hex} ${t('looks_like', x.backdropHex ?? '', x.effectiveHex ?? '')}`}
                roles={roles(x)}
              />
            ))}
          </ul>
        </>
      )}

      {gradients.length > 0 && (
        <>
          <SectionLabel count={gradients.length}>{t('gradients')}</SectionLabel>
          <ul className="flex flex-col gap-1">
            {gradients.map((g) => (
              <TokenRow
                key={g.id}
                token={g}
                category="gradient"
                siblings={design.gradients}
                detail={gradientDetail(design, g)}
                leading={
                  <span className="w-16 shrink-0">
                    <GradientStrip css={g.css} />
                  </span>
                }
              />
            ))}
          </ul>
        </>
      )}

      <ExcludedGroup
        tokens={[
          ...colors.filter((c) => c.excluded),
          ...(design.gradients ?? []).filter((g) => g.excluded),
        ]}
        render={(x) => (
          <TokenRow
            key={x.id}
            token={x}
            category={x.css ? 'gradient' : 'color'}
            siblings={x.css ? design.gradients : colors}
            detail={x.hex ?? x.css}
            menuVisible
          />
        )}
      />
    </>
  );
}

function gradientDetail(design, g) {
  const name = (stop) =>
    design.colors.find((c) => c.id === stop.colorTokenId && !c.excluded)?.name ?? stop.hex;
  const dir = g.direction ? `${g.direction} ` : '';
  return `${g.type} ${dir}${g.stops.map(name).join(' → ')}`;
}

/** One 24 px swatch per step 100 to 900; empty steps are dashed outlines. */
function ScaleStrip({ family, tokens, selected, onSelect }) {
  const byStep = new Map(tokens.map((x) => [x.step, x]));
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-1 font-mono text-sm text-muted">{family}</span>
      <div className="grid flex-1 grid-cols-9 gap-1">
        {STEPS.map((step) => {
          const token = byStep.get(step);
          return (
            <div key={step} className="flex flex-col items-center gap-0.5">
              {token ? (
                <button
                  type="button"
                  aria-label={t('show_token', token.name)}
                  aria-pressed={selected === token.id}
                  title={`${token.name} ${token.hex}`}
                  onClick={() => onSelect(selected === token.id ? null : token.id)}
                  className={`relative size-6 rounded-swatch ${selected === token.id ? 'outline-2 outline-offset-1 outline-text' : ''}`}
                  style={{ background: token.hex }}
                >
                  <span className="pointer-events-none absolute inset-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" />
                </button>
              ) : (
                <span
                  className="size-6 rounded-swatch border border-dashed border-border"
                  title={t('empty_step', step)}
                />
              )}
              <span className="font-mono text-[11px] text-faint">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
