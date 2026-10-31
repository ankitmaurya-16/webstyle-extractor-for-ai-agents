import { useState } from 'react';
import { cssValue, isRef, resolveValue, roleToken, visible } from '../../../src/model/design.js';
import {
  describeBorder,
  describeColor,
  describeFocusRing,
  describePadding,
  recipeTitle,
} from '../../../src/export/describe.js';
import { t } from '../../../src/i18n.js';
import { useStore } from '../store.js';
import { ConfidenceDot, RoleBadge, SectionLabel, Segmented } from '../components/Basics.jsx';
import { HighlightButton, RenameField } from '../components/TokenRow.jsx';
import { TokenMenu } from '../components/TokenMenu.jsx';
import { Button } from '../components/Button.jsx';
import { SnapshotPicker } from '../components/SnapshotPicker.jsx';

const STATES = ['default', 'hover', 'focus', 'focus-visible', 'active'];
const STATE_KEYS = {
  default: 'state_default',
  hover: 'state_hover',
  focus: 'state_focus',
  'focus-visible': 'state_focus_visible',
  active: 'state_active',
};
// Values that only restate the browser default add noise to the property list.
const DEFAULTS = new Set(['none', 'normal', 'auto', '0px', '']);
const meaningful = ([, value]) => !DEFAULTS.has(isRef(value) ? value.raw : String(value ?? ''));

const COLOR_PROPS = { 'background-color': 'background', color: 'text', zebra: 'background' };

function describeProp(design, prop, value, mode) {
  if (COLOR_PROPS[prop] || prop.endsWith('-color') || prop.endsWith('background-color')) {
    return describeColor(
      design,
      value,
      COLOR_PROPS[prop] ??
        (prop.endsWith('color') && !prop.includes('background') ? 'text' : 'background'),
      mode,
    );
  }
  if (prop === 'border' || prop === 'outline' || prop === 'divider' || prop.endsWith('-border'))
    return describeBorder(design, isRef(value) ? value.raw : value);
  if (prop === 'padding' || prop.endsWith('-padding'))
    return describePadding(design, isRef(value) ? value.raw : value);
  const { token, raw } = resolveValue(design, value);
  return token ? `${token.name} (${raw})` : raw;
}

/** Live preview built from the recipe's tokens, with generic labels (never page text). */
function Preview({ design, recipe, styles }) {
  const v = (key) => (styles[key] === undefined ? undefined : cssValue(design, styles[key]));
  const style = {
    background: v('background-color'),
    backgroundImage: v('background-image') !== 'none' ? v('background-image') : undefined,
    color: v('color'),
    border: v('border'),
    borderRadius: v('border-radius'),
    padding: v('padding'),
    fontFamily: styles['font-family'] ? resolveValue(design, styles['font-family']).raw : undefined,
    fontSize: v('font-size'),
    fontWeight: styles['font-weight'],
    lineHeight: styles['line-height'],
    letterSpacing: styles['letter-spacing'],
    textTransform: styles['text-transform'],
    boxShadow: v('box-shadow'),
    outline: styles.outline,
    outlineOffset: styles['outline-offset'],
    opacity: v('opacity'),
  };
  const sub = (prefix) => {
    const out = {};
    for (const [k, value] of Object.entries(styles))
      if (k.startsWith(prefix)) out[k.slice(prefix.length)] = value;
    return out;
  };
  switch (recipe.kind) {
    case 'button':
      return <span style={style}>{t('preview_button')}</span>;
    case 'input':
      return (
        <span style={{ ...style, display: 'block', width: '100%' }}>
          <span style={{ opacity: 0.6 }}>{t('preview_placeholder')}</span>
        </span>
      );
    case 'link':
      return (
        <span style={{ ...style, textDecoration: styles['text-decoration'] ?? 'underline' }}>
          {t('preview_link')}
        </span>
      );
    case 'heading':
      return (
        <span style={{ ...style, display: 'block' }}>
          {t('preview_heading', String(recipe.variant).replace(/^h/, ''))}
        </span>
      );
    case 'card':
      return (
        <span style={{ ...style, display: 'block', width: '100%', minHeight: 56 }}>
          <span style={{ fontWeight: 600 }}>{t('preview_card')}</span>
        </span>
      );
    case 'badge':
      return <span style={style}>{t('preview_badge')}</span>;
    case 'alert':
      return (
        <span style={{ ...style, display: 'block', width: '100%' }}>{t('preview_alert')}</span>
      );
    case 'tabs': {
      const tab = sub('tab-');
      const selected = { ...tab, ...sub('selected-') };
      const css = (s) => ({
        color: s.color ? cssValue(design, s.color) : undefined,
        background: s['background-color'] ? cssValue(design, s['background-color']) : undefined,
        padding: s.padding,
        borderBottom: s.border,
      });
      return (
        <span style={{ ...style, display: 'flex', gap: 4 }}>
          <span style={css(selected)}>{t('preview_tab', 1)}</span>
          <span style={css(tab)}>{t('preview_tab', 2)}</span>
        </span>
      );
    }
    case 'navbar': {
      const link = sub('link-');
      return (
        <span style={{ ...style, display: 'flex', width: '100%', gap: 16 }}>
          <span style={{ color: link.color ? cssValue(design, link.color) : undefined }}>
            {t('preview_nav')}
          </span>
        </span>
      );
    }
    case 'table': {
      const header = sub('header-');
      const cell = sub('cell-');
      return (
        <span style={{ ...style, display: 'block', width: '100%' }}>
          <span
            style={{
              display: 'block',
              background: header['background-color']
                ? cssValue(design, header['background-color'])
                : undefined,
              color: header.color ? cssValue(design, header.color) : undefined,
              padding: header.padding,
              fontWeight: header['font-weight'],
            }}
          >
            {t('preview_cell')}
          </span>
          <span style={{ display: 'block', padding: cell.padding, borderTop: styles.divider }}>
            {t('preview_cell')}
          </span>
        </span>
      );
    }
    default:
      return <span style={style}>{t('preview_button')}</span>;
  }
}

function FocusRingCard({ design, mode }) {
  const text = describeFocusRing(design);
  const ring = design.focusRing;
  const background = roleToken(design, 'background', mode)?.hex;
  return (
    <section aria-label={t('focus_ring')}>
      <SectionLabel>{t('focus_ring')}</SectionLabel>
      {text ? (
        <div
          className="flex items-center gap-3 rounded-card border border-border p-3"
          style={{ background }}
        >
          <span
            className="inline-block rounded-control bg-surface-3 px-3 py-1 text-sm text-text"
            style={{
              outline: ring.outline ?? undefined,
              outlineOffset: ring.offsetPx !== null ? `${ring.offsetPx}px` : undefined,
              boxShadow: ring.boxShadow ?? undefined,
            }}
            aria-hidden
          >
            {t('preview_button')}
          </span>
          <span className="min-w-0 flex-1 font-mono text-sm text-muted">
            {text} · {ring.source === 'forced' ? t('source_forced') : t('source_stylesheet')}
          </span>
        </div>
      ) : (
        <p className="px-1 text-muted">{t('focus_ring_none')}</p>
      )}
    </section>
  );
}

function RecipeCard({ design, recipe, mode, shots, picked }) {
  const states = recipe.byMode[mode] ??
    recipe.byMode[Object.keys(recipe.byMode)[0]] ?? { default: {} };
  const available = STATES.filter(
    (s) => states[s] && (s === 'default' || Object.keys(states[s]).length > 0),
  );
  const [state, setState] = useState('default');
  const [renaming, setRenaming] = useState(false);
  const current = available.includes(state) ? state : 'default';
  const base = states.default ?? {};
  const styles = current === 'default' ? base : { ...base, ...states[current] };
  const changed = new Set(current === 'default' ? [] : Object.keys(states[current] ?? {}));
  const background = roleToken(design, 'background', mode)?.hex;
  const shot =
    shots.find((s) => s.recipeId === recipe.id && s.mode === mode) ??
    shots.find((s) => s.recipeId === recipe.id);
  const title = recipeTitle(recipe);
  return (
    <section
      aria-label={title}
      className={`group ${recipe.excluded ? 'opacity-40' : ''}`}
      data-recipe={recipe.id}
    >
      <div className="mt-6 mb-2 flex min-h-7 items-center gap-2">
        {renaming ? (
          <RenameField
            token={{ id: recipe.id, name: recipe.name ?? title }}
            kind="renameComponent"
            onDone={() => setRenaming(false)}
          />
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-xs text-faint uppercase">{title}</h2>
            {picked && <RoleBadge role={t('picked_component')} />}
            <ConfidenceDot confidence={recipe.confidence} />
            {recipe.representativeSelector && <HighlightButton tokenId={recipe.id} name={title} />}
            <TokenMenu
              token={{ ...recipe, name: title }}
              category="component"
              siblings={[]}
              onRename={() => setRenaming(true)}
            />
          </>
        )}
      </div>
      {available.length > 1 && (
        <Segmented
          label={t('states_label')}
          value={current}
          onChange={setState}
          options={STATES.filter((s) => s === 'default' || states[s]).map((s) => ({
            value: s,
            label: t(STATE_KEYS[s]),
            disabled: !available.includes(s),
          }))}
          className="mb-2"
        />
      )}
      <div
        className="flex min-h-16 items-center justify-center overflow-hidden rounded-card border border-border p-4"
        style={{ background }}
      >
        <Preview design={design} recipe={recipe} styles={styles} />
      </div>
      <dl className="mt-2 grid grid-cols-[120px_1fr] gap-x-2 font-mono text-sm">
        {Object.entries(styles)
          .filter((entry) => meaningful(entry) || changed.has(entry[0]))
          .map(([prop, value]) => (
            <div key={prop} className="contents">
              <dt className="truncate text-faint">{prop}</dt>
              <dd
                className="m-0 truncate text-text"
                title={describeProp(design, prop, value, mode)}
              >
                {describeProp(design, prop, value, mode)}
                {changed.has(prop) && <span className="text-accent"> ← {t('changed')}</span>}
              </dd>
            </div>
          ))}
      </dl>
      {recipe.stateSource !== 'none' && available.length > 1 && (
        <p className="mt-1 text-sm text-faint">
          {recipe.stateSource === 'forced' ? t('source_forced') : t('source_stylesheet')}
        </p>
      )}
      {shot && (
        <img
          src={shot.url}
          alt={t('screenshot_alt', title)}
          className="mt-2 max-h-32 max-w-full rounded-card border border-border"
        />
      )}
    </section>
  );
}

export function ComponentsTab({ design, mode, record }) {
  const shots = useStore((s) => s.screenshots);
  const recipes = visible(design.components);
  const excluded = design.components.filter((r) => r.excluded);
  const pickedFirst = record?.kind === 'component';
  const addPicked = useStore((s) => s.addPickedToSnapshot);
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      {pickedFirst && recipes.length > 0 && (
        <Button variant="secondary" className="mt-4" onClick={() => setChoosing(true)}>
          {t('add_to_snapshot')}
        </Button>
      )}
      <SnapshotPicker
        open={choosing}
        onOpenChange={setChoosing}
        exclude={record?.id}
        onPick={(id) => {
          setChoosing(false);
          addPicked(id);
        }}
      />
      <FocusRingCard design={design} mode={mode} />
      {recipes.length === 0 && <p className="mt-6 text-muted">{t('no_components')}</p>}
      {recipes.map((recipe, i) => (
        <RecipeCard
          key={recipe.id}
          design={design}
          recipe={recipe}
          mode={mode}
          shots={shots}
          picked={pickedFirst && i === 0}
        />
      ))}
      {excluded.length > 0 && (
        <>
          <SectionLabel>{t('excluded_count', excluded.length)}</SectionLabel>
          <ul className="flex flex-col">
            {excluded.map((r) => (
              <li key={r.id} className="group flex h-8 items-center gap-2 px-1 opacity-60">
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{recipeTitle(r)}</span>
                <TokenMenu
                  token={{ ...r, name: recipeTitle(r) }}
                  category="component"
                  siblings={[]}
                  alwaysVisible
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
