import { useState } from 'react';
import { HUE_FAMILIES, SEMANTIC_ROLES, STEPS } from '../../../src/model/types.js';
import { S } from '../strings.js';
import { SectionLabel } from '../components/Basics.jsx';
import { TokenRow } from '../components/TokenRow.jsx';
import { ExcludedGroup } from '../components/Excluded.jsx';

export function ColorsTab({ design }) {
  const colors = design.colors;
  const visible = colors.filter((c) => !c.excluded);
  const semantic = SEMANTIC_ROLES.map((role) => [
    role,
    visible.find((c) => c.roles.includes(role)),
  ]).filter(([, token]) => token);
  const hasPrimary = semantic.some(([role]) => role === 'primary');
  const scaled = HUE_FAMILIES.map((family) => [
    family,
    visible.filter((c) => c.family === family && c.step !== null),
  ]).filter(([, list]) => list.length > 0);
  const others = visible.filter((c) => c.step === null);
  const [selected, setSelected] = useState(null);

  if (colors.length === 0) return <p className="mt-6 text-muted">{S.nothingFound}</p>;

  return (
    <>
      <SectionLabel count={semantic.length}>{S.semantic}</SectionLabel>
      <ul className="flex flex-col">
        {semantic.map(([role, token]) => (
          <TokenRow
            key={role}
            token={token}
            category="color"
            siblings={colors}
            role={role}
            detail={token.hex}
          />
        ))}
      </ul>
      {!hasPrimary && <p className="mt-1 px-1 text-muted">{S.noPrimary}</p>}

      <SectionLabel count={visible.length}>{S.scales}</SectionLabel>
      <div className="flex flex-col gap-3">
        {scaled.map(([family, list]) => (
          <div key={family}>
            <ScaleStrip family={family} tokens={list} selected={selected} onSelect={setSelected} />
            {list
              .filter((t) => t.id === selected)
              .map((t) => (
                <ul key={t.id} className="mt-1">
                  <TokenRow
                    token={t}
                    category="color"
                    siblings={colors}
                    detail={t.hex}
                    menuVisible
                  />
                  {t.mergedFrom.length > 0 && (
                    <li className="px-1 font-mono text-sm text-faint">
                      {S.mergedFrom}: {t.mergedFrom.join(', ')}
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
            {S.other}
          </SectionLabel>
          <ul className="flex flex-col">
            {others.map((t) => (
              <TokenRow key={t.id} token={t} category="color" siblings={colors} detail={t.hex} />
            ))}
          </ul>
        </>
      )}
      <ExcludedGroup
        tokens={colors.filter((c) => c.excluded)}
        render={(t) => (
          <TokenRow
            key={t.id}
            token={t}
            category="color"
            siblings={colors}
            detail={t.hex}
            menuVisible
          />
        )}
      />
    </>
  );
}

/** One 24 px swatch per step 100 to 900; empty steps are dashed outlines. */
function ScaleStrip({ family, tokens, selected, onSelect }) {
  const byStep = new Map(tokens.map((t) => [t.step, t]));
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
                  aria-label={S.showToken(token.name)}
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
                  title={S.emptyStep(step)}
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
