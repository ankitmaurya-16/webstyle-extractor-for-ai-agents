import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Box, Crosshair, FileText, Layers, Pipette, Plus, Trash2, X } from 'lucide-react';
import { useStore, SOURCE_URL } from '../store.js';
import { relativeDate, t } from '../../../src/i18n.js';
import { Button, Keycap } from '../components/Button.jsx';
import { ColorStrip, SectionLabel, SwitchRow } from '../components/Basics.jsx';
import { Header, HistoryButton, SettingsButton } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';

export const KIND_ICONS = { page: FileText, site: Layers, component: Box };

export function KindIcon({ kind }) {
  const Icon = KIND_ICONS[kind] ?? FileText;
  return (
    <span className="shrink-0 text-faint" title={t(`kind_${kind ?? 'page'}`)}>
      <Icon size={14} aria-hidden />
      <span className="sr-only">{t(`kind_${kind ?? 'page'}`)}</span>
    </span>
  );
}

export function Home() {
  const tab = useStore((s) => s.tab);
  const run = useStore((s) => s.run);
  const recent = useStore((s) => s.recent);
  const history = useStore((s) => s.history);
  const loaded = useStore((s) => s.historyLoaded);
  const capture = useStore((s) => s.capture);
  const firefox = useStore((s) => s.firefox);
  const { extract, openHistory, openSettings, openSnapshot, openShortcuts, openUrl, deleteAll, setCapture, toggleAdvanced, startPick } =
    useStore.getState();
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <>
      <Header
        actions={
          <>
            <HistoryButton onClick={openHistory} />
            <SettingsButton onClick={openSettings} />
          </>
        }
        menu={[
          { label: t('change_shortcut'), onSelect: openShortcuts },
          { label: t('source_code'), onSelect: () => openUrl(SOURCE_URL) },
          { label: t('delete_all_history'), onSelect: () => setConfirmAll(true), danger: true, icon: Trash2 },
        ]}
      />
      <main className="p-4">
        <h1 className="truncate text-lg">{tab?.hostname ?? t('current_tab')}</h1>
        {tab?.url && (
          <p className="truncate font-mono text-sm text-faint" title={tab.url}>
            {tab.url}
          </p>
        )}
        <Button variant="primary" className="mt-4 w-full" disabled={Boolean(run)} onClick={() => extract({ intent: 'new' })}>
          <Pipette size={16} aria-hidden />
          {t('extract')}
        </Button>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button variant="secondary" className="h-7" disabled={Boolean(run) || !tab?.id} onClick={startPick}>
            <Crosshair size={14} aria-hidden />
            {t('pick_element')}
          </Button>
          <p className="text-sm text-faint">
            {t('or_press')} <Keycap>{t('shortcut')}</Keycap>
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <SwitchRow id="opt-scroll" label={t('scroll_to_load')} checked={capture.autoScroll} onChange={(v) => setCapture({ autoScroll: v })} />
          {!firefox && (
            <SwitchRow
              id="opt-advanced"
              label={t('advanced_capture')}
              description={capture.advanced ? null : t('advanced_help')}
              checked={capture.advanced}
              onChange={toggleAdvanced}
              trailing={capture.advanced && <AdvancedOptions />}
            />
          )}
          <SwitchRow
            id="opt-screenshots"
            label={t('include_screenshots')}
            description={t('include_screenshots_help')}
            checked={capture.screenshots}
            onChange={(v) => setCapture({ screenshots: v })}
          />
        </div>

        {loaded && recent.length > 0 && (
          <section aria-label={t('recent')}>
            <SectionLabel>{t('recent')}</SectionLabel>
            <ul className="flex flex-col">
              {recent.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openSnapshot(r.id)}
                    className="transition-quick flex h-8 w-full items-center gap-2 rounded-control px-1 text-left hover:bg-surface"
                  >
                    <KindIcon kind={r.kind} />
                    <ColorStrip colors={r.topColors} />
                    <span className="min-w-0 flex-1 truncate">
                      {r.hostname}
                      {r.pages > 1 && <span className="text-faint"> · {t('pages_count', r.pages)}</span>}
                    </span>
                    <span className="shrink-0 text-sm text-faint">{relativeDate(r.capturedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {loaded && recent.length === 0 && (
          <ol className="mt-6 flex flex-col gap-2" aria-label={t('how_it_works')}>
            {['first_run_1', 'first_run_2', 'first_run_3'].map((key, i) => (
              <li key={key} className="flex items-center gap-3 text-muted">
                <span className="flex size-5 items-center justify-center rounded-full bg-surface-3 font-mono text-[11px] text-text">{i + 1}</span>
                {t(key)}
              </li>
            ))}
          </ol>
        )}
      </main>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('confirm_delete_all_title')}
        body={t('confirm_delete_all_body', history.length)}
        confirmLabel={t('delete_all')}
        danger
        onConfirm={deleteAll}
      />
    </>
  );
}

/** Advanced capture options, defaulting from Settings (F23, F24). */
export function AdvancedOptions() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="transition-quick h-7 shrink-0 rounded-control px-2 text-sm text-accent hover:bg-surface-2">
          {t('advanced_options')}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="animate-pop z-50 w-[260px] rounded-card border border-border-strong bg-surface-2 p-3 shadow-elevated"
        >
          <AdvancedDefaults />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Shared by the Home popover and Settings. */
export function AdvancedDefaults() {
  const defaults = useStore((s) => s.settings.advancedDefaults);
  const updateSettings = useStore((s) => s.updateSettings);
  const [width, setWidth] = useState('');
  const set = (patch) => updateSettings({ advancedDefaults: { ...defaults, ...patch } });
  const addWidth = () => {
    const w = Number(width);
    if (w >= 320 && w <= 1920 && !defaults.widths.includes(w) && defaults.widths.length < 4) set({ widths: [...defaults.widths, w].sort((a, b) => a - b) });
    setWidth('');
  };
  return (
    <div className="flex flex-col gap-1">
      <SwitchRow id="adv-deep" label={t('deep_scan')} checked={defaults.deepScan} onChange={(v) => set({ deepScan: v })} />
      <SwitchRow id="adv-dark" label={t('dark_theme')} checked={defaults.dark} onChange={(v) => set({ dark: v })} />
      <SwitchRow id="adv-states" label={t('states_option')} checked={defaults.states} onChange={(v) => set({ states: v })} />
      <p className="mt-2 text-sm text-faint">{t('widths')}</p>
      <div className="flex flex-wrap items-center gap-1">
        {defaults.widths.map((w) => (
          <span key={w} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-3 pr-1 pl-2 font-mono text-sm">
            {w}
            <button
              type="button"
              aria-label={t('remove_width', w)}
              onClick={() => set({ widths: defaults.widths.filter((x) => x !== w) })}
              className="inline-flex size-4 items-center justify-center rounded-full text-faint hover:text-text"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        {defaults.widths.length < 4 && (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              addWidth();
            }}
          >
            <input
              value={width}
              inputMode="numeric"
              aria-label={t('add_width')}
              onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))}
              className="h-6 w-14 rounded-control border border-border bg-surface px-1 font-mono text-sm text-text"
            />
            <button type="submit" aria-label={t('add_width')} className="inline-flex size-6 items-center justify-center rounded-control text-muted hover:bg-surface-3">
              <Plus size={12} aria-hidden />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
