import { describe, expect, it } from 'vitest';
import { exportPrompt } from '../../../src/export/index.js';
import { MAX_PROMPT_LINES } from '../../../src/export/prompt.js';
import { FIXTURE_NAMES } from '../helpers.js';
import { VERSION, fixtureDesigns, lineCount, richDesign } from './designs.js';

const designs = {
  ...fixtureDesigns(),
  rich: richDesign(),
  'rich-media': richDesign({ mechanism: 'media' }),
};
const ALL = [...FIXTURE_NAMES, 'rich', 'rich-media'];
const ORDER = [
  'Design system for',
  'Rules:',
  'Stack:',
  'Colors',
  'Type:',
  'Text styles:',
  'Spacing:',
  'Button:',
  'Focus ring:',
];

describe('prompt.md (F33)', () => {
  it.each(ALL)('AC-F33.1 prompt.md is 40 lines or fewer on %s', (name) => {
    expect(MAX_PROMPT_LINES).toBe(40);
    expect(lineCount(exportPrompt(designs[name], VERSION))).toBeLessThanOrEqual(40);
  });

  it('AC-F33.1 stays within 40 lines on a design with many colors', () => {
    const d = structuredClone(designs.rich);
    const base = d.colors[0];
    for (let i = 0; i < 200; i += 1) d.colors.push({ ...base, id: `color:x${i}`, name: `x-${i}` });
    expect(lineCount(exportPrompt(d, VERSION))).toBeLessThanOrEqual(40);
  });

  it('AC-F33.2 holds every item that exists for the site, in the documented order', () => {
    const lines = exportPrompt(designs.rich, VERSION).trimEnd().split('\n');
    const positions = ORDER.map((p) => lines.findIndex((l) => l.startsWith(p)));
    expect(
      positions.every((i) => i >= 0),
      JSON.stringify(positions),
    ).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const text = lines.join('\n');
    expect(lines[0]).toBe('Design system for 127.0.0.1 (light and dark). Follow it exactly.');
    expect(text).toContain(
      'Rules: only these tokens; semantic colors first; 4px spacing scale; focus ring on :focus-visible; support dark mode; honor reduced motion.',
    );
    expect(text).toContain('Stack: Helvetica Neue');
    expect(text).toContain(
      'Spacing: 4px base (4, 8, 12, 16, 24, 32, 48) · Radius: md 6, lg 8, full',
    );
    expect(text).toMatch(
      /Button: .+ · hover background gray-900 · focus-visible outline 2px solid/,
    );
    expect(text).toMatch(
      /Focus ring: outline 2px solid focus-ring \(blue-600\), offset 2px · Motion: 150ms ease-out$/,
    );
    // Within the colors, light and dark values share a line.
    expect(text).toContain(
      'Colors (light / dark): background #ffffff / #0b0f19 · text #111827 / #ffffff',
    );
  });

  it('AC-F33.2 leaves out items the site lacks, keeping the order of the rest', () => {
    const text = exportPrompt(designs.classic, VERSION);
    expect(text).not.toMatch(/^Focus ring:/m);
    expect(text).not.toContain('support dark mode');
    expect(text).toMatch(/^Colors: background #ffffff · text #111827/m);
    const lines = text.trimEnd().split('\n');
    const positions = ORDER.map((p) => lines.findIndex((l) => l.startsWith(p))).filter(
      (i) => i >= 0,
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // A button state without a visible change is not written as an empty entry.
    expect(exportPrompt(designs.rich, VERSION)).not.toMatch(
      / · (hover|focus-visible|active) ?(·|$)/m,
    );
  });

  it('AC-F33.3 low-confidence tokens without a role are omitted', () => {
    // Confidence is set here so the test does not depend on the analysis' current scoring.
    const d = structuredClone(designs.rich);
    const level = (token, value) => (token.confidence = { ...token.confidence, level: value });
    for (const s of d.typography.sizes) level(s, s.name === 'lg' ? 'low' : 'high');
    for (const s of d.shadows) level(s, 'low');
    const background = d.colors.find((c) => c.id === d.semantic.background.dark);
    level(background, 'low');
    const text = exportPrompt(d, VERSION);
    const type = text.split('\n').find((l) => l.startsWith('Type:'));
    expect(type).not.toContain(' lg 20');
    expect(type).toContain('base 16/24');
    expect(type).toContain('2xl 36');
    expect(text).not.toContain('Shadow:');
    // A low-confidence color that holds a role stays.
    expect(text).toContain(`background #ffffff / ${background.hex}`);
    level(d.shadows[0], 'high');
    expect(exportPrompt(d, VERSION)).toContain(`Shadow: sm ${d.shadows[0].value}`);
  });

  it.each(ALL)('AC-F33.5 snapshots cover prompt.md on %s', async (name) => {
    await expect(exportPrompt(designs[name], VERSION)).toMatchFileSnapshot(
      `./__snapshots__/${name}/design/prompt.md`,
    );
  });
});
