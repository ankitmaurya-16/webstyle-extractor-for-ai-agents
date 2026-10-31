import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze/index.js';
import { exportDesignMd, exportFile } from '../../../src/export/index.js';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import {
  COLOR_CLOSE,
  COLOR_EXACT,
  MappingParseError,
  mapTokens,
  mappingCounts,
  parseCssVariables,
  parseDtcg,
  parseTokenFile,
  shadowKey,
} from '../../../src/mapping/index.js';
import { applyMapping, userTokenName } from '../../../src/mapping/apply.js';
import { exportMappingMd } from '../../../src/mapping/mapping-md.js';
import { makeRecord } from '../../../src/storage/snapshots.js';
import { analyzeFixture, capturesFor, loadRaw } from '../helpers.js';
import { VERSION, richDesign } from '../export/designs.js';

const tokenFile = (name) =>
  readFileSync(resolve(process.cwd(), `tests/fixtures/user-tokens/${name}`), 'utf8');
const NOW = Date.UTC(2026, 9, 25);
const classic = analyzeFixture('classic');
const entryFor = (mapping, tokenId) => mapping.entries.find((e) => e.tokenId === tokenId);
const byName = (tokens) => Object.fromEntries(tokens.map((t) => [t.name, t.parsed]));

describe('token file parsers (F38)', () => {
  it('AC-F38.1 parses DTCG JSON with nested groups and inherited $type', () => {
    const tokens = byName(parseTokenFile(tokenFile('tokens.json'), 'tokens.json'));
    expect(tokens['color.blue.600']).toMatchObject({ type: 'color', hex: '#2563eb' });
    expect(tokens['color.ink']).toMatchObject({ type: 'color', hex: '#111827' });
    expect(tokens['space.sm']).toEqual({ type: 'length', px: 8 });
    expect(tokens['space.md']).toEqual({ type: 'length', px: 16 });
    expect(tokens['radius.default']).toMatchObject({ type: 'length', px: 6 });
    expect(tokens['font.body']).toEqual({ type: 'font', first: 'helvetica neue' });
    expect(tokens['motion.fast']).toEqual({ type: 'duration', ms: 150 });
    expect(tokens['shadow.card'].type).toBe('shadow');
    expect(Object.keys(tokens).some((k) => k.startsWith('$'))).toBe(false);
  });

  it('AC-F38.1 parses CSS custom properties, keeping the first declaration per name', () => {
    const tokens = byName(parseTokenFile(tokenFile('tokens.css'), 'tokens.css'));
    expect(tokens['--brand']).toMatchObject({ type: 'color', hex: '#2563eb' });
    expect(tokens['--brand-hover']).toMatchObject({ type: 'color', hex: '#2563eb' });
    expect(tokens['--text']).toMatchObject({ type: 'color', hex: '#111827' });
    expect(tokens['--space-4']).toEqual({ type: 'length', px: 16 });
    expect(tokens['--radius-md']).toEqual({ type: 'length', px: 6 });
    expect(tokens['--shadow-sm'].type).toBe('shadow');
    // The last declaration of a block has no semicolon.
    expect(tokens['--font-sans']).toMatchObject({ type: 'font', first: 'helvetica neue' });
  });

  it('AC-F38.1 parses Tailwind v4 @theme blocks', () => {
    const tokens = byName(parseTokenFile(tokenFile('theme.css'), 'theme.css'));
    expect(tokens['--color-brand-600'].type).toBe('color');
    expect(tokens['--color-ink']).toMatchObject({ hex: '#111827' });
    expect(tokens['--spacing']).toEqual({ type: 'length', px: 4 });
    expect(tokens['--ease-out']).toEqual({ type: 'easing', css: 'cubic-bezier(0, 0, 0.2, 1)' });
    expect(tokens['--breakpoint-md']).toEqual({ type: 'length', px: 768 });
    expect(tokens['--font-display']).toMatchObject({ type: 'font', first: 'georgia' });
  });

  it('AC-F38.1 an unreadable file raises MAPPING_PARSE_FAILED', () => {
    const fail = (text, name) => {
      try {
        parseTokenFile(text, name);
      } catch (error) {
        return error;
      }
      return null;
    };
    for (const [text, name] of [
      [tokenFile('invalid.json'), 'invalid.json'],
      ['{ "color": { "brand": { "$value": "#2563eb" }, }', 'broken.json'],
      ['body { color: red; }', 'plain.css'],
      ['', 'empty.css'],
    ]) {
      const error = fail(text, name);
      expect(error, name).toBeInstanceOf(MappingParseError);
      expect(error.code).toBe('MAPPING_PARSE_FAILED');
      expect(error.message).toBe(`Couldn't read tokens from ${name}`);
    }
  });

  it('AC-F38.2 DTCG aliases are resolved before matching; cycles and dangling aliases are dropped', () => {
    const tokens = byName(parseTokenFile(tokenFile('tokens.json'), 'tokens.json'));
    expect(tokens['semantic.primary']).toMatchObject({ type: 'color', hex: '#2563eb' });
    expect(tokens['semantic.action']).toMatchObject({ type: 'color', hex: '#2563eb' });
    expect(tokens['semantic.loop-a']).toBeUndefined();
    expect(tokens['semantic.loop-b']).toBeUndefined();
    expect(tokens['semantic.missing']).toBeUndefined();
  });

  it('reads the DTCG tokens.json this extension writes', () => {
    const tokens = parseDtcg(JSON.parse(exportFile('dtcg', classic, VERSION)));
    const names = tokens.map((t) => t.name);
    expect(names).toContain('color.brand');
    expect(names).toContain('semantic.primary');
    expect(byName(tokens)['semantic.primary']).toMatchObject({ hex: '#2563eb' });
  });

  it('resolves var() chains in CSS custom properties', () => {
    const tokens = byName(
      parseCssVariables(':root { --a: #2563eb; --b: var(--a); --c: var(--b); }'),
    );
    expect(tokens['--c']).toMatchObject({ type: 'color', hex: '#2563eb' });
  });
});

describe('matching (F38)', () => {
  const brand = 'color:#2563eb';

  it('AC-F38.3 colors match by OKLab distance: exact under 0.005, close under 0.02', () => {
    expect([COLOR_EXACT, COLOR_CLOSE]).toEqual([0.005, 0.02]);
    const status = (hex) =>
      entryFor(mapTokens(classic, `:root { --x: ${hex}; }`, 'x.css', NOW), brand);
    expect(status('#2563eb')).toMatchObject({ status: 'exact', delta: 0, userToken: '--x' });
    expect(status('#2564eb')).toMatchObject({ status: 'exact', userToken: '--x' });
    expect(status('#2a66ee')).toMatchObject({ status: 'close', delta: 0.01, userToken: '--x' });
    expect(status('#3b82f6')).toMatchObject({ status: 'none', userToken: null, delta: null });
  });

  it('AC-F38.3 sizes match in px: exact, close within 1px, none beyond', () => {
    const space = (value) =>
      entryFor(mapTokens(classic, `:root { --space: ${value}; }`, 'x.css', NOW), 'space:16');
    expect(space('16px')).toMatchObject({ status: 'exact', delta: 0 });
    expect(space('1rem')).toMatchObject({ status: 'exact' });
    expect(space('17px')).toMatchObject({ status: 'close', delta: 1 });
    expect(space('18px')).toMatchObject({ status: 'none' });
    const text = entryFor(
      mapTokens(classic, ':root { --font-size-base: 16px; }', 'x.css', NOW),
      classic.typography.sizes.find((s) => s.sizePx === 16).id,
    );
    expect(text).toMatchObject({ status: 'exact', userToken: '--font-size-base' });
  });

  it('AC-F38.3 durations match exactly or close within 10 ms', () => {
    const rich = richDesign();
    const id = rich.motion.durations.find((d) => d.ms === 150).id;
    const duration = (value) =>
      entryFor(mapTokens(rich, `:root { --d: ${value}; }`, 'x.css', NOW), id);
    expect(duration('150ms')).toMatchObject({ status: 'exact' });
    expect(duration('0.15s')).toMatchObject({ status: 'exact' });
    expect(duration('160ms')).toMatchObject({ status: 'close', delta: 10 });
    expect(duration('170ms')).toMatchObject({ status: 'none' });
  });

  it('AC-F38.3 shadows match exactly after normalizing, whatever the authored form', () => {
    const shadow = classic.shadows.find((s) => s.name === 'shadow-sm');
    expect(shadow.value).toBe('rgba(0, 0, 0, 0.05) 0px 1px 2px 0px');
    expect(shadowKey('0 1px 2px 0 rgb(0 0 0 / 0.05)')).toBe(shadowKey(shadow.value));
    expect(shadowKey('0 1px 2px #0000000d')).toBe(shadowKey(shadow.value));
    expect(
      shadowKey({ color: '#0000000d', offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' }),
    ).toBe(shadowKey(shadow.value));
    expect(shadowKey('0 2px 2px rgb(0 0 0 / 0.05)')).not.toBe(shadowKey(shadow.value));
    const css = entryFor(mapTokens(classic, tokenFile('tokens.css'), 'tokens.css', NOW), shadow.id);
    expect(css).toMatchObject({ status: 'exact', userToken: '--shadow-sm' });
    const json = entryFor(
      mapTokens(classic, tokenFile('tokens.json'), 'tokens.json', NOW),
      shadow.id,
    );
    expect(json).toMatchObject({ status: 'exact', userToken: 'shadow.card' });
    const other = entryFor(
      mapTokens(classic, ':root { --s: 0 9px 2px rgb(0 0 0 / 0.05); }', 'x.css', NOW),
      shadow.id,
    );
    expect(other.status).toBe('none');
  });

  it('AC-F38.3 font families match by their first family, ignoring case and quotes', () => {
    const sans = classic.typography.families.find((f) => f.name === 'sans');
    const font = (value) =>
      entryFor(mapTokens(classic, `:root { --f: ${value}; }`, 'x.css', NOW), sans.id);
    expect(font('"helvetica neue", sans-serif')).toMatchObject({ status: 'exact' });
    expect(font('Arial, "Helvetica Neue", sans-serif')).toMatchObject({ status: 'none' });
  });

  it('AC-F38.3 a value matches only tokens of its own type', () => {
    const mapping = mapTokens(classic, ':root { --x: 16px; }', 'x.css', NOW);
    for (const e of mapping.entries.filter((x) => x.userToken === '--x')) {
      expect(['space', 'text', 'radius', 'border', 'container', 'gap', 'breakpoint']).toContain(
        e.category,
      );
    }
    expect(
      mapping.entries.filter((e) => e.category === 'color').every((e) => e.status === 'none'),
    ).toBe(true);
  });

  it('AC-F38.3 on equal distance the token named for the category wins, then the shorter name', () => {
    const mapping = mapTokens(
      classic,
      ':root { --radius-control: 8px; --space-2: 8px; --s8: 8px; }',
      'x.css',
      NOW,
    );
    expect(entryFor(mapping, 'space:8').userToken).toBe('--space-2');
    expect(entryFor(mapping, 'radius:8').userToken).toBe('--radius-control');
    const plain = mapTokens(classic, ':root { --long-name: 8px; --s8: 8px; }', 'x.css', NOW);
    expect(entryFor(plain, 'space:8').userToken).toBe('--s8');
  });

  it('maps the fixture files with entries for every visible token and counts per status', () => {
    for (const file of ['tokens.json', 'tokens.css', 'theme.css']) {
      const mapping = mapTokens(classic, tokenFile(file), file, NOW);
      expect(mapping).toMatchObject({ sourceName: file, importedAt: NOW, useMyNames: false });
      const counts = mappingCounts(mapping);
      expect(counts.exact).toBeGreaterThan(0);
      expect(counts.exact + counts.close + counts.none).toBe(mapping.entries.length);
      expect(entryFor(mapping, 'color:#2563eb').status).toBe('exact');
      expect(entryFor(mapping, 'color:#111827').status).toBe('exact');
    }
    expect(mappingCounts(null)).toEqual({ exact: 0, close: 0, none: 0 });
  });

  it('skips excluded tokens', () => {
    const design = structuredClone(classic);
    design.colors.find((c) => c.id === 'color:#2563eb').excluded = true;
    expect(
      entryFor(mapTokens(design, tokenFile('tokens.css'), 'tokens.css', NOW), 'color:#2563eb'),
    ).toBeUndefined();
  });
});

describe('using the mapping in exports (F38)', () => {
  const mapping = {
    ...mapTokens(classic, tokenFile('tokens.json'), 'tokens.json', NOW),
    useMyNames: true,
  };

  it('AC-F38.5 with "Use my token names" on, every export uses the user names for matched tokens', () => {
    expect(userTokenName('color.blue.600')).toBe('color-blue-600');
    expect(userTokenName('--brand-hover')).toBe('brand-hover');
    const renamed = applyMapping(classic, mapping);
    const brand = renamed.colors.find((c) => c.id === 'color:#2563eb');
    expect(brand.name).toBe(userTokenName(entryFor(mapping, 'color:#2563eb').userToken));
    expect(brand.aliases).toContain('brand');
    const ctx = { mapping };
    expect(exportFile('tailwind-v4', classic, VERSION, ctx)).toContain(
      `--color-${brand.name}: #2563eb;`,
    );
    expect(exportFile('css-vars', classic, VERSION, ctx)).toContain('#2563eb');
    expect(JSON.parse(exportFile('dtcg', classic, VERSION, ctx)).color[brand.name]).toBeDefined();
    expect(exportDesignMd(classic, VERSION, ctx)).toMatch(
      new RegExp(`\\| primary +\\| ${brand.name} `),
    );
    for (const format of EXPORT_FORMATS) {
      expect(exportFile(format, classic, VERSION, ctx), format).not.toMatch(/\| brand +\|/);
    }
  });

  it('AC-F38.5 with the switch off, names stay as extracted', () => {
    const ctx = { mapping: { ...mapping, useMyNames: false } };
    expect(applyMapping(classic, ctx.mapping)).toBe(classic);
    expect(exportFile('tailwind-v4', classic, VERSION, ctx)).toContain('--color-brand: #2563eb;');
  });

  it('AC-F38.6 DESIGN.md lists unmatched tokens under "Values not in your system" with the rule', () => {
    const md = exportDesignMd(classic, VERSION, { mapping });
    expect(md).toContain(
      'Prefer the existing tokens from tokens.json. Values under "Values not in your system" need a decision.',
    );
    const section = md.split('## Values not in your system\n\n')[1].split('\n\n## ')[0];
    const unmatched = mapping.entries.filter((e) => e.status === 'none');
    expect(section.split('\n').length).toBe(Math.min(40, unmatched.length));
    expect(section).toContain('- gray-200');
    expect(section).not.toContain('- color-blue-600');
    expect(md.indexOf('## Values not in your system')).toBeGreaterThan(
      md.indexOf('## Accessibility'),
    );
    expect(md.indexOf('## Values not in your system')).toBeLessThan(md.indexOf('## Notes'));
    expect(exportDesignMd(classic, VERSION)).not.toContain('Values not in your system');
  });

  it('AC-F38.7 mapping.md exports the table with unmatched rows last', async () => {
    const md = exportMappingMd(classic, mapping);
    const c = mappingCounts(mapping);
    expect(md).toContain('Source token file: tokens.json · mapped 2026-10-25');
    expect(md).toContain(`${c.exact} exact · ${c.close} close · ${c.none} none`);
    expect(md).toMatch(/\| Extracted token +\| Value +\| Your token +\| Status +\| Distance +\|/);
    const statuses = [...md.matchAll(/^\| .+ \| (exact|close|none) +\| .+ \|$/gm)].map((m) => m[1]);
    expect(statuses.length).toBe(mapping.entries.length);
    expect(statuses.indexOf('none')).toBeGreaterThan(statuses.lastIndexOf('exact'));
    await expect(md).toMatchFileSnapshot('../export/__snapshots__/classic/mapping.md');
  });

  it('AC-F38.8 the mapping persists on the snapshot and still applies after re-analysis', () => {
    const raw = loadRaw('classic');
    const captures = capturesFor(raw);
    const first = makeRecord({ id: 's1', captures, extracted: classic, edited: classic });
    const withMapping = { ...first, mapping };
    const again = analyze(captures, {});
    const rerun = makeRecord({
      id: 's1',
      captures,
      extracted: again,
      edited: again,
      previous: withMapping,
    });
    expect(rerun.mapping).toBe(mapping);
    // Entries hold stable token ids, so they find the same tokens in the new analysis.
    const renamed = applyMapping(rerun.edited, rerun.mapping);
    expect(renamed.colors.find((c) => c.id === 'color:#2563eb').name).toBe('color-blue-600');
  });
});
