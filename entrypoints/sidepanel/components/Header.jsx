import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronLeft, History, MoreHorizontal, Pipette } from 'lucide-react';
import { IconButton } from './Button.jsx';
import { S } from '../strings.js';

export const MENU_ITEM =
  'flex h-7 cursor-default items-center gap-2 rounded-swatch px-2 text-base text-text outline-none select-none data-[highlighted]:bg-surface-3';
export const MENU_CONTENT =
  'animate-pop z-50 min-w-[200px] rounded-card border border-border-strong bg-surface-2 p-1 shadow-elevated';

/** Sticky 44 px header. With onBack it shows a back button instead of the logo. */
export function Header({ title, onBack, actions, menu }) {
  return (
    <header className="sticky top-0 z-20 flex h-11 items-center gap-1 border-b border-border bg-bg px-2">
      {onBack ? (
        <IconButton label={S.back} onClick={onBack}>
          <ChevronLeft size={16} aria-hidden />
        </IconButton>
      ) : (
        <span className="flex items-center gap-2 px-2 text-md font-semibold">
          <Pipette size={16} className="text-accent" aria-hidden />
          {S.appName}
        </span>
      )}
      {title && <span className="min-w-0 flex-1 truncate px-1 text-md">{title}</span>}
      {!title && <span className="flex-1" />}
      {actions}
      {menu && <HeaderMenu items={menu} />}
    </header>
  );
}

export function HistoryButton({ onClick }) {
  return (
    <IconButton label={S.history} onClick={onClick}>
      <History size={16} aria-hidden />
    </IconButton>
  );
}

/** items: Array<{ label, onSelect, danger?, icon? }> */
function HeaderMenu({ items }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <IconButton label={S.menu}>
          <MoreHorizontal size={16} aria-hidden />
        </IconButton>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={4} className={MENU_CONTENT}>
          {items.map(({ label, onSelect, danger, icon: Icon }) => (
            <Menu.Item
              key={label}
              onSelect={onSelect}
              className={`${MENU_ITEM} ${danger ? 'text-danger' : ''}`}
            >
              {Icon && <Icon size={16} aria-hidden />}
              {label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
