// Exporter output for the v2 token categories, by acceptance criterion (v2 spec 9.4, 9.5, 9.8,
// 9.9). Each test reads a design analyzed from a captured fixture page.

import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  exportAuditMd,
  exportCssVars,
  exportDesignMd,
  exportDtcg,
  exportPrompt,
  exportTailwindV3,
  exportTailwindV4,
  renderFormat,
} from '../../../src/export/index.js';
import { analyze } from '../../../src/analyze/index.js';
import { findToken } from '../../../src/model/design.js';
import { EXPORT_FORMATS } from '../../../src/model/types.js';
import { analyzeFixture, captureOf, loadRaw } from '../helpers.js';
import { VERSION, richDesign } from './designs.js';

const designs = {
  motion: analyzeFixture('motion'),
  typography: analyzeFixture('typography'),
  layout: analyzeFixture('layout'),
  gradients: analyzeFixture('gradients'),
  classic: analyzeFixture('classic'),
  rich: richDesign(),
};

const runConfig = (text) => {
  const module = { exports: {} };
  runInNewContext(text, { module });
  return module.exports.theme.extend;
};
const dtcg = (design) => JSON.parse(exportDtcg(design, VERSION));
/** The body of the first top-level block that starts with `open`, for example '@theme {'. */
const block = (css, open) => {
  const start = css.indexOf(`\n${open}\n`);
  if (start < 0) return '';
  const end = css.indexOf('\n}', start + 1);
  return css.slice(start + open.length + 2, end);
};
/** The text of a `## Title` section of a Markdown file, up to the next `## ` heading. */
const section = (md, title) => {
  const start = md.indexOf(`\n## ${title}\n`);
  if (start < 0) return null;
  const next = md.indexOf('\n## ', start + 1);
  return md.slice(start + 1, next < 0 ? undefined : next);
};
const headings = (md) => [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
const withMeta = (design, meta) => ({ ...design, meta: { ...design.meta, ...meta } });

describe('motion exports (F14)', () => {
  const d = designs.motion;

  it('AC-F14.7 Tailwind v4: easings in @theme as --ease-*, durations as plain :root variables', () => {
    const css = exportTailwindV4(d, VERSION);
    const theme = block(css, '@theme {');
    const root = block(css, ':root {');
    expect(theme).toContain('--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);');
    expect(theme).toContain('--ease-out: cubic-bezier(0, 0, 0.2, 1);');
    expect(theme).toContain('--ease-custom-1: cubic-bezier(0.68, -0.55, 0.265, 1.55);');
    expect(theme).toContain('--ease-default: ease;');
    expect(theme).not.toContain('--duration-');
    for (const ms of [75, 150, 200, 300, 500, 700])
      expect(root).toContain(`--duration-${ms}: ${ms}ms;`);
    expect(root).toContain('duration-(--duration-75)');
  });

  it('AC-F14.7 Tailwind v3: transitionDuration and transitionTimingFunction', () => {
    const extend = runConfig(exportTailwindV3(d, VERSION));
    expect(extend.transitionDuration).toEqual({
      75: '75ms',
      150: '150ms',
      200: '200ms',
      300: '300ms',
      500: '500ms',
      700: '700ms',
    });
    expect(extend.transitionTimingFunction).toMatchObject({
      'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      linear: 'linear',
      'custom-2': 'steps(4)',
    });
  });

  it('AC-F14.7 DTCG: duration tokens in ms and cubicBezier easings; steps() has no curve', () => {
    const doc = dtcg(d);
    expect(doc.duration['150']).toEqual({ $type: 'duration', $value: { value: 150, unit: 'ms' } });
    expect(Object.keys(doc.duration)).toEqual(['75', '150', '200', '300', '500', '700']);
    expect(doc.easing.out).toEqual({ $type: 'cubicBezier', $value: [0, 0, 0.2, 1] });
    expect(doc.easing.default).toEqual({ $type: 'cubicBezier', $value: [0.25, 0.1, 0.25, 1] });
    // A steps() easing is not a curve, so DTCG cannot express it and none is invented.
    expect(doc.easing['custom-2']).toBeUndefined();
  });

  it('AC-F14.7 variables.css and DESIGN.md carry durations and easings', () => {
    const css = exportCssVars(d, VERSION);
    expect(css).toContain('--duration-150: 150ms;');
    expect(css).toContain('--ease-out: cubic-bezier(0, 0, 0.2, 1);');
    expect(css).toContain('--ease-custom-2: steps(4);');
    const motion = section(exportDesignMd(d, VERSION), 'Motion');
    expect(motion).toContain('duration-150');
    expect(motion).toContain('ease-out cubic-bezier(0, 0, 0.2, 1)');
    expect(motion).toContain('usually animates color, opacity, background-color, transform');
    expect(motion).toContain('The site honors `prefers-reduced-motion`.');
  });
});

describe('text style exports (F15)', () => {
  const d = designs.typography;

  it('AC-F15.6 Tailwind v4: --tracking-* in @theme and an @utility per text style', () => {
    const css = exportTailwindV4(d, VERSION);
    const theme = block(css, '@theme {');
    expect(theme).toContain('--tracking-tighter: -0.05em;');
    expect(theme).toContain('--tracking-tight: -0.025em;');
    expect(theme).toContain('--tracking-normal: 0em;');
    expect(theme).toContain('--tracking-widest: 0.1em;');
    expect(theme).toContain('--tracking-custom-1: 0.15em;');
    const utilities = [...css.matchAll(/^@utility (\S+) \{$/gm)].map((m) => m[1]);
    expect(utilities).toEqual(d.typography.textStyles.map((s) => `text-${s.name}`));
    expect(css).toContain(
      [
        '@utility text-button {',
        '  font-family: var(--font-sans);',
        '  font-size: 14px;',
        '  line-height: 20px;',
        '  font-weight: 600;',
        '  letter-spacing: 0.05em;',
        '  text-transform: uppercase;',
        '}',
      ].join('\n'),
    );
  });

  it('AC-F15.6 Tailwind v3: letterSpacing and fontSize tuples per text style', () => {
    const extend = runConfig(exportTailwindV3(d, VERSION));
    expect(extend.letterSpacing).toMatchObject({
      tighter: '-0.05em',
      tight: '-0.025em',
      normal: '0em',
      wide: '0.025em',
      'custom-1': '0.15em',
    });
    expect(extend.fontSize.h1).toEqual([
      '40px',
      { lineHeight: '48px', letterSpacing: '-0.025em', fontWeight: '700' },
    ]);
    expect(extend.fontSize.overline).toEqual([
      '12px',
      { lineHeight: '16px', letterSpacing: '0.1em', fontWeight: '600' },
    ]);
  });

  it('AC-F15.6 DTCG: typography tokens reference the family and keep the transform', () => {
    const doc = dtcg(d);
    expect(Object.keys(doc.typography)).toEqual(d.typography.textStyles.map((s) => s.name));
    expect(doc.typography.h1).toMatchObject({
      $type: 'typography',
      $value: {
        fontFamily: '{font.sans}',
        fontSize: { value: 40, unit: 'px' },
        fontWeight: 700,
        letterSpacing: { value: -1, unit: 'px' },
        lineHeight: 1.2,
      },
    });
    expect(doc.typography.button.$extensions['com.webstyle'].textTransform).toBe('uppercase');
    expect(doc.tracking.tight).toEqual({
      $type: 'number',
      $value: -0.025,
      $extensions: { 'com.webstyle': { unit: 'em' } },
    });
  });

  it('AC-F15.6 DESIGN.md has a text style table with tracking and transform', () => {
    const md = exportDesignMd(d, VERSION);
    expect(md).toMatch(
      /### Text styles\n\n\| Text style +\| Font \| Size\/line \| Weight \| Tracking \| Transform \| Used for \|/,
    );
    expect(md).toMatch(
      /\| button \(verify\) +\| sans \| 14\/20 +\| 600 +\| wider +\| uppercase \| button/,
    );
    expect(md).toMatch(
      /\| overline \(verify\) +\| sans \| 12\/16 +\| 600 +\| widest +\| uppercase \|/,
    );
    expect(md).toContain('Letter spacing: tracking-tighter (verify) -0.05em');
  });
});

describe('layout structure exports (F16)', () => {
  const d = designs.layout;

  it('AC-F16.6 DESIGN.md has a Layout section with containers, grid columns and gaps', () => {
    const md = exportDesignMd(d, VERSION);
    const order = headings(md);
    expect(order.indexOf('Layout')).toBe(order.indexOf('Spacing') + 1);
    const layout = section(md, 'Layout');
    expect(layout).toContain('- Containers: container-sm (verify) 400px, prose (verify) 656px');
    expect(layout).toContain('- Grid columns: 2 (50%), 12 (25%) (verify), 3 (25%) (verify)');
    expect(layout).toContain(
      '- Gaps: space-2 (verify) 8px, gap-12 (verify) 12px, space-4 16px, gap-24 (verify) 24px',
    );
  });

  it('AC-F16.6 containers and gaps follow the 9.4 table; gaps on the spacing scale are references', () => {
    const v4 = exportTailwindV4(d, VERSION);
    expect(block(v4, '@theme {')).toContain('--container-sm: 400px;');
    expect(block(v4, '@theme {')).toContain('--container-prose: 656px;');
    const root = block(v4, ':root {');
    expect(root).toContain('--gap-12: 12px;');
    expect(root).toContain('--gap-32: 32px;');
    // space-2 and space-4 are spacing tokens, so they are not repeated as gaps.
    expect(v4).not.toMatch(/--gap-space|--gap-2:|--gap-8:/);

    const extend = runConfig(exportTailwindV3(d, VERSION));
    expect(extend.maxWidth).toMatchObject({ sm: '400px', prose: '656px', '2xl': '1200px' });
    expect(extend.gap).toEqual({ 12: '12px', 24: '24px', 32: '32px' });

    const doc = dtcg(d);
    expect(doc.container.sm).toEqual({ $type: 'dimension', $value: { value: 400, unit: 'px' } });
    expect(doc.gap['12']).toEqual({ $type: 'dimension', $value: { value: 12, unit: 'px' } });
    expect(Object.keys(doc.gap)).toEqual(['12', '24', '32']);
    expect(
      Object.values(doc['grid-columns'])
        .map((x) => [x.$type, x.$value])
        .sort((a, b) => a[1] - b[1]),
    ).toEqual([
      ['number', 2],
      ['number', 3],
      ['number', 12],
    ]);

    const css = exportCssVars(d, VERSION);
    expect(css).toContain('--container-xl: 1100px;');
    expect(css).toContain('--gap-24: 24px;');
  });

  it('AC-F16.6 grid columns appear only in DESIGN.md and DTCG', () => {
    for (const text of [
      exportTailwindV4(d, VERSION),
      exportTailwindV3(d, VERSION),
      exportCssVars(d, VERSION),
    ])
      expect(text).not.toMatch(/grid/i);
  });
});

describe('z-index, opacity and border width exports (F17)', () => {
  const d = designs.layout;

  it('AC-F17.6 Tailwind v4: plain :root variables used with the z-(--z-dialog) syntax', () => {
    const css = exportTailwindV4(d, VERSION);
    const theme = block(css, '@theme {');
    expect(theme).not.toMatch(/--z-|--opacity-|--border-/);
    const root = block(css, ':root {');
    expect(root).toContain('--z-dialog: 100;');
    expect(root).toContain('--z-menu: 40;');
    expect(root).toContain('--opacity-disabled: 0.4;');
    expect(root).toContain('--opacity-50: 0.5;');
    expect(root).toContain('--border-4: 4px;');
    expect(root).toContain(
      '/* No theme namespace in v4; use as z-(--z-1), opacity-(--opacity-35), border-(length:--border-1)',
    );
  });

  it('AC-F17.6 Tailwind v3: zIndex, opacity and borderWidth', () => {
    const extend = runConfig(exportTailwindV3(d, VERSION));
    expect(extend.zIndex).toEqual({
      1: '1',
      2: '2',
      menu: '40',
      header: '50',
      toast: '60',
      tooltip: '70',
      overlay: '90',
      dialog: '100',
    });
    expect(extend.opacity).toEqual({ 35: '0.35', disabled: '0.4', 50: '0.5', 75: '0.75' });
    expect(extend.borderWidth).toEqual({ 1: '1px', 2: '2px', 4: '4px' });
  });

  it('AC-F17.6 DTCG numbers and dimensions, variables.css and DESIGN.md sections', () => {
    const doc = dtcg(d);
    expect(doc['z-index'].dialog).toEqual({ $type: 'number', $value: 100 });
    expect(doc.opacity.disabled).toEqual({ $type: 'number', $value: 0.4 });
    expect(doc['border-width']['2']).toEqual({
      $type: 'dimension',
      $value: { value: 2, unit: 'px' },
    });

    const css = exportCssVars(d, VERSION);
    expect(css).toContain('--z-dialog: 100;');
    expect(css).toContain('--opacity-disabled: 0.4;');
    expect(css).toContain('--border-1: 1px;');

    const md = exportDesignMd(d, VERSION);
    const order = headings(md);
    expect(order.indexOf('Borders')).toBeLessThan(order.indexOf('Opacity'));
    expect(order.indexOf('Opacity')).toBeLessThan(order.indexOf('Z-index'));
    expect(section(md, 'Borders')).toContain('border-1 1px, border-2 2px, border-4 4px');
    expect(section(md, 'Borders')).toContain('usually solid');
    expect(section(md, 'Opacity')).toContain('opacity-disabled 0.4');
    expect(section(md, 'Z-index')).toContain('z-menu (verify) 40');
  });
});

describe('gradient exports (F18)', () => {
  const d = designs.gradients;

  it('AC-F18.6 CSS variables: :root --gradient-* in Tailwind v4 and variables.css', () => {
    const v4 = exportTailwindV4(d, VERSION);
    expect(block(v4, '@theme {')).not.toContain('--gradient-');
    const root = block(v4, ':root {');
    expect(root).toContain(
      '--gradient-hero: linear-gradient(to right, var(--color-blue-600), var(--color-purple-600));',
    );
    expect(root).toContain('bg-(image:--gradient-hero)');
    expect(root).toContain(
      '--gradient-3: repeating-linear-gradient(45deg, #e5e7eb 0px, #e5e7eb 10px, var(--color-white) 10px, var(--color-white) 20px);',
    );
    const css = exportCssVars(d, VERSION);
    expect(css).toContain(
      '--gradient-hero: linear-gradient(to right, var(--color-blue-600), var(--color-purple-600));',
    );
  });

  it('AC-F18.6 Tailwind v3 backgroundImage', () => {
    const extend = runConfig(exportTailwindV3(d, VERSION));
    expect(Object.keys(extend.backgroundImage).sort()).toEqual(['2', '3', '4', '5', '6', 'hero']);
    expect(extend.backgroundImage.hero).toBe('linear-gradient(to right, #2563eb, #7c3aed)');
    expect(extend.backgroundImage['2']).toBe('radial-gradient(circle, #f59e0b 0%, #ef4444 100%)');
  });

  it('AC-F18.6 DTCG gradient tokens reference colors, with the direction in $extensions', () => {
    const doc = dtcg(d);
    expect(doc.gradient.hero).toEqual({
      $type: 'gradient',
      $value: [
        { color: '{color.blue-600}', position: 0 },
        { color: '{color.purple-600}', position: 1 },
      ],
      $extensions: {
        'com.webstyle': { type: 'linear', direction: 'to right', repeating: false },
      },
    });
    expect(doc.gradient['3'].$extensions['com.webstyle'].repeating).toBe(true);
    // A stop with no color token is written as a DTCG color value.
    expect(doc.gradient['5'].$value[0].color).toMatchObject({ colorSpace: 'srgb', alpha: 0.4 });
  });

  it('AC-F18.6 DESIGN.md has a Gradients table under Colors', () => {
    const md = exportDesignMd(d, VERSION);
    const colors = section(md, 'Colors');
    expect(colors).toMatch(/### Gradients\n\n\| Token +\| Value +\|/);
    expect(colors).toMatch(/\| hero +\| linear-gradient\(to right, blue-600, purple-600\)/);
    expect(colors).toContain('Gradients are also used as text fills (`background-clip: text`).');
  });
});

describe('web fonts in DESIGN.md (F19)', () => {
  const d = designs.typography;

  it('AC-F19.6 the Stack section lists loaded web fonts with weights and provider', () => {
    const stack = section(exportDesignMd(d, VERSION), 'Stack');
    expect(stack).toContain('- Web font: Brand Sans 400, 700 (self-hosted)');
    // Faces that never loaded are not used by the page.
    expect(stack).not.toContain('Hosted Serif');
    const google = withMeta(d, {
      webFonts: [
        {
          family: 'Inter',
          weights: [400, 600],
          styles: ['normal'],
          provider: 'google-fonts',
          providerHost: 'fonts.gstatic.com',
          loaded: true,
        },
        {
          family: 'Mono Kit',
          weights: [500],
          styles: ['normal'],
          provider: 'other',
          providerHost: 'cdn.fonts-example.net',
          loaded: true,
        },
      ],
    });
    const md = exportDesignMd(google, VERSION);
    expect(section(md, 'Stack')).toContain('- Web font: Inter 400, 600 from Google Fonts');
    expect(section(md, 'Stack')).toContain('- Web font: Mono Kit 500 from cdn.fonts-example.net');
    expect(md).not.toContain('fonts.gstatic.com');
    expect(md).toContain('Load Inter (400, 600) and Mono Kit (500) rather than substituting.');
  });

  it('AC-F19.6 a rule tells the agent to load the same families and weights', () => {
    const md = exportDesignMd(d, VERSION);
    expect(section(md, 'Rules for the agent')).toMatch(
      /^\d+\. Load Brand Sans \(400, 700\) rather than substituting\.$/m,
    );
    expect(section(exportDesignMd(designs.motion, VERSION), 'Rules for the agent')).not.toContain(
      'Load ',
    );
  });
});

describe('responsive table in DESIGN.md (F24)', () => {
  const raw = loadRaw('responsive');
  const d = analyze([
    captureOf(raw),
    captureOf(raw, { id: 'w-768', kind: 'width', viewportWidth: 768 }),
    captureOf(raw, { id: 'w-375', kind: 'width', viewportWidth: 375 }),
  ]);

  it('AC-F24.6 DESIGN.md gets a Responsive section with both tables and a mobile-first rule', () => {
    const md = exportDesignMd(d, VERSION);
    const order = headings(md);
    expect(order.indexOf('Responsive')).toBe(order.indexOf('Breakpoints') + 1);
    const responsive = section(md, 'Responsive');
    expect(responsive).toMatch(/\| Text +\| 375px \| 768px \|/);
    expect(responsive).toMatch(/\| h1 +\| 48px +\| 48px +\|/);
    expect(responsive).toMatch(/\| body +\| 16px +\| 16px +\|/);
    expect(responsive).toMatch(/\| Layout +\| 375px \| 768px \|/);
    expect(responsive).toMatch(/\| grid columns +\| 4 +\| 4 +\|/);
    expect(responsive).toMatch(/\| spacing base +\| 8px +\| 8px +\|/);
    expect(responsive).toMatch(/\| container +\| \d+px +\| \d+px +\|/);
    expect(responsive).toContain('Build mobile first');
  });

  it('AC-F24.6 without width captures there is no Responsive section, and no other format exports it', () => {
    expect(headings(exportDesignMd(designs.classic, VERSION))).not.toContain('Responsive');
    for (const format of EXPORT_FORMATS.filter((f) => !['design-md', 'styleguide'].includes(f)))
      for (const file of renderFormat(format, d, VERSION))
        expect(file.text, `${format} ${file.path}`).not.toMatch(
          /## Responsive|\| spacing base|byWidth|375px/,
        );
  });
});

describe('accessibility in DESIGN.md (F27)', () => {
  it('AC-F27.7 an Accessibility section lists safe pairs and pairs to avoid, after Components', () => {
    const md = exportDesignMd(designs.layout, VERSION);
    const order = headings(md);
    expect(order.indexOf('Accessibility')).toBe(order.indexOf('Components') + 1);
    const a11y = section(md, 'Accessibility');
    expect(a11y).toMatch(/^Safe text pairs: gray-900 on white \(17\.74:1, AAA\)/m);
    expect(a11y).toMatch(/^Avoid: .+ on white \(2\.07:1, fails\)$/m);
    const safeLine = a11y.split('\n').find((l) => l.startsWith('Safe'));
    expect(safeLine).not.toContain('fail');
  });

  it('AC-F27.7 a token pair is listed once even when it shows up at two text sizes', () => {
    const d = designs.typography;
    expect(d.contrast.filter((c) => c.textTokenId === 'color:#111827').length).toBe(2);
    const a11y = section(exportDesignMd(d, VERSION), 'Accessibility');
    expect(a11y.match(/gray-900 on white/g)).toHaveLength(1);
    expect(a11y).toContain('Input border vs input: 4.54:1, passes 3:1');
  });

  it('AC-F27.7 a rule tells the agent to use only the safe pairs for text', () => {
    const rules = section(exportDesignMd(designs.classic, VERSION), 'Rules for the agent');
    expect(rules).toMatch(
      /^\d+\. Body text is `text` on `background`.*Use only the safe text pairs in Accessibility\.$/m,
    );
  });
});

describe('confidence in Markdown outputs (F28)', () => {
  it('AC-F28.6 every low-confidence token in DESIGN.md is marked (verify); others are not', () => {
    for (const name of ['layout', 'typography', 'motion', 'gradients']) {
      const d = designs[name];
      const md = exportDesignMd(d, VERSION);
      for (const id of d.audit.lowConfidence) {
        const { category, token } = findToken(d, id);
        if (category === 'grid')
          expect(md, `${name} ${id}`).toMatch(
            new RegExp(`${token.value} \\(\\d+%\\) \\(verify\\)`),
          );
        else expect(md, `${name} ${id}`).toContain(`${token.name} (verify)`);
      }
    }
    const md = exportDesignMd(designs.typography, VERSION);
    expect(md).toContain('| base         | 16px |');
    expect(md).not.toContain('tracking-normal (verify)');
    expect(md).toMatch(/\| body +\| sans/);
  });

  it('AC-F28.6 Notes lists the low-confidence items', () => {
    const d = designs.layout;
    const notes = section(exportDesignMd(d, VERSION), 'Notes');
    const line = notes
      .split('\n')
      .find((l) => l.startsWith('- Check these first (low confidence):'));
    expect(line).toBeDefined();
    const names = d.audit.lowConfidence.slice(0, 12).map((id) => findToken(d, id).token.name);
    expect(line).toBe(`- Check these first (low confidence): ${names.join(', ')}`);
  });

  it('AC-F28.6 a low-confidence semantic role is marked in the Semantic table and Notes', () => {
    const d = designs.typography;
    expect(d.roleConfidence.border.light.level).toBe('low');
    const md = exportDesignMd(d, VERSION);
    expect(md).toMatch(/\| border +\| gray-600 \(verify\) \|/);
  });

  it('AC-F28.7 the compact prompt leaves out low-confidence tokens without a semantic role', () => {
    const typo = exportPrompt(designs.typography, VERSION);
    const type = typo.split('\n').find((l) => l.startsWith('Type: '));
    expect(type).toBe('Type: xs 12 · sm 14 · base 16/24 (sans)');
    const styles = typo.split('\n').find((l) => l.startsWith('Text styles: '));
    for (const low of ['h1', 'h2', 'h3']) expect(styles).not.toMatch(new RegExp(`\\b${low} `));

    // duration-75 is the shortest duration but has low confidence.
    const motion = exportPrompt(designs.motion, VERSION);
    expect(motion).toContain('Motion: 150ms ease-in-out');
    expect(motion).not.toContain('75ms');
  });

  it('AC-F28.7 a low-confidence token that holds a role stays in the prompt', () => {
    const d = structuredClone(designs.classic);
    const primaryId = d.semantic.primary.light;
    d.colors.find((c) => c.id === primaryId).confidence.level = 'low';
    const family = d.typography.families[0];
    family.confidence.level = 'low';
    const prompt = exportPrompt(d, VERSION);
    expect(prompt).toContain(`primary ${d.colors.find((c) => c.id === primaryId).hex}`);
    // A family holds no role, so the low-confidence one gives way to the next.
    expect(prompt).not.toContain(`(${family.name})`);
  });
});

describe('audit.md (F29)', () => {
  it('AC-F29.6 audit.md holds the consistency report sections in the 9.9 order', () => {
    const md = exportAuditMd(designs.layout, VERSION);
    expect(md.split('\n')[0]).toBe('# Consistency report: 127.0.0.1');
    expect(headings(md)).toEqual([
      'Summary',
      'Near-duplicate colors',
      'Off-scale spacing',
      'Distinct counts',
      'Contrast failures',
      'Focus style',
      'Variable conflicts across pages',
      'Low-confidence items',
    ]);
  });

  it('AC-F29.6 audit.md exports the same content as the AuditReport', () => {
    for (const name of ['layout', 'rich', 'typography']) {
      const d = designs[name];
      const a = d.audit;
      const md = exportAuditMd(d, VERSION);
      const tokenName = (id) => findToken(d, id)?.token.name ?? id;
      const summary = section(md, 'Summary');
      expect(summary).toContain(
        `- Colors: ${a.colorsBeforeMerge} found, ${a.colorsAfterMerge} after merging`,
      );
      expect(summary).toContain(`- Contrast failures: ${a.contrastFailures}`);
      expect(summary).toContain(`- Low-confidence items: ${a.lowConfidence.length}`);
      for (const g of a.nearDuplicateGroups)
        expect(md).toContain(`- ${g.kept} kept; merged ${g.merged.join(', ')}`);
      if (a.offScaleSpacing) {
        for (const s of a.offScaleSpacing)
          expect(section(md, 'Off-scale spacing')).toContain(`- ${s.px}px (`);
      } else expect(headings(md)).not.toContain('Off-scale spacing');
      for (const [k, v] of Object.entries(a.distinct))
        expect(section(md, 'Distinct counts')).toContain(`- ${k}: ${v}`);
      for (const c of a.contrastFailureList)
        expect(section(md, 'Contrast failures')).toContain(
          `- ${tokenName(c.textTokenId)} on ${tokenName(c.backgroundTokenId)}: ${c.ratio}:1 (${c.mode})`,
        );
      const low = section(md, 'Low-confidence items')
        .split('\n')
        .filter((l) => l.startsWith('- '));
      expect(low).toEqual(a.lowConfidence.map((id) => `- ${tokenName(id)}`));
      // Every id resolves to a token name; none leaks as a raw id.
      expect(low.join('\n')).not.toMatch(/:[0-9a-f#]/);
    }
    expect(section(exportAuditMd(designs.layout, VERSION), 'Off-scale spacing')).toContain(
      '- 1px (3.6%)',
    );
  });
});
