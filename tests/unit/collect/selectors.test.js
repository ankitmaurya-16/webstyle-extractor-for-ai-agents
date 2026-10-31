// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { uniqueSelector } from '../../../src/collect/selectors.js';

beforeEach(() => {
  document.body.innerHTML = `
    <main id="content">
      <p><button>One</button><button>Two</button></p>
      <p><a href="#x">Link</a></p>
    </main>
    <div id="radix-:r1:"><span>Auto id</span></div>
    <div id="dup"></div><div id="dup"><em>Twice</em></div>
    <section><div><b>Deep</b></div><div><b>Deep</b></div></section>
    <x-host></x-host>`;
});

const check = (el) => {
  const selector = uniqueSelector(el);
  expect(document.querySelectorAll(selector)).toHaveLength(1);
  expect(document.querySelector(selector)).toBe(el);
  return selector;
};

describe('uniqueSelector', () => {
  it('AC-F12.1 builds a unique path that stops at a stable id', () => {
    const second = document.querySelectorAll('button')[1];
    expect(check(second)).toBe('#content > p:nth-of-type(1) > button:nth-of-type(2)');
    expect(check(document.querySelector('a'))).toBe('#content > p:nth-of-type(2) > a');
    expect(check(document.getElementById('content'))).toBe('#content');
  });

  it('AC-F12.1 skips framework-generated and duplicated ids', () => {
    expect(check(document.querySelector('span'))).toBe('body > div:nth-of-type(1) > span');
    expect(check(document.querySelector('em'))).toBe('body > div:nth-of-type(3) > em');
  });

  it('AC-F12.1 uses nth-of-type steps up to body when no id helps', () => {
    const b = document.querySelectorAll('b')[1];
    expect(check(b)).toBe('body > section > div:nth-of-type(2) > b');
  });

  it('AC-F12.1 adds nothing to the page', () => {
    const before = document.documentElement.outerHTML;
    for (const el of document.querySelectorAll('*')) uniqueSelector(el);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('AC-F22.1 returns null inside a shadow root, which document selectors cannot reach', () => {
    const host = document.querySelector('x-host');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button>Inside</button>';
    expect(uniqueSelector(root.querySelector('button'))).toBeNull();
    expect(uniqueSelector(null)).toBeNull();
  });
});
