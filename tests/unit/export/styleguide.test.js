import { describe, expect, it } from 'vitest';
import { exportFiles, exportStyleguide } from '../../../src/export/index.js';
import { FIXTURE_NAMES } from '../helpers.js';
import { VERSION, fixtureDesigns, richDesign } from './designs.js';

const designs = {
  ...fixtureDesigns(),
  rich: richDesign(),
  'rich-media': richDesign({ mechanism: 'media' }),
};
const ALL = [...FIXTURE_NAMES, 'rich', 'rich-media'];
const sectionIds = (html) =>
  [...html.matchAll(/<section aria-labelledby="([a-z-]+)">/g)].map((m) => m[1]);
const styleOf = (html) => html.split('<style>')[1].split('</style>')[0];
const scriptOf = (html) => html.split('<script>')[1].split('</script>')[0];

describe('styleguide.html (F34)', () => {
  it.each(ALL)('AC-F34.1 references nothing outside the file on %s', (name) => {
    const html = exportStyleguide(designs[name], VERSION);
    // The source URL is printed as text only; nothing is loaded from it.
    const urls = [...html.matchAll(/https?:\/\/[^\s"'<)]+/g)].map((m) => m[0]);
    expect(urls.every((u) => u === designs[name].meta.sourceUrl)).toBe(true);
    expect(html).toContain(`<code>${designs[name].meta.sourceUrl}</code>`);
    expect(html).not.toMatch(/<(link|iframe|object|embed|img|video|audio|source)\b/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/\b(src|href|srcset|action)=/i);
    const css = styleOf(html);
    expect(css).not.toMatch(/@import|@font-face|url\(/i);
    const js = scriptOf(html);
    expect(js).not.toMatch(
      /fetch|XMLHttpRequest|import\(|WebSocket|sendBeacon|new Image|\beval\b|Function\(/,
    );
  });

  it('AC-F34.2 every section with data appears, in the order of DESIGN.md', () => {
    const html = exportStyleguide(designs.rich, VERSION);
    expect(sectionIds(html)).toEqual([
      'colors',
      'typography',
      'spacing',
      'layout',
      'radius',
      'borders',
      'shadows',
      'opacity',
      'z-index',
      'motion',
      'breakpoints',
      'components',
      'accessibility',
      'notes',
    ]);
    const header = html.split('<header>')[1].split('</header>')[0];
    expect(header).toContain('Design system: 127.0.0.1');
    expect(header).toContain('Extracted 2026-10-18');
    expect(header).toContain('WebStyle Extractor v2.0.0 · Helvetica Neue');
    for (const sub of [
      '<h3>Semantic</h3>',
      '<h3>Scales</h3>',
      '<h3>Gradients</h3>',
      '<h3>Families</h3>',
      '<h3>Text styles</h3>',
      '<h3>Scale</h3>',
      '<h3>Containers</h3>',
      '<h3>Grid columns</h3>',
      '<h3>Gaps</h3>',
      '<h3>Focus ring</h3>',
    ]) {
      expect(html, sub).toContain(sub);
    }
    expect(html).toContain('<svg width="48" height="32" viewBox="0 0 48 32" aria-hidden="true">');
  });

  it('AC-F34.2 sections without data are left out; translucent colors sit on a checkerboard', () => {
    const classic = sectionIds(exportStyleguide(designs.classic, VERSION));
    for (const id of ['opacity', 'z-index', 'motion']) expect(classic).not.toContain(id);
    const dark = exportStyleguide(designs.dark, VERSION);
    expect(dark).toContain('<h3>Translucent</h3>');
    expect(dark).toMatch(/class="swatch checker" data-copy="#00000080"/);
  });

  it('AC-F34.3 the Light / Dark toggle appears only with two themes and switches every semantic value', () => {
    for (const name of FIXTURE_NAMES) {
      const html = exportStyleguide(designs[name], VERSION);
      expect(html, name).not.toContain('id="theme"');
      expect(html, name).not.toContain('[data-theme="dark"]');
    }
    const d = designs.rich;
    const html = exportStyleguide(d, VERSION);
    expect(html).toContain(
      '<button type="button" id="theme" aria-pressed="false">Show dark theme</button>',
    );
    const overrides = /:root\[data-theme="dark"\]\{([^}]*)\}/.exec(html)[1];
    const darkRoles = Object.entries(d.semantic).filter(([, byMode]) => byMode.dark);
    expect(darkRoles.length).toBe(3);
    for (const [role, byMode] of darkRoles) {
      const hex = d.colors.find((c) => c.id === byMode.dark).hex;
      expect(overrides).toContain(`--color-${role}:${hex};`);
    }
    expect(scriptOf(html)).toContain("r.setAttribute('data-theme',dark?'dark':'light')");
  });

  it('AC-F34.4 component states are shown side by side as static examples', () => {
    const html = exportStyleguide(designs.rich, VERSION);
    const button = html.split('<h3>Button, primary</h3>')[1].split('<h3>')[0];
    const captions = [...button.matchAll(/<figcaption>([a-z-]+)<\/figcaption>/g)].map((m) => m[1]);
    expect(captions).toEqual(['default', 'hover', 'focus-visible']);
    expect(button.startsWith('<div class="states">')).toBe(true);
    expect(button).toContain('background-color:#111827');
    expect(button).toContain('outline:2px solid #2563eb');
    expect(styleOf(html)).not.toMatch(/:(hover|focus|active)\b/);
  });

  it.each(ALL)('AC-F34.6 without screenshots the file is 500 KB or less on %s', (name) => {
    const bytes = new TextEncoder().encode(exportStyleguide(designs[name], VERSION)).length;
    expect(bytes).toBeLessThanOrEqual(500 * 1024);
  });

  it('embeds screenshots as data URIs only when "Include screenshots" is on', () => {
    const d = designs.rich;
    const screenshotData = [
      {
        recipeId: 'component:button:primary',
        mode: 'light',
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ];
    const html = (includeScreenshots) =>
      exportFiles(d, VERSION, {
        formats: ['styleguide'],
        ctx: { screenshotData },
        includeScreenshots,
      })[0].text;
    expect(html(true)).toContain(
      '<img class="shot" src="data:image/png;base64,iVBORw0KGgo=" alt="Screenshot: Button, primary">',
    );
    expect(html(false)).not.toContain('data:image');
    expect(html(false)).not.toContain('class="shot"');
  });

  it('escapes page-derived text so it cannot break out of the markup', () => {
    const d = structuredClone(designs.classic);
    d.meta.hostname = '<script>alert(1)</script>';
    d.typography.families[0].stack = ['Evil</style><script>x()</script>', 'sans-serif'];
    const html = exportStyleguide(d, VERSION);
    // Inside <style> only `</style` could end the element, and it is escaped there.
    expect(html.match(/<\/style>/g)).toHaveLength(1);
    const outsideStyle = html.replace(/<style>[\s\S]*<\/style>/, '');
    expect(outsideStyle.match(/<script>/g)).toHaveLength(1);
    expect(outsideStyle).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it.each(ALL)('AC-F34.7 snapshots cover the HTML on %s', async (name) => {
    await expect(exportStyleguide(designs[name], VERSION)).toMatchFileSnapshot(
      `./__snapshots__/${name}/design/styleguide.html`,
    );
  });
});
