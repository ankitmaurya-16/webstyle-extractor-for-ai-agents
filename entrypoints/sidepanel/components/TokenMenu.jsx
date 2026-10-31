import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { SEMANTIC_ROLES } from '../../../src/model/types.js';
import { rolesOf } from '../../../src/model/design.js';
import { t } from '../../../src/i18n.js';
import { useStore } from '../store.js';

const ITEM =
  'flex h-7 cursor-default items-center rounded-swatch px-2 text-base text-text outline-none select-none data-[highlighted]:bg-surface-3 data-[disabled]:text-faint';
const CONTENT =
  'animate-pop z-50 max-h-[320px] min-w-[180px] overflow-auto rounded-card border border-border-strong bg-surface-2 p-1 shadow-elevated';

/**
 * Token actions: Rename, Set role (colors, for the theme in view), Merge into, Use site name,
 * Exclude or Include.
 */
export function TokenMenu({ token, category, siblings, onRename, alwaysVisible = false }) {
  const edit = useStore((s) => s.edit);
  const mode = useStore((s) => s.mode);
  const design = useStore((s) => s.record?.edited);
  const targets = siblings.filter((x) => x.id !== token.id && !x.excluded);
  const roles = category === 'color' && design ? rolesOf(design, token.id, mode) : [];
  // Rename moves focus into the inline field, so the menu must not pull it back to the trigger.
  const renaming = useRef(false);
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label={t('token_menu', token.name)}
          className={`transition-quick inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-text focus-visible:opacity-100 data-[state=open]:opacity-100 ${alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={4}
          className={CONTENT}
          onCloseAutoFocus={(event) => {
            if (renaming.current) event.preventDefault();
            renaming.current = false;
          }}
        >
          {!token.excluded && onRename && (
            <Menu.Item
              className={ITEM}
              onSelect={() => {
                renaming.current = true;
                onRename();
              }}
            >
              {t('rename')}
            </Menu.Item>
          )}
          {category === 'color' && !token.excluded && (
            <Menu.Sub>
              <Menu.SubTrigger className={ITEM}>{t('set_role')}</Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent className={CONTENT} sideOffset={4}>
                  {SEMANTIC_ROLES.map((role) => (
                    <Menu.CheckboxItem
                      key={role}
                      className={ITEM}
                      checked={roles.includes(role)}
                      onSelect={() =>
                        edit(
                          roles.includes(role)
                            ? { kind: 'clearRole', role, mode }
                            : { kind: 'setRole', tokenId: token.id, role, mode },
                        )
                      }
                    >
                      <span className="w-4" aria-hidden>
                        {roles.includes(role) ? '✓' : ''}
                      </span>
                      {role}
                    </Menu.CheckboxItem>
                  ))}
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
          )}
          {!token.excluded && targets.length > 0 && (
            <Menu.Sub>
              <Menu.SubTrigger className={ITEM}>{t('merge_into')}</Menu.SubTrigger>
              <Menu.Portal>
                <Menu.SubContent className={CONTENT} sideOffset={4}>
                  {targets.map((x) => (
                    <Menu.Item
                      key={x.id}
                      className={`${ITEM} gap-2 font-mono text-sm`}
                      onSelect={() => edit({ kind: 'merge', sourceId: token.id, targetId: x.id })}
                    >
                      {x.hex && (
                        <span
                          className="size-3 rounded-swatch ring-1 ring-swatch-ring ring-inset"
                          style={{ background: x.hex }}
                          aria-hidden
                        />
                      )}
                      {x.name}
                    </Menu.Item>
                  ))}
                </Menu.SubContent>
              </Menu.Portal>
            </Menu.Sub>
          )}
          {!token.excluded && token.siteName && (
            <Menu.Item
              className={ITEM}
              onSelect={() =>
                edit({ kind: 'useSiteName', tokenId: token.id, use: token.name !== token.siteName })
              }
            >
              {token.name === token.siteName ? t('use_generated_name') : t('use_site_name')}
            </Menu.Item>
          )}
          <Menu.Item
            className={ITEM}
            onSelect={() =>
              edit({ kind: token.excluded ? 'include' : 'exclude', tokenId: token.id })
            }
          >
            {token.excluded ? t('include') : t('exclude')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
