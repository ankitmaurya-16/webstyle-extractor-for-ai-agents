import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { S } from '../strings.js';
import { RoleBadge, UsageBar } from './Basics.jsx';
import { Button } from './Button.jsx';
import { Swatch } from './Swatch.jsx';
import { TokenMenu } from './TokenMenu.jsx';

/** Inline rename field; shows the applyEdit error and changes nothing on failure (AC-F6.1). */
export function RenameField({ token, onDone }) {
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
    const result = edit({ kind: 'rename', tokenId: token.id, name: value });
    if (result.ok) onDone();
    else setError(S.editErrors[result.error]);
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-1 flex-col gap-1 py-1">
      <div className="flex items-center gap-2">
        <input
          ref={input}
          value={value}
          aria-label={S.renameLabel}
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
          {S.save}
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

/**
 * A 32 px token row. For colors: swatch, name, hex, role badges, usage and menu.
 * @param {{token: object, category: string, siblings: object[], detail?: string, leading?: any,
 *   role?: string, children?: any}} props
 */
export function TokenRow({
  token,
  category,
  siblings,
  detail,
  leading,
  role,
  children,
  menuVisible,
}) {
  const [renaming, setRenaming] = useState(false);
  const isColor = category === 'color';
  const badges = role ? [role] : isColor ? token.roles : [];
  return (
    <li
      className={`group flex min-h-8 items-center gap-1.5 rounded-control px-1 hover:bg-surface ${token.excluded ? 'opacity-40' : ''}`}
    >
      {isColor ? <Swatch hex={token.hex} /> : leading}
      {renaming ? (
        <RenameField token={token} onDone={() => setRenaming(false)} />
      ) : (
        <>
          {badges.map((r) => (
            <RoleBadge key={r} role={r} />
          ))}
          <span
            className="max-w-[45%] shrink-0 truncate font-mono text-sm text-text"
            title={token.name}
          >
            {token.name}
          </span>
          {detail && (
            <span className="min-w-0 truncate font-mono text-sm text-faint" title={detail}>
              {detail}
            </span>
          )}
          {children}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {token.excluded && <RoleBadge role={S.excluded} />}
            {typeof token.usageShare === 'number' && token.usageShare > 0 && (
              <UsageBar share={token.usageShare} />
            )}
            <TokenMenu
              token={token}
              category={category}
              siblings={siblings}
              onRename={() => setRenaming(true)}
              alwaysVisible={menuVisible}
            />
          </span>
        </>
      )}
    </li>
  );
}
