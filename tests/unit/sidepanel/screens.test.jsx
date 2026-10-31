// @vitest-environment jsdom
// Screen-level acceptance tests for the v2 Results tabs, Map and Diff (v2 spec section 10).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { analyze } from '../../../src/analyze/index.js';
import { diffDesigns } from '../../../src/diff/index.js';
import { EXPORT_LABELS, exportFile } from '../../../src/export/index.js';
import { HUE_FAMILIES } from '../../../src/model/types.js';
import { roleToken, visible } from '../../../src/model/design.js';
import {
  getSnapshot,
  makeRecord,
  resetConnection,
  saveSnapshot,
  toSummary,
} from '../../../src/storage/snapshots.js';
import { t } from '../../../src/i18n.js';
import { resetStore, setWorkerFactory, useStore } from '../../../entrypoints/sidepanel/store.js';
import { Results } from '../../../entrypoints/sidepanel/screens/Results.jsx';
import { Diff } from '../../../entrypoints/sidepanel/screens/Diff.jsx';
import { MapScreen } from '../../../entrypoints/sidepanel/screens/MapScreen.jsx';
import { Toasts } from '../../../entrypoints/sidepanel/components/Toasts.jsx';
import { Dialogs } from '../../../entrypoints/sidepanel/components/Dialogs.jsx';
import { analyzeRaw, capturesFor, loadRaw } from '../helpers.js';
import {
  capturesReply,
  fakeChromeV2,
  fakeServiceWorker,
  fakeWorker,
  loadWorkerHandler,
} from './fakes.js';

let chrome;

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  await loadWorkerHandler();
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetConnection();
  resetStore();
  chrome = fakeChromeV2();
  globalThis.chrome = chrome;
  fakeServiceWorker(chrome, { EXTRACT: (msg) => capturesReply(msg) });
  setWorkerFactory(() => fakeWorker());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetStore();
  delete globalThis.chrome;
});

function ui(node) {
  return render(
    <Toast.Provider>
      <Tooltip.Provider delayDuration={0}>
        {node}
        <Toasts />
        <Dialogs />
      </Tooltip.Provider>
    </Toast.Provider>,
  );
}

/** A record built the way the panel builds one; `name` is a captured fixture or a raw. */
function buildRecord(name = 'classic', { id = 'r1', kind = 'page', change } = {}) {
  const base = typeof name === 'string' ? loadRaw(name) : name;
  const raw = { ...base, capturedAt: Date.UTC(2026, 9, 20) };
  const captures = capturesFor(raw).map((c, i) => ({ ...c, id: `${id}-${i}` }));
  const extracted = analyze(captures);
  change?.(extracted);
  return makeRecord({ id, kind, captures, extracted, edited: structuredClone(extracted) });
}

/** Opens the record on Results at `tab` and renders the screen. */
async function openTab(name, tab, options = {}) {
  const record = buildRecord(name, options);
  useStore.setState({
    record,
    screen: 'results',
    mode: options.mode ?? record.edited.meta.primaryMode ?? 'light',
    version: '2.0.0',
    historyLoaded: true,
    tab: options.tab ?? null,
    ...options.state,
  });
  const view = ui(<Results />);
  await act(async () => useStore.getState().setResultsTab(tab));
  return { record, design: record.edited, panel: screen.getByRole('tabpanel'), ...view };
}

/** The section that starts with the h2 or h3 `label` and runs to the next label. */
function sectionText(panel, label) {
  const heading = within(panel)
    .getAllByRole('heading')
    .find((h) => h.textContent === label);
  expect(heading, label).toBeTruthy();
  let text = '';
  for (let node = heading.parentElement.nextElementSibling; node;) {
    if (node.querySelector?.(':scope > h2, :scope > h3')) break;
    text += node.textContent;
    node = node.nextElementSibling;
  }
  return text;
}

const headings = (panel) =>
  within(panel)
    .getAllByRole('heading')
    .map((h) => h.textContent);

async function openMenu() {
  await act(async () =>
    fireEvent.keyDown(screen.getByRole('button', { name: t('menu') }), { key: 'Enter' }),
  );
  return screen.findByRole('menu');
}

describe('Colors tab', () => {
  it('AC-F9.8 translucent rows show a checkerboard swatch and the "on X looks like Y" line', async () => {
    const { design, panel } = await openTab('translucent', 'colors');
    expect(headings(panel)).toContain(t('translucent'));
    const translucent = visible(design.colors).filter((c) => c.alpha < 1);
    expect(translucent.length).toBeGreaterThan(0);
    for (const token of translucent) {
      const row = panel.querySelector(`[data-token-id="${token.id}"]`);
      expect(row.querySelector('.checker'), token.name).not.toBeNull();
      expect(row.textContent).toContain(t('looks_like', token.backdropHex, token.effectiveHex));
    }
    const black = translucent.find((c) => c.hex === '#0000001a');
    expect(panel.querySelector(`[data-token-id="${black.id}"]`).textContent).toContain(
      t('looks_like', '#ffffff', '#e6e6e6'),
    );
  });

  it('AC-F13.8 the Light / Dark switch appears only when both modes exist', async () => {
    const { unmount } = await openTab('classic', 'colors');
    expect(screen.queryByRole('radiogroup', { name: t('theme_switch') })).toBeNull();
    unmount();
    await openTab('dark-media', 'colors');
    const group = screen.getByRole('radiogroup', { name: t('theme_switch') });
    expect(within(group).getByRole('radio', { name: t('light') })).toBeTruthy();
    expect(within(group).getByRole('radio', { name: t('dark') })).toBeTruthy();
  });

  it('AC-F13.8 semantic rows show a swatch for each theme', async () => {
    const { design, panel } = await openTab('dark-media', 'colors');
    const background = panel.querySelector('[data-role="background"]');
    expect(background).not.toBeNull();
    const swatches = background.querySelectorAll('button[aria-label^="Copy"]');
    expect(swatches).toHaveLength(2);
    const lightHex = roleToken(design, 'background', 'light').hex;
    const darkHex = roleToken(design, 'background', 'dark').hex;
    expect(swatches[0].getAttribute('aria-label')).toBe(t('copy_hex', lightHex));
    expect(swatches[1].getAttribute('aria-label')).toBe(t('copy_hex', darkHex));
  });

  it('AC-F18.5 the Gradients section shows a preview strip per gradient', async () => {
    const { design, panel } = await openTab('gradients', 'colors');
    const gradients = visible(design.gradients);
    expect(gradients.length).toBeGreaterThan(0);
    expect(headings(panel)).toContain(t('gradients'));
    for (const g of gradients) {
      const row = panel.querySelector(`[data-token-id="${g.id}"]`);
      expect(row, g.name).not.toBeNull();
      const strip = [...row.querySelectorAll('span[style]')].find((s) =>
        s.style.backgroundImage.includes('gradient'),
      );
      expect(strip, g.name).toBeTruthy();
    }
  });

  it('AC-F28.5 "Low confidence first" orders the scale families and the other colors', async () => {
    const { design, panel } = await openTab('utility', 'colors');
    const familyOrder = () =>
      [...panel.querySelectorAll('[data-family]')].map((el) => el.dataset.family);
    const shown = visible(design.colors).filter((c) => c.alpha >= 1 && c.step !== null);
    const families = HUE_FAMILIES.filter((f) => shown.some((c) => c.family === f));
    expect(familyOrder()).toEqual(families);
    const toggle = within(panel).getByRole('switch', { name: t('sort_low_first') });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await act(async () => fireEvent.click(toggle));
    expect(useStore.getState().sortLowFirst).toBe(true);
    const min = (f) =>
      Math.min(...shown.filter((c) => c.family === f).map((c) => c.confidence.score));
    expect(familyOrder()).toEqual([...families].sort((a, b) => min(a) - min(b)));
    const others = visible(design.colors).filter((c) => c.alpha >= 1 && c.step === null);
    const rows = [...panel.querySelectorAll('[data-token-id]')]
      .map((el) => el.dataset.tokenId)
      .filter((id) => others.some((c) => c.id === id));
    expect(rows).toEqual(
      [...others].sort((a, b) => a.confidence.score - b.confidence.score).map((c) => c.id),
    );
  });
});

describe('Type, Layout and Motion tabs', () => {
  it('AC-F15.5 the Type tab shows rendered text styles and the letter-spacing list', async () => {
    const { design, panel } = await openTab('typography', 'type');
    const styles = visible(design.typography.textStyles);
    expect(styles.length).toBeGreaterThan(1);
    expect(headings(panel)).toContain(t('text_styles'));
    for (const s of styles) {
      const row = panel.querySelector(`[data-token-id="${s.id}"]`);
      const sample = within(row).getByText(t('style_sample'));
      expect(sample.style.fontWeight).toBe(String(s.fontWeight));
      expect(sample.style.fontSize).toBe(`${Math.min(s.sizePx, 24)}px`);
    }
    const tracking = visible(design.typography.letterSpacings);
    expect(tracking.length).toBeGreaterThan(1);
    expect(headings(panel)).toContain(t('letter_spacing'));
    const text = sectionText(panel, t('letter_spacing'));
    for (const x of tracking) expect(text).toContain(`${x.em}em`);
  });

  it('AC-F19.5 the Web fonts card shows every family with its provider', async () => {
    const { design, panel } = await openTab('typography', 'type');
    const webFonts = design.meta.webFonts;
    expect(webFonts.length).toBeGreaterThanOrEqual(4);
    const text = sectionText(panel, t('web_fonts'));
    for (const f of webFonts) expect(text).toContain(f.family);
    expect(text).toContain(t('provider_google_fonts'));
    expect(text).toContain(t('provider_adobe_fonts'));
  });

  it('AC-F16.5 the Layout tab shows containers, grid counts and gaps', async () => {
    const { design, panel } = await openTab('layout', 'layout');
    const { containers, gridColumns, gaps } = design.layout;
    expect(headings(panel)).toEqual(
      expect.arrayContaining([t('containers'), t('grid'), t('gaps')]),
    );
    const containerText = sectionText(panel, t('containers'));
    for (const c of visible(containers)) expect(containerText).toContain(`${c.px}px`);
    const gridText = sectionText(panel, t('grid'));
    for (const g of visible(gridColumns)) expect(gridText).toContain(t('columns', g.value));
    const gapText = sectionText(panel, t('gaps'));
    for (const g of visible(gaps)) expect(gapText).toContain(`${g.px}px`);
  });

  it('AC-F17.5 the Layout tab shows the Borders, Opacity and Z-index sections', async () => {
    const { design, panel } = await openTab('layout', 'layout');
    const labels = headings(panel);
    expect(labels.some((l) => l.startsWith(t('borders')))).toBe(true);
    expect(labels).toEqual(expect.arrayContaining([t('opacity'), t('z_index')]));
    const zText = sectionText(panel, t('z_index'));
    for (const z of visible(design.zIndex)) expect(zText).toContain(z.name);
    const opacityText = sectionText(panel, t('opacity'));
    for (const o of visible(design.opacities)) expect(opacityText).toContain(o.name);
    for (const b of visible(design.borderWidths))
      expect(panel.querySelector(`[data-token-id="${b.id}"]`)).not.toBeNull();
  });

  it('AC-F14.6 the Motion tab shows durations and curves; previews respect reduced motion', async () => {
    const { design, panel } = await openTab('motion', 'motion');
    expect(headings(panel)).toEqual(expect.arrayContaining([t('durations'), t('easings')]));
    const durations = sectionText(panel, t('durations'));
    for (const d of visible(design.motion.durations)) expect(durations).toContain(`${d.ms}ms`);
    const curves = visible(design.motion.easings).filter((e) => e.bezier);
    expect(curves.length).toBeGreaterThan(0);
    for (const e of curves) {
      const row = panel.querySelector(`[data-token-id="${e.id}"]`);
      expect(row.querySelector('svg.curve path'), e.name).not.toBeNull();
    }
    // The dot only travels on hover, and the reduced-motion rule turns every animation off.
    const css = readFileSync(resolve(process.cwd(), 'entrypoints/sidepanel/theme.css'), 'utf8');
    expect(css).toMatch(/\.curve:hover \.curve-dot\s*{[^}]*animation:/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/,
    );
  });
});

describe('Components tab', () => {
  it('AC-F12.8 shows the focus ring card, the state switcher, marked changes and the source label', async () => {
    const { design, panel } = await openTab('states', 'components');
    const focus = within(panel).getByRole('region', { name: t('focus_ring') });
    expect(focus.textContent).not.toContain(t('focus_ring_none'));
    expect(focus.textContent).toContain(t('source_stylesheet'));
    const recipe = design.components.find((r) =>
      Object.keys(r.byMode[design.meta.primaryMode]).includes('hover'),
    );
    const card = panel.querySelector(`[data-recipe="${recipe.id}"]`);
    const group = within(card).getByRole('radiogroup', { name: t('states_label') });
    const marked = () =>
      within(card).queryAllByText((_, el) => el.textContent.trim() === `← ${t('changed')}`);
    expect(marked()).toHaveLength(0);
    await act(async () =>
      fireEvent.click(within(group).getByRole('radio', { name: t('state_hover') })),
    );
    const hover = recipe.byMode[design.meta.primaryMode].hover;
    expect(marked().length).toBe(Object.keys(hover).length);
    expect(card.textContent).toContain(t('source_stylesheet'));
  });

  it('AC-F26.9 "Add to snapshot…" adds the picked recipe to the chosen snapshot as variant picked', async () => {
    const target = buildRecord('classic', { id: 'target' });
    await saveSnapshot(target);
    const { design } = await openTab('states', 'components', {
      id: 'picked',
      kind: 'component',
      state: { history: [toSummary(target)] },
    });
    expect(screen.getByText(t('picked_component'))).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: t('add_to_snapshot') })),
    );
    const dialog = await screen.findByRole('dialog');
    await act(async () =>
      fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(target.hostname) })),
    );
    const source = design.components.find((r) => !r.excluded);
    await vi.waitFor(async () => {
      const saved = await getSnapshot('target');
      const picked = saved.edited.components.find((r) => r.variant === 'picked');
      expect(picked).toBeTruthy();
      expect(picked.kind).toBe(source.kind);
      expect(picked.byMode).toEqual(source.byMode);
      expect(saved.extracted.components.some((r) => r.variant === 'picked')).toBe(true);
    });
    expect(await screen.findByText(t('toast_added_to_snapshot', target.hostname))).toBeTruthy();
  });

  it('AC-F26.9 a page snapshot has no "Add to snapshot…" button', async () => {
    await openTab('states', 'components');
    expect(screen.queryByRole('button', { name: t('add_to_snapshot') })).toBeNull();
  });
});

describe('Results header', () => {
  it.each([
    ['a new readable page of the snapshot', 'http://127.0.0.1:4173/about.html', false],
    ['a page already in the snapshot', null, true],
    ['a restricted page', 'chrome://extensions/', true],
    ['no tab URL', undefined, true],
  ])('AC-F25.1 "Add this page" for %s', async (_, url, disabled) => {
    const raw = loadRaw('classic');
    const tabUrl = url === null ? raw.url : url;
    await openTab('classic', 'colors', {
      tab: { id: 7, url: tabUrl, hostname: tabUrl ? new URL(tabUrl).hostname : undefined },
    });
    const menu = await openMenu();
    const item = within(menu).getByRole('menuitem', { name: t('add_this_page') });
    expect(item.hasAttribute('data-disabled')).toBe(disabled);
  });
});

describe('Insights tab', () => {
  it('AC-F21.5 Insights shows the Icons card with library, size and stroke', async () => {
    const { design, panel } = await openTab('icons-lucide', 'insights');
    const text = sectionText(panel, t('icons'));
    expect(text).toContain('Lucide');
    expect(text).toContain(t('icon_size', design.meta.iconSizePx, design.meta.iconStroke));
  });

  it('AC-F22.7 Insights shows the coverage line', async () => {
    const { design, panel } = await openTab('coverage', 'insights');
    const c = design.meta.coverage;
    const line = within(panel).getByTestId('coverage-line');
    expect(line.textContent).toContain(
      t('coverage_line', c.frames.read, c.frames.skipped, c.shadowRoots),
    );
    expect(line.textContent).toContain(t('auto_scrolled'));
  });

  it('AC-F22.7 meta.partial includes frames when a frame was skipped, and the line counts it', async () => {
    const raw = loadRaw('coverage');
    const skipped = {
      ...raw,
      coverage: { ...raw.coverage, frames: { read: 2, skipped: 1 } },
    };
    expect(analyzeRaw(skipped).meta.partial).toContain('frames');
    expect(analyzeRaw(raw).meta.partial).not.toContain('frames');
    const { panel } = await openTab(skipped, 'insights');
    expect(within(panel).getByTestId('coverage-line').textContent).toContain(
      t('coverage_line', 2, 1, raw.coverage.shadowRoots),
    );
  });

  it('AC-F27.6 the Accessibility card shows pairs, levels and the failing filter', async () => {
    const { design, panel } = await openTab('classic', 'insights');
    const rows = () => [...panel.querySelectorAll('li[data-level]')];
    expect(rows()).toHaveLength(design.contrast.length);
    for (const row of rows())
      expect(row.textContent).toContain(
        row.dataset.level === 'fail' ? t('fail') : row.dataset.level,
      );
    expect(within(panel).queryByRole('radiogroup', { name: t('contrast_theme') })).toBeNull();
    await act(async () =>
      fireEvent.click(within(panel).getByRole('switch', { name: t('failing_only') })),
    );
    expect(rows().every((r) => r.dataset.level === 'fail')).toBe(true);
    expect(rows()).toHaveLength(design.contrast.filter((c) => c.level === 'fail').length);
  });

  it('AC-F27.6 the theme switch shows the pairs of the chosen theme', async () => {
    const { design, panel } = await openTab('dark-media', 'insights', {
      change: (d) => {
        const light = d.contrast.filter((c) => c.mode === 'light');
        d.contrast = [
          ...light,
          ...light.slice(0, 1).map((c) => ({ ...c, mode: 'dark', ratio: 1.5, level: 'fail' })),
        ];
      },
    });
    const light = design.contrast.filter((c) => c.mode === 'light');
    const rows = () => [...panel.querySelectorAll('li[data-level]')];
    expect(rows()).toHaveLength(light.length);
    const group = within(panel).getByRole('radiogroup', { name: t('contrast_theme') });
    await act(async () => fireEvent.click(within(group).getByRole('radio', { name: t('dark') })));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].dataset.level).toBe('fail');
    await act(async () => fireEvent.click(within(group).getByRole('radio', { name: t('light') })));
    expect(rows()).toHaveLength(light.length);
  });

  it('AC-F28.4 rows show the medium and low dots with reasons in a tooltip', async () => {
    const { design, panel } = await openTab('classic', 'type');
    const tokens = [
      ...design.typography.families,
      ...design.typography.sizes,
      ...design.typography.textStyles,
    ].filter((x) => !x.excluded);
    const medium = tokens.find((x) => x.confidence?.level === 'medium');
    const low = tokens.find((x) => x.confidence?.level === 'low');
    const high = tokens.find((x) => x.confidence?.level === 'high');
    for (const [token, label] of [
      [medium, t('confidence_medium')],
      [low, t('confidence_low')],
    ]) {
      expect(token).toBeTruthy();
      const dot = panel.querySelector(`[data-token-id="${token.id}"] [data-confidence]`);
      expect(dot.dataset.confidence).toBe(token.confidence.level);
      expect(dot.getAttribute('aria-label')).toBe(
        `${label}: ${token.confidence.reasons.join('; ')}`,
      );
    }
    if (high)
      expect(panel.querySelector(`[data-token-id="${high.id}"] [data-confidence]`)).toBeNull();
    const dot = panel.querySelector(`[data-token-id="${low.id}"] [data-confidence]`);
    await act(async () => fireEvent.focus(dot));
    const tooltip = await screen.findByRole('tooltip');
    for (const reason of low.confidence.reasons) expect(tooltip.textContent).toContain(reason);
  });

  it('AC-F28.5 Insights lists low-confidence items, and "Low confidence first" sorts them', async () => {
    const { design, panel } = await openTab('classic', 'insights');
    const ids = design.audit.lowConfidence;
    expect(ids.length).toBeGreaterThan(1);
    const list = within(panel).getByRole('list', { name: t('check_first') });
    const order = () =>
      [...list.querySelectorAll('[data-token-id]')].map((el) => el.dataset.tokenId);
    expect(order()).toEqual(ids.slice(0, 12));
    const score = (id) =>
      [
        ...design.colors,
        ...design.typography.families,
        ...design.typography.sizes,
        ...design.typography.textStyles,
        ...design.typography.letterSpacings,
        ...design.spacing.tokens,
        ...design.radii,
        ...design.shadows,
        ...design.breakpoints,
        ...design.borderWidths,
        ...(design.layout?.gridColumns ?? []),
        ...(design.layout?.containers ?? []),
        ...(design.layout?.gaps ?? []),
        ...design.components,
      ].find((x) => x.id === id)?.confidence?.score ?? Infinity;
    await act(async () =>
      fireEvent.click(within(panel).getByRole('switch', { name: t('sort_low_first') })),
    );
    expect(order()).toEqual([...ids].sort((a, b) => score(a) - score(b)).slice(0, 12));
  });

  it('AC-F29.5 the Consistency card shows counts with expandable lists', async () => {
    const { design, panel } = await openTab('utility', 'insights');
    const audit = design.audit;
    const merged = within(panel).getByRole('button', {
      name: t('colors_merged', audit.colorsBeforeMerge, audit.colorsAfterMerge),
    });
    expect(merged.getAttribute('aria-expanded')).toBe('false');
    await act(async () => fireEvent.click(merged));
    expect(merged.getAttribute('aria-expanded')).toBe('true');
    const card = merged.closest('li');
    for (const g of audit.nearDuplicateGroups) expect(card.textContent).toContain(g.kept);
    const offScale = within(panel).getByRole('button', {
      name: t('off_scale', audit.offScaleSpacing.length),
    });
    await act(async () => fireEvent.click(offScale));
    for (const o of audit.offScaleSpacing)
      expect(offScale.closest('li').textContent).toContain(`${o.px}px`);
    await act(async () => fireEvent.click(merged));
    expect(merged.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Export tab', () => {
  it('AC-F31.8 the Export tab offers the format choice next to the shadcn preview', async () => {
    const { design } = await openTab('classic', 'export');
    expect(screen.queryByRole('radiogroup', { name: t('shadcn_format') })).toBeNull();
    await act(async () => useStore.getState().setExportFormat('shadcn'));
    const group = screen.getByRole('radiogroup', { name: t('shadcn_format') });
    expect(within(group).getByRole('radio', { name: 'oklch' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    const preview = () =>
      [
        ...screen
          .getByRole('region', { name: t('preview_label', EXPORT_LABELS.shadcn) })
          .querySelectorAll('pre > div'),
      ]
        .map((line) => line.lastChild.textContent.replace(/^ $/, ''))
        .join('\n');
    expect(preview()).toContain('oklch(');
    await act(async () => fireEvent.click(within(group).getByRole('radio', { name: 'hsl' })));
    await vi.waitFor(() => expect(useStore.getState().settings.shadcnFormat).toBe('hsl'));
    expect(preview()).not.toContain('oklch(');
    expect(preview()).toBe(
      exportFile('shadcn', design, '2.0.0', {
        mapping: null,
        shadcnFormat: 'hsl',
        screenshots: [],
      }).replace(/\n$/, ''),
    );
  });

  it('AC-F33.4 "Copy prompt" copies prompt.md in one click', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { design } = await openTab('classic', 'export');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t('copy_prompt') })));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe(
      exportFile('prompt', design, '2.0.0', useStore.getState().exportContext()),
    );
    expect(useStore.getState().exportFormat).toBe('design-md');
  });
});

describe('Map and Diff', () => {
  it('AC-F38.4 the table shows status chips, the unmatched filter and counts', async () => {
    const record = buildRecord('classic');
    const [a, b, c] = record.edited.colors;
    const entries = [
      { tokenId: a.id, userToken: '--brand', status: 'exact', delta: 0 },
      { tokenId: b.id, userToken: '--ink', status: 'close', delta: 0.03 },
      { tokenId: c.id, userToken: null, status: 'none', delta: null },
    ];
    useStore.setState({
      record: {
        ...record,
        mapping: { sourceName: 'tokens.css', importedAt: 1, useMyNames: false, entries },
      },
      screen: 'map',
    });
    ui(<MapScreen />);
    expect(screen.getByText(new RegExp(t('map_counts', 1, 1, 1)))).toBeTruthy();
    const rows = () => [...document.querySelectorAll('li[data-status]')];
    expect(rows().map((r) => r.dataset.status)).toEqual(['exact', 'close', 'none']);
    expect(rows()[0].textContent).toContain(t('status_exact'));
    expect(rows()[1].textContent).toContain(t('status_close'));
    expect(rows()[2].textContent).toContain(t('status_none'));
    await act(async () =>
      fireEvent.click(screen.getByRole('switch', { name: t('unmatched_only') })),
    );
    expect(rows().map((r) => r.dataset.status)).toEqual(['none']);
    expect(rows()[0].textContent).toContain(c.name);
  });

  it('AC-F39.6 the Diff screen shows counts, sections and filters', async () => {
    const a = buildRecord('classic', { id: 'a' });
    const b = buildRecord('utility', { id: 'b' });
    const result = diffDesigns(a.edited, b.edited);
    useStore.setState({
      diff: {
        a: { hostname: 'a.example', capturedAt: Date.UTC(2026, 9, 1) },
        b: { hostname: 'b.example', capturedAt: Date.UTC(2026, 9, 18) },
        result,
      },
      screen: 'diff',
    });
    ui(<Diff />);
    expect(screen.getByText(/A a\.example/)).toBeTruthy();
    expect(screen.getByText(/B b\.example/)).toBeTruthy();
    const c = result.counts;
    expect(
      screen.getByText(t('diff_counts', c.added, c.removed, c.changed, c.renamed)),
    ).toBeTruthy();
    const categories = Object.entries(result.categories).filter(
      ([, d]) => d.added.length + d.removed.length + d.changed.length + d.renamed.length > 0,
    );
    expect(categories.length).toBeGreaterThan(0);
    const labels = screen.getAllByRole('heading').map((h) => h.textContent);
    for (const [category] of categories) expect(labels).toContain(category);
    const rows = () =>
      [...document.querySelectorAll('li[data-status]')].map((r) => r.dataset.status);
    const group = screen.getByRole('radiogroup', { name: t('diff_title') });
    for (const filter of ['added', 'removed', 'changed']) {
      await act(async () =>
        fireEvent.click(within(group).getByRole('radio', { name: t(`filter_${filter}`) })),
      );
      expect(rows().length, filter).toBeGreaterThan(0);
      expect(new Set(rows()), filter).toEqual(new Set([filter]));
    }
    await act(async () =>
      fireEvent.click(within(group).getByRole('radio', { name: t('filter_all') })),
    );
    expect(new Set(rows()).size).toBeGreaterThan(1);
  });
});
