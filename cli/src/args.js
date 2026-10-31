// Argument parsing for the webstyle command (F41) on Node's util.parseArgs.

import { parseArgs } from 'node:util';
import { EXPORT_FORMATS } from '../../src/model/types.js';

export const DEFAULT_FORMATS = ['design-md', 'prompt', 'dtcg', 'tailwind-v4', 'css-vars', 'shadcn', 'agents-md', 'cursor-rules', 'claude-md'];

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.code = 'USAGE';
  }
}

const EXTRACT_OPTIONS = {
  out: { type: 'string' },
  formats: { type: 'string' },
  merge: { type: 'boolean', default: false },
  'allow-cross-site': { type: 'boolean', default: false },
  dark: { type: 'boolean' },
  'no-dark': { type: 'boolean' },
  states: { type: 'boolean', default: false },
  deep: { type: 'boolean', default: false },
  widths: { type: 'string' },
  scroll: { type: 'boolean', default: false },
  screenshots: { type: 'boolean', default: false },
  'site-names': { type: 'boolean' },
  'no-site-names': { type: 'boolean' },
  'shadcn-format': { type: 'string', default: 'oklch' },
  wait: { type: 'string', default: '0' },
  timeout: { type: 'string', default: '30000' },
  json: { type: 'boolean', default: false },
};

const number = (value, name, { min = 0, max = Infinity } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`--${name} must be a whole number from ${min} to ${max}`);
  return n;
};

function parseFormats(value) {
  if (!value) return DEFAULT_FORMATS;
  if (value === 'all') return [...EXPORT_FORMATS, 'screenshots'];
  const list = value.split(',').map((f) => f.trim()).filter(Boolean);
  const unknown = list.filter((f) => !EXPORT_FORMATS.includes(f) && f !== 'screenshots');
  if (unknown.length) throw new UsageError(`Unknown format: ${unknown.join(', ')}. Use one of ${EXPORT_FORMATS.join(', ')} or all`);
  return list;
}

function parseUrls(list) {
  if (!list.length) throw new UsageError('extract needs at least one URL');
  return list.map((value) => {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new UsageError(`Not a URL: ${value}`);
    }
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) throw new UsageError(`Unsupported URL: ${value}`);
    return url.href;
  });
}

/**
 * @param {string[]} argv arguments after the program name
 * @returns {{command: 'help'|'version'} | {command: 'extract', urls: string[], options: object} |
 *   {command: 'diff', a: string, b: string, out: string|null} | {command: 'map', snapshot: string, tokens: string, out: string|null}}
 */
export function parseCommand(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') return { command: 'help' };
  if (command === '--version' || command === '-v') return { command: 'version' };
  try {
    if (command === 'extract') {
      const { values, positionals } = parseArgs({ args: rest, options: EXTRACT_OPTIONS, allowPositionals: true, strict: true });
      if (values.dark && values['no-dark']) throw new UsageError('Use --dark or --no-dark, not both');
      if (values['site-names'] && values['no-site-names']) throw new UsageError('Use --site-names or --no-site-names, not both');
      if (!['oklch', 'hsl'].includes(values['shadcn-format'])) throw new UsageError('--shadcn-format must be oklch or hsl');
      const widths = values.widths
        ? values.widths.split(',').map((w) => number(w.trim(), 'widths', { min: 320, max: 1920 }))
        : [];
      if (widths.length > 4) throw new UsageError('--widths takes at most 4 widths');
      return {
        command: 'extract',
        urls: parseUrls(positionals),
        options: {
          out: values.out ?? null,
          formats: parseFormats(values.formats),
          merge: values.merge,
          allowCrossSite: values['allow-cross-site'],
          dark: !values['no-dark'],
          states: values.states,
          deepScan: values.deep,
          widths,
          scroll: values.scroll,
          screenshots: values.screenshots,
          siteNames: !values['no-site-names'],
          shadcnFormat: values['shadcn-format'],
          wait: number(values.wait, 'wait', { max: 120_000 }),
          timeout: number(values.timeout, 'timeout', { min: 1000, max: 600_000 }),
          json: values.json,
        },
      };
    }
    if (command === 'diff') {
      const { values, positionals } = parseArgs({ args: rest, options: { out: { type: 'string' } }, allowPositionals: true, strict: true });
      if (positionals.length !== 2) throw new UsageError('diff needs two snapshot files');
      return { command: 'diff', a: positionals[0], b: positionals[1], out: values.out ?? null };
    }
    if (command === 'map') {
      const { values, positionals } = parseArgs({
        args: rest,
        options: { tokens: { type: 'string' }, out: { type: 'string' } },
        allowPositionals: true,
        strict: true,
      });
      if (positionals.length !== 1) throw new UsageError('map needs one snapshot file');
      if (!values.tokens) throw new UsageError('map needs --tokens <file>');
      return { command: 'map', snapshot: positionals[0], tokens: values.tokens, out: values.out ?? null };
    }
  } catch (error) {
    if (error instanceof UsageError) throw error;
    // parseArgs errors (unknown option, missing value) are usage errors too.
    throw new UsageError(error.message);
  }
  throw new UsageError(`Unknown command: ${command}`);
}

export const HELP = `webstyle: extract a website's design system for AI coding agents

Usage:
  webstyle extract <url...> [options]
  webstyle diff <a.webstyle.json> <b.webstyle.json> [--out diff.md]
  webstyle map <snapshot.webstyle.json> --tokens <file> [--out mapping.md]
  webstyle --version | --help

Extract options:
  --out <dir>             Output folder (default ./webstyle-output/<hostname>)
  --formats <list|all>    Default: ${DEFAULT_FORMATS.join(',')}
  --merge                 Merge all URLs into one site snapshot (same site only)
  --allow-cross-site      Allow --merge across sites
  --dark / --no-dark      Capture the other theme when the site uses prefers-color-scheme (default on)
  --states                Forced hover, focus and active states
  --deep                  Deep scan of every stylesheet
  --widths <list>         Extra widths, for example 375,768,1280
  --scroll                Auto-scroll before collecting
  --screenshots           Component screenshots
  --site-names / --no-site-names
  --shadcn-format <oklch|hsl>
  --wait <ms>             Extra wait after load (default 0)
  --timeout <ms>          Page timeout (default 30000)
  --json                  Print the snapshot JSON to stdout instead of writing files

Exit codes: 0 success, 1 usage error or missing browser, 2 page failed to load or timed out,
3 too little to read, 4 internal error.
`;
