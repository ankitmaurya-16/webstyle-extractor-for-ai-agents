/** Read-only file preview with line numbers; scrolls inside. No syntax highlighting. */
export function CodePreview({ text, label }) {
  const lines = text.replace(/\n$/, '').split('\n');
  const width = String(lines.length).length;
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="scrollbar-thin max-h-[360px] overflow-auto rounded-card border border-border bg-surface py-2 font-mono text-sm leading-[18px]"
    >
      <pre className="m-0 min-w-max">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span
              className="shrink-0 pr-3 pl-3 text-right text-faint select-none"
              style={{ width: `${width + 3}ch` }}
              aria-hidden
            >
              {i + 1}
            </span>
            <span className="pr-3 whitespace-pre text-text">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
