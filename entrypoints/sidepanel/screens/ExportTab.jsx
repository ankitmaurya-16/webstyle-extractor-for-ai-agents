import { Copy, Download, FileArchive } from 'lucide-react';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import { EXPORT_LABELS, exportFile } from '../../../src/export/index.js';
import { useStore } from '../store.js';
import { S, formatBytes } from '../strings.js';
import { Button } from '../components/Button.jsx';
import { SectionLabel } from '../components/Basics.jsx';
import { CodePreview } from '../components/CodePreview.jsx';

export function ExportTab({ design }) {
  const format = useStore((s) => s.exportFormat);
  const version = useStore((s) => s.version);
  const { setExportFormat, copy, downloadCurrent, downloadAll } = useStore.getState();
  // The preview is exactly the text that Copy and Download use (AC-F7.2).
  const text = exportFile(format, design, version);
  const lines = text.replace(/\n$/, '').split('\n').length;
  const bytes = new TextEncoder().encode(text).length;

  return (
    <>
      <SectionLabel>
        <label htmlFor="export-format">{S.format}</label>
      </SectionLabel>
      <select
        id="export-format"
        value={format}
        onChange={(e) => setExportFormat(e.target.value)}
        className="mb-3 h-8 w-full rounded-control border border-border bg-surface-2 px-2 font-mono text-sm text-text hover:border-border-strong"
      >
        {EXPORT_FORMATS.map((f) => (
          <option key={f} value={f}>
            {EXPORT_LABELS[f]}
          </option>
        ))}
      </select>
      <CodePreview text={text} label={`${EXPORT_LABELS[format]} preview`} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => copy(text)}>
          <Copy size={16} aria-hidden />
          {S.copy}
        </Button>
        <Button variant="secondary" onClick={downloadCurrent}>
          <Download size={16} aria-hidden />
          {S.download}
        </Button>
        <Button variant="ghost" onClick={downloadAll}>
          <FileArchive size={16} aria-hidden />
          {S.downloadAll}
        </Button>
      </div>
      <p className="mt-2 text-sm text-faint" data-testid="export-footer">
        {S.linesAndSize(lines, formatBytes(bytes))}
      </p>
    </>
  );
}
