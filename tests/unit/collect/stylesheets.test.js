// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readStylesheets, resolveVars, selectorScope } from '../../../src/collect/stylesheets.js';

/** A window whose matchMedia matches min-width queries up to `width`, like a 1280 px viewport. */
const fakeWin = (width = 1280) => ({
  matchMedia: (query) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const max = /max-width:\s*(\d+)px/.exec(query);
    const dark = /prefers-color-scheme:\s*dark/.test(query);
    return {
      matches: !dark && (!min || width >= Number(min[1])) && (!max || width <= Number(max[1])),
    };
  },
});

function read(css, { texts = [], width } = {}) {
  document.head.innerHTML = `<style>${css}</style>`;
  return readStylesheets({
    sheets: [...document.styleSheets],
    texts,
    doc: document,
    win: fakeWin(width),
  });
}

describe('state rules from readable stylesheets (F12, stylesheet path)', () => {
  it('AC-F12.1 records each state selector in a list with its base selector and states', () => {
    const out = read('.btn:hover, a:focus-visible, .card { background-color: #1e40af; }');
    expect(out.stateRules.map((r) => [r.selector, r.base, r.states])).toEqual([
      ['.btn:hover', '.btn', ['hover']],
      ['a:focus-visible', 'a', ['focus-visible']],
    ]);
    expect(Object.keys(out.stateRules[0].decls)).toEqual(['background-color']);
  });

  it('AC-F12.1 ignores state rules that set none of the recipe properties', () => {
    const out = read('.btn:hover { cursor: pointer; } a:active { color: red; }');
    expect(out.stateRules.map((r) => r.selector)).toEqual(['a:active']);
  });

  it('AC-F12.2 stores specificity and source order so conflicts can be resolved', () => {
    const out = read(`
      button.btn:hover { background-color: #1e40af; }
      .btn:hover { background-color: #3b82f6; }
      .btn:hover { background-color: #60a5fa; }`);
    const [a, b, c] = out.stateRules;
    expect(a.spec).toEqual([0, 2, 1]);
    expect(b.spec).toEqual([0, 2, 0]);
    expect(b.order).toBeLessThan(c.order);
  });

  it('AC-F12.2 marks state rules inside non-matching @media blocks so they are ignored', () => {
    const out = read(`
      @media (max-width: 400px) { .btn:hover { color: #ef4444; } }
      @media (min-width: 100px) { .btn:active { color: #1e3a8a; } }
      @supports (display: grid) { .btn:focus { color: #111827; } }`);
    expect(out.stateRules.map((r) => [r.selector, r.mediaMatches])).toEqual([
      ['.btn:hover', false],
      ['.btn:active', true],
      ['.btn:focus', true],
    ]);
  });

  it('AC-F12.2 nested @media blocks match only when every level matches', () => {
    const out = read(
      '@media (min-width: 100px) { @media (max-width: 400px) { a:hover { color: red; } } }',
    );
    expect(out.stateRules[0].mediaMatches).toBe(false);
  });

  it('AC-F12.3 keeps var() references in state declarations for the element to resolve', () => {
    const out = read(
      ':root { --ring: #f59e0b; } .btn:focus-visible { outline: 2px solid var(--ring); }',
    );
    expect(out.stateRules[0].decls.outline).toBe('2px solid var(--ring)');
    expect(out.usage['--ring']).toBe(1);
  });

  it('AC-F23.3 reads state rules, variables and breakpoints from deep-scan texts', () => {
    const out = read('', {
      texts: [
        ':root { --brand: #0d6efd; } @media (min-width: 768px) { .nav a:hover { color: #0a58ca; } }',
        '@import url("x.css"); .x { color: red; }',
      ],
    });
    expect(out.readable).toBe(3);
    expect(out.defs).toEqual([
      { name: '--brand', value: '#0d6efd', scope: 'root', selector: ':root' },
    ]);
    expect([...out.breakpointCounts.keys()]).toEqual([768]);
    expect(out.stateRules[0]).toMatchObject({
      base: '.nav a',
      states: ['hover'],
      mediaMatches: true,
    });
  });
});

describe('variables, theme signals and layers', () => {
  it('AC-F22.1 counts readable and unreadable sheets', () => {
    const unreadable = {
      get cssRules() {
        throw new DOMException('Cannot access rules', 'SecurityError');
      },
    };
    document.head.innerHTML = '<style>a { color: red; }</style>';
    const out = readStylesheets({
      sheets: [...document.styleSheets, unreadable],
      doc: document,
      win: fakeWin(),
    });
    expect(out).toMatchObject({ readable: 1, unreadable: 1 });
  });

  it('records custom properties with their theme scope', () => {
    const out = read(`
      :root { --bg: #ffffff; }
      @media (prefers-color-scheme: dark) { :root { --bg: #000000; } }
      .dark { --bg: #111111; }
      [data-theme="light"] { --bg: #fafafa; }
      .card { --pad: 16px; }`);
    expect(out.defs.map((d) => [d.value, d.scope])).toEqual([
      ['#ffffff', 'root'],
      ['#000000', 'dark-media'],
      ['#111111', 'dark-selector'],
      ['#fafafa', 'light-selector'],
    ]);
    expect(out.darkMedia).toBe(true);
    expect([...out.darkSelectors]).toEqual(['.dark']);
    expect([...out.lightSelectors]).toEqual(['[data-theme="light"]']);
  });

  it('classifies selector scopes', () => {
    expect(selectorScope(':root', false)).toBe('root');
    expect(selectorScope(':root', true)).toBe('dark-media');
    expect(selectorScope('html.dark', false)).toBe('dark-selector');
    expect(selectorScope(':host', false)).toBe('root');
    expect(selectorScope('.card', false)).toBe('other');
  });

  it('AC-F11.1 reads @layer names from block and statement rules', () => {
    const out = read('@layer theme, base; @layer utilities { .p-4 { padding: 1rem; } }');
    expect([...out.layerNames]).toEqual(['theme', 'base', 'utilities']);
  });
});

describe('resolveVars', () => {
  const lookup = (map) => (name) => map[name];

  it('AC-F12.3 resolves var() chains and fallbacks', () => {
    const vars = { '--a': 'var(--b)', '--b': '#2563eb', '--w': '2px' };
    expect(resolveVars('var(--w) solid var(--a)', lookup(vars))).toBe('2px solid #2563eb');
    expect(resolveVars('var(--missing, #fff)', lookup(vars))).toBe('#fff');
    expect(resolveVars('var(--missing, var(--b))', lookup(vars))).toBe('#2563eb');
    expect(resolveVars('0 0 0 3px rgb(0 0 0 / 0.5)', lookup(vars))).toBe(
      '0 0 0 3px rgb(0 0 0 / 0.5)',
    );
  });

  it('AC-F12.3 stops at cycles and uses the fallback instead', () => {
    const vars = { '--a': 'var(--b, red)', '--b': 'var(--a, blue)' };
    expect(resolveVars('var(--a)', lookup(vars))).toBe('blue');
    expect(resolveVars('var(--self)', lookup({ '--self': 'var(--self)' }))).toBe('');
  });

  it('AC-F12.3 leaves an unmatched var( untouched', () => {
    expect(resolveVars('var(--a', lookup({}))).toBe('var(--a');
  });
});
