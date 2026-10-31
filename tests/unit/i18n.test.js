import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  formatNumber,
  formatPercent,
  hasMessage,
  historyDate,
  relativeDate,
  t,
} from '../../src/i18n.js';
import { MESSAGES } from '../../scripts/messages-source.js';
import { EXPORT_FORMATS } from '../../src/model/types.js';
import { exportFile } from '../../src/export/index.js';
import { analyzeFixture } from './helpers.js';

const root = process.cwd();
const messages = JSON.parse(
  readFileSync(resolve(root, 'public/_locales/en/messages.json'), 'utf8'),
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

const panelFiles = filesUnder(resolve(root, 'entrypoints/sidepanel'), /\.(jsx?|tsx?)$/);
const panelSource = panelFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

afterEach(() => {
  delete globalThis.chrome;
  vi.unstubAllEnvs();
});

describe('t() (AC-F44.2)', () => {
  it('AC-F44.2 reads the bundled English message outside the extension', () => {
    expect(t('extract')).toBe('Extract design system');
  });

  it('AC-F44.2 fills $1 to $9 substitutions in order', () => {
    expect(t('cross_site_body', 'blog.other.org', 'example.com')).toBe(
      'This page is on blog.other.org, not example.com. Add it anyway?',
    );
    expect(t('migration_notice', 3, 1)).toBe(
      'Upgraded 3 snapshots; 1 edits could not be carried over.',
    );
    expect(t('banner_partial', 'states, dark')).toBe(
      "Some details couldn't be captured: states, dark.",
    );
  });

  it('AC-F44.2 prefers chrome.i18n so a translation takes over, with string substitutions', () => {
    const getMessage = vi.fn((key, subs) => `fr:${key}:${subs.join('|')}`);
    globalThis.chrome = { i18n: { getMessage } };
    expect(t('pages_count', 3)).toBe('fr:pages_count:3');
    expect(getMessage).toHaveBeenCalledWith('pages_count', ['3']);
  });

  it('AC-F44.2 falls back to English when chrome.i18n returns an empty string or throws', () => {
    globalThis.chrome = { i18n: { getMessage: () => '' } };
    expect(t('extract')).toBe('Extract design system');
    globalThis.chrome = {
      i18n: {
        getMessage: () => {
          throw new Error('context invalidated');
        },
      },
    };
    expect(t('extract')).toBe('Extract design system');
  });

  it('AC-F44.2 a missing key throws in development', () => {
    expect(() => t('no_such_key')).toThrow('Missing message: no_such_key');
    expect(hasMessage('no_such_key')).toBe(false);
    expect(hasMessage('extract')).toBe(true);
  });

  it('AC-F44.2 a missing key falls back to the key in production', async () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
    vi.resetModules();
    const prod = await import('../../src/i18n.js');
    expect(prod.t('no_such_key')).toBe('no_such_key');
    expect(prod.t('extract')).toBe('Extract design system');
  });
});

describe('messages.json', () => {
  it('AC-F44.1 is generated from scripts/messages-source.js and is up to date', () => {
    expect(Object.keys(messages).sort()).toEqual(Object.keys(MESSAGES).sort());
    for (const [key, [text, description]] of Object.entries(MESSAGES)) {
      expect(messages[key].description, key).toBe(description);
      expect(messages[key].message, key).toBe(text.replace(/\$(\d)/g, '$p$1$'));
    }
  });

  it('AC-F44.1 every entry has a valid Chrome key, a message and a description for translators', () => {
    for (const [key, entry] of Object.entries(messages)) {
      expect(key, key).toMatch(/^[A-Za-z0-9_]+$/);
      expect(key.startsWith('@@'), key).toBe(false);
      expect(entry.message.length, key).toBeGreaterThan(0);
      expect(entry.description?.length, key).toBeGreaterThan(0);
      const used = [...entry.message.matchAll(/\$(\w+)\$/g)].map((m) => m[1]);
      expect(used.sort(), key).toEqual(Object.keys(entry.placeholders ?? {}).sort());
      for (const [name, ph] of Object.entries(entry.placeholders ?? {})) {
        expect(ph.content, `${key}.${name}`).toMatch(/^\$[1-9]$/);
      }
      // A lone $ is a placeholder marker in Chrome's format, so literal dollars would break.
      expect(entry.message.replace(/\$\w+\$/g, ''), key).not.toContain('$');
    }
  });

  it('AC-F44.2 every literal t() key used in the panel exists', () => {
    const keys = [...panelSource.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(100);
    const missing = [...new Set(keys)].filter((k) => !(k in messages));
    expect(missing).toEqual([]);
  });

  it('AC-F44.2 every key reached through a lookup map in the panel exists', () => {
    const names = new Set([...panelSource.matchAll(/\bt\(\s*([A-Z_]+)\[/g)].map((m) => m[1]));
    names.add('TEXT');
    const keys = [];
    for (const name of names) {
      const body = panelSource.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n?\\};`))?.[1];
      expect(body, name).toBeTruthy();
      keys.push(
        ...[...body.matchAll(/'([a-z][a-z0-9_]*)'/g)]
          .map((m) => m[1])
          .filter((k) => k.includes('_')),
      );
    }
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !(k in messages))).toEqual([]);
  });

  it('AC-F44.2 every key built from a template in the panel exists', () => {
    const expand = {
      tab_: ['colors', 'type', 'layout', 'motion', 'components', 'insights', 'export'],
      kind_: ['page', 'site', 'component'],
      status_: ['new', 'updated', 'unchanged', 'failed', 'exact', 'close', 'none'],
      filter_: ['all', 'added', 'removed', 'changed', 'renamed'],
      stage_: [
        'scrolling',
        'reading',
        'attach',
        'deep_scan',
        'light',
        'dark',
        'states',
        'width',
        'detach',
        'analyzing',
        'saving',
      ],
      first_run_: ['1', '2', '3'],
    };
    const prefixes = [...panelSource.matchAll(/\bt\(\s*`([a-z_]+)\$\{/g)].map((m) => m[1]);
    for (const prefix of prefixes) expect(Object.keys(expand), prefix).toContain(prefix);
    const missing = Object.entries(expand)
      .flatMap(([p, xs]) => xs.map((x) => p + x))
      .filter((k) => !(k in messages));
    expect(missing).toEqual([]);
  });

  it('AC-F44.3 holds the manifest name, description, action title and command', () => {
    for (const key of ['extName', 'extDescription', 'actionTitle', 'commandExtract'])
      expect(messages[key]?.message, key).toBeTruthy();
  });

  it('AC-F7.12 AC-F44.1 the panel shows exact error texts from v2 spec 7.4', () => {
    expect(t('toast_debugger_denied')).toBe(
      "Advanced capture needs permission to use Chrome's debugger. Basic extraction still works.",
    );
    expect(t('toast_site_access_denied')).toBe(
      'Without access to this site, click the toolbar icon on each page instead.',
    );
    expect(t('toast_pick_failed')).toBe("Couldn't start the element picker on this page.");
    expect(t('toast_highlight_empty')).toBe('No matching elements are visible on this page.');
    expect(t('import_invalid', 'x')).toBe("This file isn't a valid WebStyle snapshot: x.");
    expect(t('import_too_new')).toBe(
      'This file was made with a newer version of WebStyle Extractor. Update the extension to open it.',
    );
    expect(t('toast_fs_permission_denied')).toBe(
      'Folder access was not allowed. Choose the folder again in Settings.',
    );
  });
});

describe('exports stay in English (AC-F44.4)', () => {
  it('AC-F44.4 no exporter or core module imports i18n', () => {
    const core = [
      'src/export',
      'src/analyze',
      'src/io',
      'src/diff',
      'src/mapping',
      'src/project',
      'src/model',
      'src/edit',
    ];
    for (const dir of core) {
      for (const file of filesUnder(resolve(root, dir), /\.js$/)) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(/i18n/);
      }
    }
  });

  it('AC-F44.4 exports are identical whatever the UI language', () => {
    const design = analyzeFixture('classic');
    const english = Object.fromEntries(
      EXPORT_FORMATS.map((f) => [f, exportFile(f, design, '2.0.0')]),
    );
    globalThis.chrome = { i18n: { getMessage: (key) => `[fr] ${key}`, getUILanguage: () => 'fr' } };
    for (const format of EXPORT_FORMATS) {
      const text = exportFile(format, design, '2.0.0');
      expect(text, format).toBe(english[format]);
      expect(text, format).not.toContain('[fr]');
    }
  });
});

describe('Intl formatting (AC-F44.5)', () => {
  it('AC-F44.5 numbers and percents follow the UI locale', () => {
    globalThis.chrome = { i18n: { getUILanguage: () => 'de' } };
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatPercent(0.42)).toMatch(/^42\s%$/);
    expect(formatPercent(0.004)).toMatch(/^<1\s%$/);
    globalThis.chrome = { i18n: { getUILanguage: () => 'en-US' } };
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('AC-F44.5 relative and history dates use messages and Intl', () => {
    globalThis.chrome = { i18n: { getUILanguage: () => 'en-US' } };
    const now = Date.UTC(2026, 9, 31, 12, 0);
    expect(relativeDate(now - 10_000, now)).toBe(t('just_now'));
    expect(relativeDate(now - 5 * 60_000, now)).toBe(t('minutes_ago', 5));
    expect(relativeDate(now - 3 * 3_600_000, now)).toBe(t('hours_ago', 3));
    expect(relativeDate(now - 3 * 86_400_000, now)).toMatch(/Oct 28/);
    expect(historyDate(now, now)).toMatch(/^Today/);
  });
});
