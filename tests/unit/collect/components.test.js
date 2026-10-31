// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  badgeClassHint,
  componentKind,
  compositeStyles,
  isInlineLink,
} from '../../../src/collect/components.js';

const T = 'rgba(0, 0, 0, 0)';

/** A computed-style stand-in with the properties componentKind and compositeStyles read. */
function style(overrides = {}) {
  const s = {
    backgroundColor: T,
    borderTopWidth: '0px',
    borderTopStyle: 'none',
    borderTopColor: 'rgb(0, 0, 0)',
    borderTopLeftRadius: '0px',
    borderRadius: '0px',
    boxShadow: 'none',
    fontSize: '16px',
    fontWeight: '400',
    color: 'rgb(17, 24, 39)',
    display: 'block',
    flexDirection: 'row',
    paddingTop: '0px',
    paddingRight: '0px',
    paddingBottom: '0px',
    paddingLeft: '0px',
    'border-bottom-width': '0px',
    'border-bottom-style': 'none',
    'border-bottom-color': 'rgb(0, 0, 0)',
    ...overrides,
  };
  s.getPropertyValue = (name) => s[name] ?? '';
  return s;
}

const rect = (width, height) => ({ width, height });
const ctx = (siblings = 0, parentShown = 'rgb(255, 255, 255)') => ({
  parentShown,
  sameSiblings: () => siblings,
});
const el = (html) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  document.body.appendChild(wrap);
  return wrap.firstElementChild;
};

const CARD = { backgroundColor: 'rgb(249, 250, 251)', borderTopLeftRadius: '8px' };
const BADGE = {
  backgroundColor: 'rgb(22, 163, 74)',
  borderTopLeftRadius: '9999px',
  fontSize: '12px',
};

describe('component kinds (F20 detection rules)', () => {
  it('AC-F20.1 a card has a fill, border or shadow, a radius, text, a size of 120 x 80 and repeats or says card', () => {
    const card = el('<div><h3>Title</h3><p>Body</p></div>');
    expect(componentKind(card, style(CARD), rect(200, 100), ctx(2))).toBe('card');
    const named = el('<div class="product-card"><p>Body</p></div>');
    expect(componentKind(named, style(CARD), rect(200, 100), ctx(0))).toBe('card');
    const bordered = { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopLeftRadius: '8px' };
    expect(componentKind(card, style(bordered), rect(200, 100), ctx(2))).toBe('card');
  });

  it('AC-F20.2 near-misses are not cards', () => {
    const card = el('<div><h3>Title</h3><p>Body</p></div>');
    expect(componentKind(card, style(CARD), rect(200, 100), ctx(1))).toBeNull();
    expect(componentKind(card, style(CARD), rect(100, 100), ctx(2))).toBeNull();
    expect(componentKind(card, style(CARD), rect(200, 60), ctx(2))).toBeNull();
    expect(
      componentKind(card, style({ ...CARD, borderTopLeftRadius: '0px' }), rect(200, 100), ctx(2)),
    ).toBeNull();
    // A fill equal to the parent background is no fill.
    expect(
      componentKind(card, style(CARD), rect(200, 100), ctx(2, 'rgb(249, 250, 251)')),
    ).toBeNull();
    const empty = el('<div><span>No heading or paragraph</span></div>');
    expect(componentKind(empty, style(CARD), rect(200, 100), ctx(2))).toBeNull();
  });

  it('AC-F20.1 a badge is small, filled, rounded, at most 14 px text and 20 characters', () => {
    const badge = el('<span>New</span>');
    expect(componentKind(badge, style(BADGE), rect(40, 20), ctx())).toBe('badge');
    expect(
      componentKind(badge, style({ ...BADGE, fontSize: '16px' }), rect(40, 20), ctx()),
    ).toBeNull();
    expect(componentKind(badge, style(BADGE), rect(40, 40), ctx())).toBeNull();
    expect(componentKind(badge, style(BADGE), rect(240, 20), ctx())).toBeNull();
    expect(
      componentKind(badge, style({ ...BADGE, borderTopLeftRadius: '2px' }), rect(40, 20), ctx()),
    ).toBeNull();
    const long = el('<span>Twenty-one characters</span>');
    expect(componentKind(long, style(BADGE), rect(150, 20), ctx())).toBeNull();
    expect(badgeClassHint(el('<span class="status-pill">x</span>'))).toBe(true);
    // Whole words only: a tagline is not a tag.
    expect(badgeClassHint(el('<span class="tagline">x</span>'))).toBe(false);
    expect(badgeClassHint(el('<span class="pill">x</span>'))).toBe(true);
    expect(badgeClassHint(el('<span class="tag is-small">x</span>'))).toBe(true);
  });

  it('AC-F20.1 nav, role="navigation" and a header with 3 links in a row are nav bars', () => {
    expect(componentKind(el('<nav><a href="#">a</a></nav>'), style(), rect(800, 56), ctx())).toBe(
      'navbar',
    );
    expect(componentKind(el('<div role="navigation"></div>'), style(), rect(800, 56), ctx())).toBe(
      'navbar',
    );
    const header = el('<header><a href="#">a</a><a href="#">b</a><a href="#">c</a></header>');
    expect(componentKind(header, style({ display: 'flex' }), rect(800, 56), ctx())).toBe('navbar');
    expect(
      componentKind(
        header,
        style({ display: 'flex', flexDirection: 'column' }),
        rect(800, 56),
        ctx(),
      ),
    ).toBeNull();
    const two = el('<header><a href="#">a</a><a href="#">b</a></header>');
    expect(componentKind(two, style({ display: 'flex' }), rect(800, 56), ctx())).toBeNull();
  });

  it('AC-F20.1 tablists are tabs; table and role="table" are tables', () => {
    expect(componentKind(el('<div role="tablist"></div>'), style(), rect(300, 40), ctx())).toBe(
      'tabs',
    );
    expect(
      componentKind(el('<table><tr><td>x</td></tr></table>'), style(), rect(300, 40), ctx()),
    ).toBe('table');
    expect(componentKind(el('<div role="table"></div>'), style(), rect(300, 40), ctx())).toBe(
      'table',
    );
  });

  it('AC-F20.1 alerts come from role="alert", role="status" with a fill, or alert-like class names', () => {
    const fill = { backgroundColor: 'rgb(254, 226, 226)' };
    expect(componentKind(el('<div role="alert">x</div>'), style(fill), rect(600, 48), ctx())).toBe(
      'alert',
    );
    expect(componentKind(el('<div role="status">x</div>'), style(fill), rect(600, 48), ctx())).toBe(
      'alert',
    );
    expect(
      componentKind(el('<div role="status">x</div>'), style(), rect(600, 48), ctx()),
    ).toBeNull();
    for (const cls of ['alert', 'notice', 'banner', 'callout', 'toast']) {
      expect(
        componentKind(el(`<div class="${cls}">x</div>`), style(fill), rect(600, 48), ctx()),
        cls,
      ).toBe('alert');
    }
    // An alert needs something to see: a fill or a border.
    expect(
      componentKind(el('<div class="alert">x</div>'), style(), rect(600, 48), ctx()),
    ).toBeNull();
  });

  it('AC-F5.4 links styled as buttons are not inline links', () => {
    const p = el('<p>Text <a href="#a">link</a> text</p>');
    const a = p.querySelector('a');
    expect(isInlineLink(a, { backgroundColor: T })).toBe(true);
    expect(isInlineLink(a, { backgroundColor: 'rgb(37, 99, 235)' })).toBe(false);
    expect(componentKind(a, style(), rect(30, 18), ctx())).toBe('link');
  });
});

describe('composite recipe fields', () => {
  const styles = new Map();
  const getStyle = (node) => styles.get(node) ?? style();

  it('AC-F20.4 nav bars record the link style and the aria-current link style', () => {
    const nav = el('<nav><a href="#" aria-current="page">Home</a><a href="#">Docs</a></nav>');
    const [active, link] = nav.querySelectorAll('a');
    styles.set(link, style({ color: 'rgb(209, 213, 219)', fontSize: '14px', fontWeight: '500' }));
    styles.set(
      active,
      style({
        color: 'rgb(255, 255, 255)',
        fontWeight: '700',
        'border-bottom-width': '2px',
        'border-bottom-style': 'solid',
        'border-bottom-color': 'rgb(37, 99, 235)',
      }),
    );
    expect(compositeStyles('navbar', nav, getStyle)).toEqual({
      'link-color': 'rgb(209, 213, 219)',
      'link-font-size': '14px',
      'link-font-weight': '500',
      'active-color': 'rgb(255, 255, 255)',
      'active-background-color': T,
      'active-font-weight': '700',
      'active-border': '2px solid rgb(37, 99, 235)',
    });
  });

  it('AC-F20.4 tabs record the default and the selected tab', () => {
    const list = el(
      '<div role="tablist"><div role="tab" aria-selected="true">1</div><div role="tab">2</div></div>',
    );
    const [selected, plain] = list.querySelectorAll('[role="tab"]');
    styles.set(selected, style({ color: 'rgb(37, 99, 235)', fontWeight: '600' }));
    styles.set(
      plain,
      style({ color: 'rgb(107, 114, 128)', paddingTop: '8px', paddingBottom: '8px' }),
    );
    const out = compositeStyles('tabs', list, getStyle);
    expect(out).toMatchObject({
      'tab-color': 'rgb(107, 114, 128)',
      'tab-padding': '8px 0px 8px 0px',
      'selected-color': 'rgb(37, 99, 235)',
      'selected-font-weight': '600',
    });
  });

  it('AC-F20.5 tables record header, cell padding, dividers and zebra striping', () => {
    const table = el(`<table>
      <thead><tr><th>H</th></tr></thead>
      <tbody><tr><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td></tr></tbody></table>`);
    const th = table.querySelector('th');
    const tds = table.querySelectorAll('td');
    const rows = table.querySelectorAll('tbody tr');
    styles.set(
      th,
      style({ backgroundColor: 'rgb(243, 244, 246)', fontWeight: '700', fontSize: '12px' }),
    );
    styles.set(
      tds[0],
      style({
        paddingTop: '8px',
        paddingRight: '12px',
        paddingBottom: '8px',
        paddingLeft: '12px',
        'border-bottom-width': '1px',
        'border-bottom-style': 'solid',
        'border-bottom-color': 'rgb(229, 231, 235)',
      }),
    );
    styles.set(rows[1], style({ backgroundColor: 'rgb(249, 250, 251)' }));
    styles.set(rows[0], style({ backgroundColor: 'rgb(255, 255, 255)' }));
    expect(compositeStyles('table', table, getStyle)).toEqual({
      'header-background-color': 'rgb(243, 244, 246)',
      'header-color': 'rgb(17, 24, 39)',
      'header-font-weight': '700',
      'header-font-size': '12px',
      'cell-padding': '8px 12px 8px 12px',
      divider: '1px solid rgb(229, 231, 235)',
      zebra: 'rgb(249, 250, 251)',
    });
  });

  it('AC-F20.5 tables without alternating rows record no zebra', () => {
    const table = el(
      '<table><tbody><tr><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td></tr></tbody></table>',
    );
    expect(compositeStyles('table', table, getStyle)).not.toHaveProperty('zebra');
  });
});
