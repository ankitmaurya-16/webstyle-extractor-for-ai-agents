import { describe, expect, it } from 'vitest';
import { FILE_MAP, renderFormat } from '../../../src/export/index.js';
import { FIGMA_HELP, exportFigmaFiles } from '../../../src/export/figma.js';
import { FIXTURE_NAMES } from '../helpers.js';
import { VERSION, fixtureDesigns, richDesign } from './designs.js';

const designs = { ...fixtureDesigns(), rich: richDesign() };
const ALL = [...FIXTURE_NAMES, 'rich'];

const files = (d) => {
  const f = exportFigmaFiles(d, VERSION);
  return {
    primitives: JSON.parse(f.primitives),
    light: f.light && JSON.parse(f.light),
    dark: f.dark && JSON.parse(f.dark),
  };
};

/** Every token in a DTCG document as [slash path, token]. */
function tokens(doc, path = []) {
  const out = [];
  for (const [key, node] of Object.entries(doc)) {
    if (key.startsWith('$')) continue;
    if (node && typeof node === 'object' && '$value' in node)
      out.push([[...path, key].join('/'), node]);
    else if (node && typeof node === 'object') out.push(...tokens(node, [...path, key]));
  }
  return out;
}

describe('Figma variables (F35)', () => {
  it('uses Figma native DTCG import: three files, one per collection mode', () => {
    expect(FILE_MAP.figma).toEqual([
      'design/figma/Primitives.tokens.json',
      'design/figma/Semantic.Light.tokens.json',
      'design/figma/Semantic.Dark.tokens.json',
    ]);
    expect(renderFormat('figma', designs.rich, VERSION).map((f) => f.path)).toEqual(FILE_MAP.figma);
  });

  it.each(ALL)(
    'AC-F35.1 Primitives (mode Value) holds colors, sizes and families on %s',
    (name) => {
      const d = designs[name];
      const { primitives } = files(d);
      expect(primitives.$description).toMatch(/Figma collection "Primitives", mode "Value"\.$/);
      const all = Object.fromEntries(tokens(primitives));
      const colors = d.colors.filter((c) => !c.excluded);
      expect(Object.values(all).filter((t) => t.$type === 'color')).toHaveLength(colors.length);
      for (const [path, t] of Object.entries(all)) {
        if (t.$type === 'dimension')
          expect(t.$value, path).toEqual({ value: expect.any(Number), unit: 'px' });
        if (t.$type === 'fontFamily') expect(t.$value, path).toBeTypeOf('string');
        if (t.$type === 'color')
          expect(t.$value, path).toMatchObject({
            colorSpace: 'srgb',
            alpha: expect.any(Number),
            hex: expect.stringMatching(/^#[0-9a-f]{6}$/),
          });
      }
      const groups = new Set(Object.keys(all).map((p) => p.split('/')[0]));
      for (const g of ['color', 'space', 'radius', 'text', 'font']) expect(groups, g).toContain(g);
    },
  );

  it('AC-F35.1 translucent colors keep their alpha in Primitives', () => {
    const black = files(designs.dark).primitives.color.black.a50;
    expect(black.$value).toMatchObject({ hex: '#000000', alpha: 0.502 });
  });

  it('AC-F35.1 AC-F35.2 Semantic has Light and Dark modes; without dark mode only Light', () => {
    const rich = files(designs.rich);
    expect(rich.light.$description).toMatch(/Figma collection "Semantic", mode "Light"\.$/);
    expect(rich.dark.$description).toMatch(/Figma collection "Semantic", mode "Dark"\.$/);
    for (const name of FIXTURE_NAMES) {
      const f = exportFigmaFiles(designs[name], VERSION);
      expect(f.light, name).not.toBeNull();
      expect(f.dark, name).toBeNull();
      expect(renderFormat('figma', designs[name], VERSION).map((x) => x.path)).toEqual(
        FILE_MAP.figma.slice(0, 2),
      );
    }
  });

  it.each(ALL)(
    'AC-F35.2 semantic variables alias primitives and keep the resolved value on %s',
    (name) => {
      const f = files(designs[name]);
      const primitives = Object.fromEntries(tokens(f.primitives));
      for (const doc of [f.light, f.dark].filter(Boolean)) {
        const semantic = tokens(doc);
        expect(semantic.length).toBeGreaterThan(0);
        for (const [path, t] of semantic) {
          const alias = t.$extensions['com.figma.aliasData'];
          expect(alias.targetVariableSetName, path).toBe('Primitives');
          const target = primitives[alias.targetVariableName];
          expect(target, `${path} -> ${alias.targetVariableName}`).toBeDefined();
          expect(t.$value).toEqual(target.$value);
        }
      }
    },
  );

  it('AC-F35.2 the focus ring is a semantic alias', () => {
    const light = files(designs.rich).light;
    expect(light.focus.ring.$extensions['com.figma.aliasData'].targetVariableName).toBe(
      'color/blue/600',
    );
  });

  it.each(ALL)(
    'AC-F35.3 names use slash groups and no token also holds child tokens on %s',
    (name) => {
      const f = files(designs[name]);
      const walk = (node, path) => {
        for (const [key, child] of Object.entries(node)) {
          if (key.startsWith('$') || !child || typeof child !== 'object') continue;
          if ('$value' in child) {
            const extra = Object.keys(child).filter((k) => !k.startsWith('$'));
            expect(extra, `${[...path, key].join('/')} has children`).toEqual([]);
          } else walk(child, [...path, key]);
        }
      };
      for (const doc of [f.primitives, f.light, f.dark].filter(Boolean)) walk(doc, []);
      const paths = tokens(f.primitives).map(([p]) => p);
      expect(paths.every((p) => p.includes('/'))).toBe(true);
    },
  );

  it('AC-F35.3 names nest as color/gray/900, space/1, radius/md and text/muted', () => {
    const f = files(designs.rich);
    const paths = tokens(f.primitives).map(([p]) => p);
    for (const p of [
      'color/gray/900',
      'color/blue/600',
      'space/1',
      'radius/md',
      'text/base',
      'font/sans',
      'border/1',
    ])
      expect(paths, p).toContain(p);
    const semantic = tokens(f.light).map(([p]) => p);
    expect(semantic).toEqual(
      expect.arrayContaining(['background', 'text/default', 'text/muted', 'primary', 'focus/ring']),
    );
  });

  it('AC-F35.5 the help text names the import path', () => {
    expect(FIGMA_HELP).toMatch(/native DTCG import/);
    expect(FIGMA_HELP).toContain('Primitives.tokens.json');
    expect(FIGMA_HELP).toContain('Semantic');
  });

  it.each(ALL)('AC-F35.6 snapshots cover the Figma files on %s', async (name) => {
    for (const file of renderFormat('figma', designs[name], VERSION)) {
      await expect(file.text).toMatchFileSnapshot(`./__snapshots__/${name}/${file.path}`);
    }
  });
});
