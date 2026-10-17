// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as Toast from '@radix-ui/react-toast';
import * as Tooltip from '@radix-ui/react-tooltip';
import { analyze } from '../../../src/analyze/index.js';
import { applyEdit } from '../../../src/edit/apply-edit.js';
import { exportFile } from '../../../src/export/index.js';
import { makeRecord } from '../../../src/storage/snapshots.js';
import { resetStore, useStore } from '../../../entrypoints/sidepanel/store.js';
import { Home } from '../../../entrypoints/sidepanel/screens/Home.jsx';
import { History } from '../../../entrypoints/sidepanel/screens/History.jsx';
import { Results } from '../../../entrypoints/sidepanel/screens/Results.jsx';
import { StateScreen } from '../../../entrypoints/sidepanel/screens/StateScreen.jsx';
import { Toasts } from '../../../entrypoints/sidepanel/components/Toasts.jsx';
import { fakeChrome, loadRaw } from '../helpers.js';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  resetStore();
  globalThis.chrome = fakeChrome();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete globalThis.chrome;
});

function ui(node) {
  return render(
    <Toast.Provider>
      <Tooltip.Provider>
        {node}
        <Toasts />
      </Tooltip.Provider>
    </Toast.Provider>,
  );
}

function openRecord(name = 'classic', change) {
  const raw = loadRaw(name);
  let design = analyze(raw);
  if (change) design = change(design);
  const record = makeRecord(raw, design, 'r1');
  useStore.setState({ record, screen: 'results', version: '1.0.0', historyLoaded: true });
  return record;
}

describe('side panel UI', () => {
  it('AC-F2.9 clicking a swatch copies its hex and shows Copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    openRecord();
    ui(<Results />);
    await act(async () =>
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy #2563eb' })[0]),
    );
    expect(writeText).toHaveBeenCalledWith('#2563eb');
    expect(await screen.findByText('Copied')).toBeTruthy();
    expect(useStore.getState().toasts[0].duration).toBe(1500);
  });

  it('AC-F2.7 says when no primary color was detected', () => {
    openRecord('classic', (d) => applyEdit(d, { kind: 'clearRole', role: 'primary' }).design);
    ui(<Results />);
    expect(screen.getByText('No primary color detected')).toBeTruthy();
  });

  it('AC-F6.4 collapses excluded tokens into an "N excluded" row', () => {
    openRecord(
      'classic',
      (d) =>
        applyEdit(d, { kind: 'exclude', tokenId: d.colors.find((c) => c.name === 'gray-300').id })
          .design,
    );
    ui(<Results />);
    const toggle = screen.getByRole('button', { name: '1 excluded' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getAllByText('gray-300').length).toBeGreaterThan(0);
    expect(screen.getByText('Excluded')).toBeTruthy();
  });

  it('AC-F4.6 the Layout tab says breakpoints are not readable', () => {
    openRecord('classic', (d) => ({
      ...d,
      breakpoints: [],
      meta: {
        ...d.meta,
        partial: ['breakpoints', 'cssVariables'],
        stylesheets: { readable: 0, unreadable: 2 },
      },
    }));
    useStore.setState({ resultsTab: 'layout' });
    ui(<Results />);
    expect(screen.getByText('Not readable on this site')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Partial/);
  });

  it('AC-F7.2 the Export preview is exactly the exported text', () => {
    const record = openRecord();
    useStore.setState({ resultsTab: 'export', exportFormat: 'tailwind-v4' });
    ui(<Results />);
    const preview = screen.getByRole('region', { name: /theme\.css/ });
    const shown = [...preview.querySelectorAll('pre > div')]
      .map((row) => row.lastChild.textContent.replace(/^ $/, ''))
      .join('\n');
    expect(`${shown}\n`).toBe(exportFile('tailwind-v4', record.edited, '1.0.0'));
    const lines = exportFile('tailwind-v4', record.edited, '1.0.0').trimEnd().split('\n').length;
    expect(screen.getByTestId('export-footer').textContent).toMatch(
      new RegExp(`^${lines} lines · [\\d.]+ KB$`),
    );
  });

  it('AC-F5.5 the Components tab shows a card per recipe with generic labels', () => {
    openRecord();
    useStore.setState({ resultsTab: 'components' });
    ui(<Results />);
    expect(screen.getByRole('region', { name: 'Button, primary' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Heading 1' })).toBeTruthy();
    expect(screen.getAllByText('Button').length).toBeGreaterThan(0);
    expect(screen.getByText('Placeholder')).toBeTruthy();
  });

  it('AC-F6.1 renaming inline shows the error and keeps the old name', async () => {
    openRecord();
    ui(<Results />);
    const store = useStore.getState();
    const token = store.record.edited.colors.find((c) => c.name === 'gray-900');
    expect(store.edit({ kind: 'rename', tokenId: token.id, name: 'white' })).toEqual({
      ok: false,
      error: 'NAME_TAKEN',
    });
    expect(useStore.getState().record.edited.colors.find((c) => c.id === token.id).name).toBe(
      'gray-900',
    );
  });

  it('AC-F8.6 Home lists the three most recent snapshots, or the first-run steps', () => {
    const recent = [1, 2, 3].map((i) => ({
      id: `s${i}`,
      hostname: `site${i}.dev`,
      capturedAt: Date.now() - i * 3600_000,
      topColors: ['#ffffff'],
    }));
    useStore.setState({
      recent,
      history: recent,
      historyLoaded: true,
      tab: { id: 1, hostname: 'example.com', url: 'https://example.com/' },
    });
    ui(<Home />);
    expect(screen.getByRole('heading', { name: 'example.com' })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Recent' })).getAllByRole('button'),
    ).toHaveLength(3);
    cleanup();
    useStore.setState({ recent: [], history: [] });
    ui(<Home />);
    expect(screen.getByText('Extract a page')).toBeTruthy();
    expect(screen.getByText('Export to your agent')).toBeTruthy();
  });

  it('AC-F1.3 the Extract button is disabled during a run', () => {
    useStore.setState({ run: { requestId: 'x', stage: 'reading' }, historyLoaded: true });
    ui(<Home />);
    expect(screen.getByRole('button', { name: 'Extract design system' }).disabled).toBe(true);
  });

  it('AC-F8.5 History with no snapshots shows the empty state with Extract', () => {
    useStore.setState({ history: [], historyLoaded: true, screen: 'history' });
    ui(<History />);
    expect(screen.getByText('No snapshots yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Extract design system' })).toBeTruthy();
  });

  it('AC-F8.4 Delete all asks for confirmation and states the count', async () => {
    const history = [1, 2].map((i) => ({
      id: `s${i}`,
      hostname: `s${i}.dev`,
      capturedAt: Date.now(),
      topColors: [],
    }));
    useStore.setState({ history, historyLoaded: true });
    const deleteAll = vi.fn();
    useStore.setState({ deleteAll });
    ui(<History />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('This removes 2 snapshots from this computer.')).toBeTruthy();
    expect(deleteAll).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete all' }));
    expect(deleteAll).toHaveBeenCalled();
  });

  it.each([
    ['RESTRICTED_PAGE', "Can't read this page", 'Back'],
    ['FILE_ACCESS', "Can't read this page", 'Back'],
    ['NO_ACCESS', 'Give access to this tab', 'Back'],
    ['EMPTY_PAGE', 'Too little to read', 'Re-run'],
    ['TIMEOUT', 'Something went wrong', 'Retry'],
    ['PAGE_CHANGED', 'Something went wrong', 'Retry'],
    ['ANALYSIS_FAILED', 'Something went wrong', 'Copy details'],
  ])('AC-F1.6 to AC-F1.11 show the %s state', (code, title, action) => {
    useStore.setState({ screen: 'state', failure: { code, detail: 'x' } });
    ui(<StateScreen />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: new RegExp(action) }).length).toBeGreaterThan(0);
  });

  it('AC-F1.7 the file access state explains how to allow file URLs', () => {
    useStore.setState({ screen: 'state', failure: { code: 'FILE_ACCESS' } });
    ui(<StateScreen />);
    expect(screen.getByText(/Allow access to file URLs/)).toBeTruthy();
  });

  it('AC-F1.11 the page-changed error says the page changed', () => {
    useStore.setState({ screen: 'state', failure: { code: 'PAGE_CHANGED' } });
    ui(<StateScreen />);
    expect(screen.getByText('The page changed while it was being read. Try again.')).toBeTruthy();
  });
});
