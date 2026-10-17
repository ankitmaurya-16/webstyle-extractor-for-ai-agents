import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { t } from '../../../src/i18n.js';
import { useStore } from '../store.js';
import { ConfidenceDot, RoleBadge, UsageBar } from './Basics.jsx';
import { Button } from './Button.jsx';
import { Swatch } from './Swatch.jsx';
import { TokenMenu } from './TokenMenu.jsx';

const EDIT_ERRORS = {
  INVALID_NAME: 'error_invalid_name',
  NAME_TAKEN: 'error_name_taken',
  NOT_FOUND: 'error_not_found',
  SAME_TOKEN: 'error_same_token',
};

/** Inline rename field; shows the applyEdit error and changes nothing on failure (AC-F6.1). */
export function RenameField({ token, onDone, kind = 'rename' }) {
  const edit = useStore((s) => s.edit);
  const [value, setValue] = useState(token.name);
  const [error, setError] = useState(null);
  const input = useRef(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const submit = (event) => {
    event.preventDefault();
    if (value === token.name) return onDone();
    const result =
      kind === 'renameComponent'
        ? edit({ kind: 'renameComponent', componentId: token.id, name: value })
        : edit({ kind: 'rename', tokenId: token.id, name: value });
    if (result.ok) onDone();
    else setError(t(EDIT_ERRORS[result.error] ?? 'error_not_found'));
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          value={value}
          aria-label={t('rename_label')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `rename-error-${token.id}` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onDone();
            }
          }}
          className="h-7 min-w-0 flex-1 rounded-control border border-border-strong bg-surface-2 px-2 font-mono text-sm text-text"
        />
        <Button type="submit" variant="secondary" className="h-7">
          {t('save')}
        </Button>
      </div>
      {error && (
        <p id={`rename-error-${token.id}`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/** "Where is this used?" eye button, shown when highlight is on in Settings (F30). */
export function HighlightButton({ tokenId, name }) {
  const enabled = useStore((s) => s.settings.highlightEnabled);
  const active = useStore((s) => s.highlight?.tokenId === tokenId);
  const count = useStore((s) => (s.highlight?.tokenId === tokenId ? s.highlight.count : null));
  const highlightToken = useStore((s) => s.highlightToken);
  if (!enabled) return null;
  return (
    <button
      type="button"
      aria-label={t('where_used', name)}
      aria-pressed={active}
      title={count ? t('highlight_count', count) : t('where_used', name)}
      onClick={() => highlightToken(tokenId)}
      className={`transition-quick inline-flex h-7 shrink-0 items-center gap-1 rounded-control px-1 hover:bg-surface-2 hover:text-text ${active ? 'text-accent' : 'text-muted'}`}
    >
      <Eye size={14} aria-hidden />
      {count ? <span className="font-mono text-[11px]">{count}</span> : null}
    </button>
  );
}

/**
 * A token row: leading visual, role badges, name, detail, site variable, usage, confidence,
 * highlight and the token menu.
 */
export function TokenRow({ token, category, siblings, detail, leading, roles, children, menuVisible, hex }) {
  const [renaming, setRenaming] = useState(false);
  const swatchHex = hex ?? (category === 'color' ? token.hex : null);
  return (
    <li
      className={`group flex min-h-8 flex-wrap items-center gap-x-1.5 rounded-control px-1 hover:bg-surface ${token.excluded ? 'opacity-40' : ''}`}
      data-token-id={token.id}
    >
      {swatchHex ? <Swatch hex={swatchHex} /> : leading}
      {renaming ? (
        <RenameField token={token} onDone={() => setRenaming(false)} />
      ) : (
        <>
          {(roles ?? []).map((r) => (
            <RoleBadge key={r} role={r} />
          ))}
          <span className="flex max-w-[45%] min-w-0 shrink-0 flex-col">
            <span className="truncate font-mono text-sm text-text" title={token.name}>
              {token.name}
            </span>
            {token.siteVariable && token.siteVariable !== `--${token.name}` && (
              <span className="truncate font-mono text-[11px] text-faint" title={token.siteVariable}>
                <span className="sr-only">{t('site_variable', '')}</span>
                {token.siteVariable}
              </span>
            )}
          </span>
          {detail && (
            <span className="min-w-0 truncate font-mono text-sm text-faint" title={detail}>
              {detail}
            </span>
          )}
          {children}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {token.excluded && <RoleBadge role={t('excluded')} />}
            <ConfidenceDot confidence={token.confidence} />
            {typeof token.usageShare === 'number' && token.usageShare > 0 && <UsageBar share={token.usageShare} />}
            {!token.excluded && <HighlightButton tokenId={token.id} name={token.name} />}
            <TokenMenu token={token} category={category} siblings={siblings} onRename={() => setRenaming(true)} alwaysVisible={menuVisible} />
          </span>
        </>
      )}
    </li>
  );
}
