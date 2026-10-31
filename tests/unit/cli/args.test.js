import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMATS, UsageError, parseCommand } from '../../../cli/src/args.js';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import { sameSite } from '../../../src/model/site.js';

const extract = (...args) => parseCommand(['extract', 'https://example.com/', ...args]).options;

describe('webstyle argument parsing', () => {
  it('AC-F41.3 extract defaults match the spec', () => {
    const parsed = parseCommand(['extract', 'https://example.com']);
    expect(parsed.command).toBe('extract');
    expect(parsed.urls).toEqual(['https://example.com/']);
    expect(parsed.options).toMatchObject({
      out: null,
      formats: DEFAULT_FORMATS,
      merge: false,
      allowCrossSite: false,
      dark: true,
      states: false,
      deepScan: false,
      widths: [],
      scroll: false,
      screenshots: false,
      siteNames: true,
      shadcnFormat: 'oklch',
      wait: 0,
      timeout: 30000,
      json: false,
    });
  });

  it('AC-F41.3 parses every extract option', () => {
    expect(
      extract(
        '--out',
        'site',
        '--formats',
        'design-md,prompt',
        '--merge',
        '--allow-cross-site',
        '--no-dark',
        '--states',
        '--deep',
        '--widths',
        '375,768,1280',
        '--scroll',
        '--screenshots',
        '--no-site-names',
        '--shadcn-format',
        'hsl',
        '--wait',
        '500',
        '--timeout',
        '10000',
        '--json',
      ),
    ).toEqual({
      out: 'site',
      formats: ['design-md', 'prompt'],
      merge: true,
      allowCrossSite: true,
      dark: false,
      states: true,
      deepScan: true,
      widths: [375, 768, 1280],
      scroll: true,
      screenshots: true,
      siteNames: false,
      shadcnFormat: 'hsl',
      wait: 500,
      timeout: 10000,
      json: true,
    });
  });

  it('AC-F41.3 --formats all selects every format and screenshots', () => {
    expect(extract('--formats', 'all').formats).toEqual([...EXPORT_FORMATS, 'screenshots']);
  });

  it('AC-F41.3 takes several URLs', () => {
    expect(
      parseCommand(['extract', 'https://a.example.com', 'https://b.example.com/x']).urls,
    ).toHaveLength(2);
  });

  it.each([
    [['extract'], 'at least one URL'],
    [['extract', 'not a url'], 'Not a URL'],
    [['extract', 'ftp://example.com'], 'Unsupported URL'],
    [['extract', 'https://e.com', '--formats', 'pdf'], 'Unknown format'],
    [['extract', 'https://e.com', '--widths', '100'], 'from 320 to 1920'],
    [['extract', 'https://e.com', '--widths', '400,500,600,700,800'], 'at most 4'],
    [['extract', 'https://e.com', '--shadcn-format', 'rgb'], 'oklch or hsl'],
    [['extract', 'https://e.com', '--dark', '--no-dark'], 'not both'],
    [['extract', 'https://e.com', '--bogus'], 'Unknown option'],
    [['diff', 'a.json'], 'two snapshot files'],
    [['map', 'a.json'], '--tokens'],
    [['publish'], 'Unknown command'],
  ])('AC-F41.7 %j is a usage error', (argv, message) => {
    expect(() => parseCommand(argv)).toThrow(UsageError);
    expect(() => parseCommand(argv)).toThrow(message);
  });

  it('AC-F41.3 diff and map commands', () => {
    expect(parseCommand(['diff', 'a.json', 'b.json', '--out', 'd.md'])).toEqual({
      command: 'diff',
      a: 'a.json',
      b: 'b.json',
      out: 'd.md',
    });
    expect(parseCommand(['map', 's.json', '--tokens', 't.css'])).toEqual({
      command: 'map',
      snapshot: 's.json',
      tokens: 't.css',
      out: null,
    });
  });

  it('help and version', () => {
    expect(parseCommand([]).command).toBe('help');
    expect(parseCommand(['--help']).command).toBe('help');
    expect(parseCommand(['--version']).command).toBe('version');
  });
});

describe('same-site rule', () => {
  it('AC-F41.4 matches the same hostname or hostnames sharing the last two labels', () => {
    expect(sameSite('https://example.com/a', 'https://example.com/b')).toBe(true);
    expect(sameSite('https://www.example.com', 'https://docs.example.com')).toBe(true);
    expect(sameSite('https://example.com', 'https://example.org')).toBe(false);
    expect(sameSite('http://127.0.0.1:4173/a', 'http://localhost:4173/b')).toBe(false);
    expect(sameSite('http://127.0.0.1/a', 'http://127.0.0.1/b')).toBe(true);
  });
});
