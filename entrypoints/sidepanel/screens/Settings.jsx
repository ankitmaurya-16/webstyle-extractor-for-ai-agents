import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { useStore, SOURCE_URL } from '../store.js';
import { shortDate, t } from '../../../src/i18n.js';
import { EXPORT_LABELS } from '../../../src/export/index.js';
import { fileMapErrors } from '../../../src/project/index.js';
import { Button, Keycap } from '../components/Button.jsx';
import { PermissionRow, SectionLabel, Segmented, SwitchRow } from '../components/Basics.jsx';
import { Header } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { AdvancedDefaults } from './Home.jsx';

export function Settings() {
  const settings = useStore((s) => s.settings);
  const debuggerGranted = useStore((s) => s.debuggerGranted);
  const allowedSites = useStore((s) => s.allowedSites);
  const projects = useStore((s) => s.projects);
  const version = useStore((s) => s.version);
  const firefox = useStore((s) => s.firefox);
  const fsSupported = useStore((s) => s.fsSupported);
  const store = useStore.getState();
  const [editing, setEditing] = useState(null); // project id

  return (
    <>
      <Header onBack={store.goHome} title={t('settings')} />
      <main className="p-4 pt-0 pb-16">
        <SectionLabel>{t('appearance')}</SectionLabel>
        <Segmented
          label={t('appearance')}
          value={settings.panelTheme}
          onChange={(v) => store.updateSettings({ panelTheme: v })}
          options={[
            { value: 'system', label: t('system') },
            { value: 'dark', label: t('dark') },
            { value: 'light', label: t('light') },
          ]}
        />

        <SectionLabel>{t('capture')}</SectionLabel>
        <div className="flex flex-col gap-1">
          {!firefox && (
            <>
              <PermissionRow
                label={t('advanced_capture')}
                granted={debuggerGranted}
                onGrant={store.grantDebugger}
                onRevoke={store.revokeDebugger}
              />
              <p className="text-sm text-faint">{t('advanced_help')}</p>
              {debuggerGranted && (
                <div className="ml-2 border-l border-border pl-3">
                  <AdvancedDefaults />
                </div>
              )}
            </>
          )}
          <SwitchRow
            id="set-scroll"
            label={t('scroll_default')}
            checked={settings.autoScroll}
            onChange={(v) => store.updateSettings({ autoScroll: v })}
          />
          <SwitchRow
            id="set-shots"
            label={t('screenshots_default')}
            description={t('include_screenshots_help')}
            checked={settings.includeScreenshots}
            onChange={(v) => store.updateSettings({ includeScreenshots: v })}
          />
        </div>

        <SectionLabel>{t('names')}</SectionLabel>
        <SwitchRow
          id="set-site-names"
          label={t('use_site_names')}
          checked={settings.useSiteVariableNames}
          onChange={(v) => store.updateSettings({ useSiteVariableNames: v })}
        />

        <SectionLabel>{t('exports')}</SectionLabel>
        <div className="flex items-center gap-2">
          <span className="text-text">{t('shadcn_format')}</span>
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

        <SectionLabel>{t('highlight_on_page')}</SectionLabel>
        <SwitchRow
          id="set-highlight"
          label={t('highlight_on_page')}
          description={t('highlight_help')}
          checked={settings.highlightEnabled}
          onChange={(v) => store.updateSettings({ highlightEnabled: v })}
        />

        <SectionLabel count={allowedSites.length}>{t('allowed_sites')}</SectionLabel>
        {allowedSites.length === 0 && <p className="px-1 text-muted">{t('no_allowed_sites')}</p>}
        <ul className="flex flex-col">
          {allowedSites.map((origin) => (
            <li key={origin} className="flex h-8 items-center gap-2 px-1">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {origin.replace(/\/\*$/, '')}
              </span>
              <Button variant="ghost" className="h-7" onClick={() => store.removeSite(origin)}>
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>

        {fsSupported && (
          <>
            <SectionLabel count={projects.length}>{t('projects')}</SectionLabel>
            <ul className="flex flex-col">
              {projects.map((p) => (
                <li key={p.id} className="flex min-h-8 items-center gap-2 px-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text">{p.name}</span>
                    <span className="block text-sm text-faint">
                      {p.lastWrittenAt
                        ? t('last_written', shortDate(p.lastWrittenAt))
                        : t('never_written')}
                    </span>
                  </span>
                  <Button variant="ghost" className="h-7" onClick={() => setEditing(p.id)}>
                    {t('files')}
                  </Button>
                  <Button variant="ghost" className="h-7" onClick={() => store.unlinkProject(p.id)}>
                    {t('unlink')}
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" className="mt-2" onClick={store.linkProject}>
              <FolderPlus size={16} aria-hidden />
              {t('link_project')}
            </Button>
          </>
        )}

        <SectionLabel>{t('about')}</SectionLabel>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          <span>{t('version', version)}</span>
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => store.openUrl(SOURCE_URL)}
          >
            {t('source_code')}
          </button>
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={store.openShortcuts}
          >
            {t('change_shortcut')}
          </button>
          <Keycap>{t('shortcut')}</Keycap>
        </div>
      </main>
      {editing && (
        <FileMapEditor
          project={projects.find((p) => p.id === editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/** One relative-path input per format; no `..`, no leading slash (AC-F37.2). */
function FileMapEditor({ project, onClose }) {
  const updateFileMap = useStore((s) => s.updateFileMap);
  const [map, setMap] = useState({ ...(project?.fileMap ?? {}) });
  if (!project) return null;
  const errors = new Set(fileMapErrors(map));
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${project.name} · ${t('files')}`}
      confirmLabel={t('save')}
      onConfirm={() => errors.size === 0 && updateFileMap(project.id, map)}
    >
      <ul className="mt-3 flex flex-col gap-2">
        {Object.keys(map).map((format) => (
          <li key={format}>
            <label className="block text-sm text-muted" htmlFor={`map-${format}`}>
              {format === 'screenshots' ? t('screenshots_format') : EXPORT_LABELS[format]}
            </label>
            <input
              id={`map-${format}`}
              value={map[format]}
              aria-invalid={errors.has(format) || undefined}
              onChange={(e) => setMap({ ...map, [format]: e.target.value })}
              className={`h-7 w-full rounded-control border bg-surface px-2 font-mono text-sm text-text ${errors.has(format) ? 'border-danger' : 'border-border'}`}
            />
            {errors.has(format) && <p className="text-sm text-danger">{t('invalid_path')}</p>}
          </li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}
