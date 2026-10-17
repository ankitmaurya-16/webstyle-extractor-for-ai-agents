import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Tabs from '@radix-ui/react-tabs';
import { Crosshair, Download, FilePlus2, GitCompare, Link2, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { useStore } from '../store.js';
import { shortDate, t } from '../../../src/i18n.js';
import { modesOf } from '../../../src/model/design.js';
import { Banner, Segmented } from '../components/Basics.jsx';
import { Button } from '../components/Button.jsx';
import { Header } from '../components/Header.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { SnapshotPicker } from '../components/SnapshotPicker.jsx';
import { ColorsTab } from './ColorsTab.jsx';
import { TypeTab } from './TypeTab.jsx';
import { LayoutTab } from './LayoutTab.jsx';
import { MotionTab } from './MotionTab.jsx';
import { ComponentsTab } from './ComponentsTab.jsx';
import { InsightsTab } from './InsightsTab.jsx';
import { ExportTab } from './ExportTab.jsx';

const TABS = [
  ['colors', ColorsTab],
  ['type', TypeTab],
  ['layout', LayoutTab],
  ['motion', MotionTab],
  ['components', ComponentsTab],
  ['insights', InsightsTab],
  ['export', ExportTab],
];

const PARTIAL_LABELS = { breakpoints: 'breakpoints', cssVariables: 'CSS variables', states: 'states', dark: 'dark', frames: 'frames' };

export function Results() {
  const record = useStore((s) => s.record);
  const resultsTab = useStore((s) => s.resultsTab);
  const mode = useStore((s) => s.mode);
  const tab = useStore((s) => s.tab);
  const dismissed = useStore((s) => (s.record ? (s.dismissed[s.record.id] ?? []) : []));
  const debuggerGranted = useStore((s) => s.debuggerGranted);
  const firefox = useStore((s) => s.firefox);
  const history = useStore((s) => s.history);
  const store = useStore.getState();
  const siteAllowed = useStore((s) => s.siteAllowed());
  const [confirm, setConfirm] = useState(null); // 'reset' | 'delete' | 'compare' | null
  if (!record) return null;
  const design = record.edited;
  const modes = modesOf(design);
  const sameSiteOtherPage = tab?.hostname === record.hostname && tab?.url && !record.pages.includes(tab.url);
  const banners = [];
  if (record.migratedFromV1) banners.push(['migrated', 'info', t('banner_migrated')]);
  const warnings = record.captureWarnings ?? [];
  if (warnings.length) banners.push(['partial', 'warning', t('banner_partial', warnings.join(', '))]);
  if (record.staleEdits > 0) banners.push(['stale', 'warning', t('banner_stale', record.staleEdits), true]);
  if (modes.length > 1 && (design.meta.themeMechanism === 'class' || design.meta.themeMechanism === 'attribute')) {
    banners.push(['class-theme', 'info', t('banner_class_theme')]);
  }

  return (
    <>
      <Header
        onBack={store.goHome}
        title={`${design.meta.hostname} · ${shortDate(design.meta.capturedAt)}`}
        actions={record.pages.length > 1 && <PagesChip record={record} />}
        menu={[
          { label: t('rerun'), onSelect: () => store.extract({ intent: 'rerun' }), icon: RotateCcw },
          { label: t('add_this_page'), onSelect: () => store.extract({ intent: 'add-page' }), icon: FilePlus2, disabled: !tab?.url || record.pages.includes(tab.url) },
          { label: t('pick_element'), onSelect: store.startPick, icon: Crosshair },
          !firefox && debuggerGranted
            ? { label: t('advanced_recapture'), onSelect: () => store.extract({ intent: 'rerun', advanced: true }), icon: Sparkles }
            : null,
          { label: t('compare_with'), onSelect: () => setConfirm('compare'), icon: GitCompare, disabled: history.length < 2 },
          { label: t('map_to_my_tokens'), onSelect: store.openMap, icon: Link2 },
          { label: t('export_snapshot'), onSelect: () => store.exportSnapshotsToFile([record.id]), icon: Download },
          { label: t('reset_to_extracted'), onSelect: () => setConfirm('reset') },
          { label: t('delete'), onSelect: () => setConfirm('delete'), danger: true, icon: Trash2 },
        ]}
      >
        {(modes.length > 1 || (sameSiteOtherPage && !siteAllowed)) && (
          <div className="flex h-9 items-center justify-between gap-2 px-3">
            {modes.length > 1 ? (
              <Segmented
                label={t('theme_switch')}
                value={mode}
                onChange={store.setMode}
                options={modes.map((m) => ({ value: m, label: t(m) }))}
              />
            ) : (
              <span />
            )}
            {sameSiteOtherPage && !siteAllowed && (
              <Button variant="ghost" className="h-7 text-sm" onClick={() => store.allowSite()}>
                {t('allow_on_site')}
              </Button>
            )}
          </div>
        )}
      </Header>
      <div className="px-4">
        {banners
          .filter(([id]) => !dismissed.includes(id))
          .map(([id, tone, text, stale]) => (
            <Banner
              key={id}
              tone={tone}
              onDismiss={() => store.dismissBanner(id)}
              action={
                stale && (
                  <Button variant="secondary" className="h-7" onClick={store.clearStaleEdits}>
                    {t('clear_stale')}
                  </Button>
                )
              }
            >
              {text}
            </Banner>
          ))}
      </div>
      <Tabs.Root value={resultsTab} onValueChange={store.setResultsTab}>
        <Tabs.List
          aria-label={t('results')}
          className="scrollbar-thin sticky top-11 z-10 flex h-9 overflow-x-auto border-b border-border bg-bg px-2"
        >
          {TABS.map(([id]) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="transition-quick relative shrink-0 px-2 text-base font-medium text-muted hover:text-text data-[state=active]:text-text data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-accent"
            >
              {t(`tab_${id}`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {TABS.map(([id, Panel]) => (
          <Tabs.Content key={id} value={id} className="px-4 pb-16 outline-none">
            <Panel design={design} mode={mode} record={record} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('confirm_reset_title')}
        body={t('confirm_reset_body')}
        confirmLabel={t('confirm_reset')}
        onConfirm={store.resetToExtracted}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('confirm_delete_title')}
        body={t('confirm_delete_body')}
        confirmLabel={t('delete')}
        danger
        onConfirm={() => store.deleteSnapshot(record.id)}
      />
      <SnapshotPicker
        open={confirm === 'compare'}
        onOpenChange={(open) => !open && setConfirm(null)}
        exclude={record.id}
        onPick={(id) => {
          setConfirm(null);
          store.compare(record.id, id, 'results');
        }}
      />
    </>
  );
}

export const partialLabel = (key) => PARTIAL_LABELS[key] ?? key;

/** "N pages" pill with the page list; the last page cannot be removed (F25). */
function PagesChip({ record }) {
  const removePage = useStore((s) => s.removePage);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="transition-quick h-6 shrink-0 rounded-full bg-surface-3 px-2 text-sm text-text hover:bg-surface-2">
          {t('pages_count', record.pages.length)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          className="animate-pop z-50 w-[300px] rounded-card border border-border-strong bg-surface-2 p-2 shadow-elevated"
        >
          <p className="px-1 pb-1 text-xs text-faint uppercase">{t('page_list')}</p>
          <ul>
            {record.pages.map((url) => (
              <li key={url} className="flex h-7 items-center gap-1 px-1">
                <span className="min-w-0 flex-1 truncate font-mono text-sm" title={url}>
                  {url}
                </span>
                <button
                  type="button"
                  aria-label={t('remove_page')}
                  disabled={record.pages.length <= 1}
                  onClick={() => removePage(url)}
                  className="inline-flex size-6 items-center justify-center rounded-control text-faint hover:text-text disabled:opacity-30"
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
