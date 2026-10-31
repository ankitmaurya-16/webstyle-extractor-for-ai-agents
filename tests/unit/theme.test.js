import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { wcagContrast } from 'culori';

const root = process.cwd();
const css = readFileSync(resolve(root, 'entrypoints/sidepanel/theme.css'), 'utf8');

/** Custom properties declared directly inside the first block that follows `selector`. */
function block(selector, from = 0) {
  const start = css.indexOf(selector, from);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < css.length; end += 1) {
    if (css[end] === '{') depth += 1;
    if (css[end] === '}' && --depth === 0) break;
  }
  const body = css.slice(open + 1, end);
  return Object.fromEntries(
    [...body.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

// v2 spec F42 light table.
const LIGHT = {
  '--color-bg': '#ffffff',
  '--color-surface': '#f7f7f8',
  '--color-surface-2': '#efeff1',
  '--color-surface-3': '#e5e5e8',
  '--color-border': '#e4e4e7',
  '--color-border-strong': '#d4d4d8',
  '--color-text': '#18181b',
  '--color-muted': '#52525b',
  '--color-faint': '#71717a',
  '--color-accent': '#3358d4',
  '--color-accent-hover': '#2a49b3',
  '--color-on-accent': '#ffffff',
  '--color-success': '#15803d',
  '--color-warning': '#b45309',
  '--color-danger': '#dc2626',
  '--color-swatch-ring': 'rgb(0 0 0 / 0.08)',
  '--color-preview': '#ffffff',
};
const TEXT_TOKENS = ['text', 'muted', 'faint', 'accent', 'success', 'warning', 'danger'].map(
  (n) => `--color-${n}`,
);

const dark = block('@theme');
const light = block(":root[data-theme='light']");
const lightMedia = block(
  ":root:not([data-theme='dark'])",
  css.indexOf('@media (prefers-color-scheme: light)'),
);

function filesUnder(dir, pattern) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, pattern));
    else if (pattern.test(name)) out.push(path);
  }
  return out;
}

describe('panel light theme (F42)', () => {
  it('AC-F42.2 light values under [data-theme="light"] match the spec table', () => {
    expect(light).toEqual(LIGHT);
  });

  it('AC-F42.1 System follows the OS: the same light values apply under prefers-color-scheme: light', () => {
    expect(lightMedia).toEqual(LIGHT);
    expect(css).toMatch(
      /@media \(prefers-color-scheme: light\)\s*\{\s*:root:not\(\[data-theme='dark'\]\)/,
    );
  });

  it('AC-F42.2 every light text token meets 4.5:1 on bg, and on-accent on accent', () => {
    for (const token of TEXT_TOKENS) {
      expect(wcagContrast(light[token], light['--color-bg']), token).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      wcagContrast(light['--color-on-accent'], light['--color-accent']),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('AC-F42.2 the light theme redefines every dark color token except transparent', () => {
    const darkColors = Object.keys(dark).filter(
      (k) => k !== '--color-transparent' && k !== '--color-*',
    );
    expect(darkColors.sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it('dark text tokens meet 4.5:1 on the dark bg', () => {
    for (const token of TEXT_TOKENS) {
      expect(wcagContrast(dark[token], dark['--color-bg']), token).toBeGreaterThanOrEqual(4.5);
    }
    expect(wcagContrast(dark['--color-on-accent'], dark['--color-accent'])).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('AC-F42.4 no panel component or screen uses a hard-coded color', () => {
    const files = filesUnder(resolve(root, 'entrypoints/sidepanel'), /\.jsx$/);
    expect(files.length).toBeGreaterThan(20);
    const offenders = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const patterns = [
        /#[0-9a-fA-F]{3,8}\b(?![-\w])/g,
        /\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/g,
        /-\[(#|rgb|hsl|oklch)/g,
      ];
      for (const pattern of patterns) {
        for (const m of source.matchAll(pattern)) {
          // A hex inside a template that reads a token value (style={{ background: token.hex }}) is
          // data, not a hard-coded color; only literals count.
          const line = source.slice(
            source.lastIndexOf('\n', m.index) + 1,
            source.indexOf('\n', m.index),
          );
          if (/^\s*(\/\/|\*)/.test(line)) continue;
          offenders.push(`${file.replace(root, '')}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('AC-F42.4 the body background and text come from tokens, so switching needs no reload', () => {
    expect(css).toMatch(/background:\s*var\(--color-bg\)/);
    expect(css).toMatch(/color:\s*var\(--color-text\)/);
  });
});
