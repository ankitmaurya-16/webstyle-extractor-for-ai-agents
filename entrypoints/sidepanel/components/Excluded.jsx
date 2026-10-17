import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { S } from '../strings.js';

/** Collapsed "N excluded" row per section (AC-F6.4). */
export function ExcludedGroup({ tokens, render }) {
  const [open, setOpen] = useState(false);
  if (tokens.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="transition-quick flex h-8 items-center gap-1 rounded-control px-1 text-muted hover:text-text"
      >
        <ChevronRight size={16} className={open ? 'rotate-90' : ''} aria-hidden />
        {S.excludedCount(tokens.length)}
      </button>
      {open && <ul className="flex flex-col">{tokens.map(render)}</ul>}
    </div>
  );
}
