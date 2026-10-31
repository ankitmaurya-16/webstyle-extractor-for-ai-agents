import { useMemo } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Copy, Download, FileArchive, FolderOutput, Sparkles } from 'lucide-react';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import { EXPORT_LABELS, exportFile } from '../../../src/export/index.js';
import { formatBytes, t } from '../../../src/i18n.js';
import { useStore } from '../store.js';
import { Button } from '../components/Button.jsx';
import { SectionLabel, Segmented } from '../components/Basics.jsx';
import { CodePreview } from '../components/CodePreview.jsx';
import { MENU_CONTENT, MENU_ITEM } from '../components/Header.jsx';

export function ExportTab({ design, record }) {
  const format = useStore((s) => s.exportFormat);
  const version = useStore((s) => s.version);
  const settings = useStore((s) => s.settings);
  const projects = useStore((s) => s.projects);
  const fsSupported = useStore((s) => s.fsSupported);
  const shots = useStore((s) => s.screenshots);
  const store = useStore.getState();
  const ctx = useMemo(
    () => ({
      mapping: record?.mapping ?? null,
      shadcnFormat: settings.shadcnFormat,
      screenshots: shots.map((s) => ({ recipeId: s.recipeId, mode: s.mode })),
    }),
    [record?.mapping, settings.shadcnFormat, shots],
  );
  // The preview is exactly the text that Copy and Download use (AC-F7.2).
  const text = useMemo(
    () => exportFile(format, design, version, ctx),
    [format, design, version, ctx],
  );
  const lines = text.replace(/\n$/, '').split('\n').length;
  const bytes = new TextEncoder().encode(text).length;
  const selection = settings.exportSelection;

  return (
    <>
      <SectionLabel>
        <label htmlFor="export-format">{t('format')}</label>
      </SectionLabel>
      <select
        id="export-format"
        value={format}
        onChange={(e) => store.setExportFormat(e.target.value)}
        className="mb-3 h-8 w-full rounded-control border border-border bg-surface-2 px-2 font-mono text-sm text-text hover:border-border-strong"
      >
        {EXPORT_FORMATS.map((f) => (
          <option key={f} value={f}>
            {EXPORT_LABELS[f]}
          </option>
        ))}
      </select>
      <Button variant="primary" className="mb-3 w-full" onClick={store.copyPrompt}>
        <Sparkles size={16} aria-hidden />
        {t('copy_prompt')}
      </Button>
      {format === 'shadcn' && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-muted">{t('shadcn_format')}</span>
          <Segmented
            label={t('shadcn_format')}
            value={settings.shadcnFormat}
            onChange={(v) => store.updateSettings({ shadcnFormat: v })}
            options={[
              { value: 'oklch', label: 'oklch' },
              { value: 'hsl', label: 'hsl' },
            ]}
          />
        </div>
      )}
      {format === 'figma' && <p className="mb-3 text-sm text-muted">{t('figma_help')}</p>}
      <CodePreview text={text} label={t('preview_label', EXPORT_LABELS[format])} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => store.copy(text)}>
          <Copy size={16} aria-hidden />
          {t('copy')}
        </Button>
        <Button variant="secondary" onClick={store.downloadCurrent}>
          <Download size={16} aria-hidden />
          {t('download')}
        </Button>
      </div>
      <p className="mt-2 text-sm text-faint" data-testid="export-footer">
        {t('lines_and_size', lines, formatBytes(bytes))}
      </p>
      {record?.screenshotFailed && (
        <p className="mt-1 text-sm text-warning">{t('banner_screenshot_failed')}</p>
      )}

      <SectionLabel>{t('include_in_zip')}</SectionLabel>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1" aria-label={t('include_in_zip')}>
        {[...EXPORT_FORMATS, 'screenshots'].map((f) => (
          <li key={f}>
            <label className="flex h-7 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={selection.includes(f)}
                disabled={f === 'screenshots' && shots.length === 0}
                onChange={() => store.toggleExportSelection(f)}
                className="size-3.5 accent-accent"
              />
              <span className="truncate">
                {f === 'screenshots' ? t('screenshots_format') : EXPORT_LABELS[f]}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={store.downloadAll} disabled={selection.length === 0}>
          <FileArchive size={16} aria-hidden />
          {t('download_all')}
        </Button>
        {fsSupported && projects.length > 0 && (
          <WriteButton projects={projects} onWrite={store.writeProject} />
        )}
      </div>
    </>
  );
}

function WriteButton({ projects, onWrite }) {
  const [first] = projects;
  if (projects.length === 1) {
    return (
      <Button variant="secondary" onClick={() => onWrite(first.id)}>
        <FolderOutput size={16} aria-hidden />
        {t('write_to', first.name)}
      </Button>
    );
  }
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="secondary">
          <FolderOutput size={16} aria-hidden />
          {t('write_to', first.name)}
          <ChevronDown size={14} aria-hidden />
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={4} className={MENU_CONTENT}>
          {projects.map((p) => (
            <Menu.Item key={p.id} className={MENU_ITEM} onSelect={() => onWrite(p.id)}>
              {p.name}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
