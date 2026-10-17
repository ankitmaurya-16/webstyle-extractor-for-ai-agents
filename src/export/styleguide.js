// styleguide.html (F34): one self-contained page. Inline CSS built on the exported variables,
// inline JavaScript only for the Light / Dark toggle and click-to-copy. Fonts are referenced by
// name, never loaded; nothing is fetched when the file is opened.

import { formatFontStack } from '../analyze/units.js';
import { cssValue, findToken, modesOf, primaryModeOf, semanticRows } from '../model/design.js';
import { captureDate, collectTokens, prepare, pxString } from './common.js';
import { describeFocusRing, describeStyles, recipeTitle } from './describe.js';
import { exportCssVars, gradientCss } from './css-vars.js';
import { confidentFrameworks, confidentIcons, frameworkLabel } from './rules.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
/** Keeps page-derived CSS values from closing the style element. */
const cssSafe = (s) => String(s ?? '').replace(/</g, '\\3c ').replace(/[{}]/g, '');

const STATES = ['default', 'hover', 'focus', 'focus-visible', 'active'];

/**
 * @param {object} design
 * @param {string} version
 * @param {{mapping?: object|null, screenshotData?: Array<{recipeId: string, mode: string, dataUrl: string}>}} [ctx]
 */
export function exportStyleguide(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const t = collectTokens(d);
  const modes = modesOf(d);
  const primary = primaryModeOf(d);
  const paired = modes.length > 1;
  const sections = [];
  const section = (id, title, body) => body && sections.push(`<section aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${body}</section>`);
  const swatch = (hex, label) =>
    `<button type="button" class="swatch${hex.length === 9 ? ' checker' : ''}" data-copy="${esc(hex)}" aria-label="Copy ${esc(label)} ${esc(hex)}"><span style="background:${cssSafe(hex)}"></span></button>`;

  // ---- Colors ----
  const rows = semanticRows(d);
  let colors = '';
  if (rows.length) {
    colors += '<h3>Semantic</h3><table><thead><tr><th scope="col">Role</th>';
    for (const m of modes) colors += `<th scope="col">${m === 'dark' ? 'Dark' : 'Light'}</th>`;
    colors += '</tr></thead><tbody>';
    for (const r of rows) {
      colors += `<tr><th scope="row">${esc(r.role)}</th>`;
      for (const m of modes) {
        const tok = r.byMode[m];
        colors += `<td>${tok ? `${swatch(tok.hex, tok.name)} <code>${esc(tok.name)}</code> <code>${esc(tok.hex)}</code>` : ''}</td>`;
      }
      colors += '</tr>';
    }
    colors += '</tbody></table>';
  }
  if (t.opaque.length) {
    colors += `<h3>Scales</h3><ul class="grid">${t.opaque
      .map((c) => `<li>${swatch(c.hex, c.name)}<code>${esc(c.name)}</code><code>${esc(c.hex)}</code></li>`)
      .join('')}</ul>`;
  }
  if (t.translucent.length) {
    colors += `<h3>Translucent</h3><ul class="grid">${t.translucent
      .map((c) => `<li>${swatch(c.hex, c.name)}<code>${esc(c.name)}</code><code>${esc(c.hex)}</code><small>looks like ${esc(c.effectiveHex)}</small></li>`)
      .join('')}</ul>`;
  }
  if (t.gradients.length) {
    colors += `<h3>Gradients</h3><ul class="stack">${t.gradients
      .map((g) => `<li><span class="strip" style="background-image:${cssSafe(gradientCss(d, g, (c) => c.hex))}"></span><code>${esc(g.name)}</code></li>`)
      .join('')}</ul>`;
  }
  section('colors', 'Colors', colors);

  // ---- Typography ----
  let type = '';
  if (t.families.length) {
    type += `<h3>Families</h3><ul class="stack">${t.families
      .map((f) => `<li><code>${esc(f.name)}</code> <span style="font-family:${cssSafe(formatFontStack(f.stack))}">${esc(f.stack[0])}</span> <small>${f.webFont ? 'web font' : 'system font'}</small></li>`)
      .join('')}</ul>`;
  }
  if (t.textStyles.length) {
    type += `<h3>Text styles</h3><ul class="stack">${t.textStyles
      .map((s) => {
        const family = d.typography.families.find((f) => f.id === s.familyId);
        const style = [
          family ? `font-family:${cssSafe(formatFontStack(family.stack))}` : '',
          `font-size:${s.sizePx}px`,
          s.lineHeightPx ? `line-height:${s.lineHeightPx}px` : '',
          `font-weight:${s.fontWeight}`,
          s.letterSpacingEm ? `letter-spacing:${s.letterSpacingEm}em` : '',
          s.textTransform !== 'none' ? `text-transform:${cssSafe(s.textTransform)}` : '',
        ]
          .filter(Boolean)
          .join(';');
        return `<li><code>${esc(s.name)}</code> <span style="${style}">The quick brown fox</span> <small>${s.sizePx}/${s.lineHeightPx ?? 'normal'} ${s.fontWeight}</small></li>`;
      })
      .join('')}</ul>`;
  }
  if (t.sizes.length) {
    type += `<h3>Scale</h3><ul class="stack">${t.sizes
      .map((s) => `<li><code>${esc(s.name)}</code> <span style="font-size:${Math.min(s.sizePx, 48)}px;line-height:1.2">Aa</span> <small>${pxString(s.sizePx)}</small></li>`)
      .join('')}</ul>`;
  }
  section('typography', 'Typography', type);

  // ---- Spacing and layout ----
  const maxSpace = Math.max(1, ...t.spacing.map((s) => s.px));
  section(
    'spacing',
    'Spacing',
    t.spacing.length
      ? `<p>${d.spacing.baseUnitPx ? `Base unit ${d.spacing.baseUnitPx}px` : 'No base unit'}</p><ul class="stack">${t.spacing
          .map((s) => `<li><code>${esc(s.name)}</code><span class="bar" style="width:${Math.max(2, (s.px / maxSpace) * 100)}%"></span><small>${pxString(s.px)}</small></li>`)
          .join('')}</ul>`
      : '',
  );
  let layout = '';
  if (t.containers.length) layout += `<h3>Containers</h3><p>${t.containers.map((c) => `<code>${esc(c.name)}</code> ${pxString(c.px)}`).join(' · ')}</p>`;
  if (t.gridColumns.length) layout += `<h3>Grid columns</h3><p>${t.gridColumns.map((g) => `${g.value}`).join(' · ')}</p>`;
  if (t.gaps.length) layout += `<h3>Gaps</h3><p>${t.gaps.map((g) => `<code>${esc(g.name)}</code> ${pxString(g.px)}`).join(' · ')}</p>`;
  if (d.responsive) {
    const w = d.responsive.widths;
    layout += `<h3>Responsive</h3><table><thead><tr><th scope="col">Text</th>${w.map((x) => `<th scope="col">${x}px</th>`).join('')}</tr></thead><tbody>${d.responsive.textSizes
      .map((r) => `<tr><th scope="row">${esc(r.label)}</th>${w.map((x) => `<td>${r.byWidth[x] ?? '-'}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  }
  section('layout', 'Layout', layout);
  section(
    'radius',
    'Radius',
    t.radii.length
      ? `<ul class="grid">${t.radii.map((r) => `<li><span class="tile" style="border-radius:${Math.min(r.px, 40)}px"></span><code>${esc(r.name)}</code></li>`).join('')}</ul>`
      : '',
  );
  section(
    'borders',
    'Borders',
    t.borderWidths.length
      ? `<ul class="grid">${t.borderWidths.map((b) => `<li><span class="tile" style="border:${b.px}px ${cssSafe(d.meta.borderStyle ?? 'solid')} #6b7280"></span><code>${esc(b.name)}</code></li>`).join('')}</ul>`
      : '',
  );
  section(
    'shadows',
    'Shadows',
    t.shadows.length
      ? `<ul class="grid light-tile">${t.shadows.map((s) => `<li><span class="tile white" style="box-shadow:${cssSafe(s.value)}"></span><code>${esc(s.name)}</code></li>`).join('')}</ul>`
      : '',
  );
  section(
    'opacity',
    'Opacity',
    t.opacities.length
      ? `<ul class="grid">${t.opacities.map((o) => `<li><span class="tile filled" style="opacity:${o.value}"></span><code>${esc(o.name)}</code></li>`).join('')}</ul>`
      : '',
  );
  section(
    'z-index',
    'Z-index',
    t.zIndex.length ? `<ol class="stack" reversed>${[...t.zIndex].reverse().map((z) => `<li><code>${esc(z.name)}</code> ${z.value}</li>`).join('')}</ol>` : '',
  );
  section(
    'motion',
    'Motion',
    t.durations.length || t.easings.length
      ? `<p>${t.durations.map((x) => `<code>${esc(x.name)}</code>`).join(' · ')}</p><ul class="grid">${t.easings
          .map((e) => `<li>${curveSvg(e)}<code>${esc(e.name)}</code></li>`)
          .join('')}</ul>`
      : '',
  );
  section('breakpoints', 'Breakpoints', t.breakpoints.length ? `<p>${t.breakpoints.map((b) => `<code>${esc(b.name)}</code> ${pxString(b.px)}`).join(' · ')}</p>` : '');

  // ---- Components: states side by side, as static examples (AC-F34.4) ----
  const recipes = d.components.filter((r) => !r.excluded);
  let comps = '';
  const ring = describeFocusRing(d);
  comps += `<h3>Focus ring</h3><p>${esc(ring ?? 'No focus style found; the browser default is used.')}</p>`;
  for (const r of recipes) {
    const states = r.byMode[primary] ?? Object.values(r.byMode)[0] ?? {};
    comps += `<h3>${esc(recipeTitle(r))}</h3><div class="states">`;
    for (const state of STATES) {
      if (!states[state]) continue;
      const merged = { ...states.default, ...(state === 'default' ? {} : states[state]) };
      comps += `<figure><div class="preview" role="img" aria-label="${esc(`${recipeTitle(r)}, ${state}`)}">${previewHtml(d, r, merged)}</div><figcaption>${esc(state)}</figcaption></figure>`;
    }
    comps += `</div><p><small>${esc(describeStyles(d, states.default, primary))}</small></p>`;
    for (const shot of (ctx.screenshotData ?? []).filter((s) => s.recipeId === r.id)) {
      comps += `<img class="shot" src="${esc(shot.dataUrl)}" alt="${esc(`Screenshot: ${recipeTitle(r)}${shot.mode === 'dark' ? ', dark' : ''}`)}">`;
    }
  }
  section('components', 'Components', comps);

  // ---- Accessibility ----
  if ((d.contrast ?? []).length) {
    const name = (id) => findToken(d, id)?.token.name ?? id;
    section(
      'accessibility',
      'Accessibility',
      `<table><thead><tr><th scope="col">Pair</th><th scope="col">Ratio</th><th scope="col">Level</th></tr></thead><tbody>${d.contrast
        .slice(0, 20)
        .map((c) => `<tr><td>${esc(`${name(c.textTokenId)} on ${name(c.backgroundTokenId)}${paired ? ` (${c.mode})` : ''}`)}</td><td>${c.ratio}:1</td><td>${esc(c.level)}</td></tr>`)
        .join('')}</tbody></table>`,
    );
  }

  const stack = [
    ...confidentFrameworks(d).map(frameworkLabel),
    ...confidentIcons(d).slice(0, 1).map((i) => `${i.name} icons`),
    ...(d.meta.webFonts ?? []).filter((f) => f.loaded).map((f) => f.family),
  ];
  const vars = exportCssVars(design, version, ctx)
    .replace(/^\/\*.*\*\/\n/, '')
    .replace(/<\//g, '<\\/');
  const darkOverrides = paired
    ? `:root[data-theme="dark"]{${(t.semanticByMode.dark ?? []).map(([role, c]) => `--color-${role}:${c.hex};`).join('')}}`
    : '';
  const toggle = paired
    ? '<button type="button" id="theme" aria-pressed="false">Show dark theme</button>'
    : '';
  const script = `<script>
document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var v=b.getAttribute('data-copy');if(navigator.clipboard){navigator.clipboard.writeText(v).catch(function(){});}var s=document.getElementById('status');s.textContent='Copied '+v;});
var t=document.getElementById('theme');if(t){t.addEventListener('click',function(){var r=document.documentElement;var dark=r.getAttribute('data-theme')!=='dark';r.setAttribute('data-theme',dark?'dark':'light');t.setAttribute('aria-pressed',String(dark));t.textContent=dark?'Show light theme':'Show dark theme';});}
</script>`;
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Style guide: ${esc(d.meta.hostname)}</title>
<style>
${vars}${darkOverrides}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:#1f2937;background:#ffffff;line-height:1.5}
header,main{max-width:1040px;margin:0 auto;padding:24px}h1{font-size:28px;margin:0 0 4px}h2{font-size:20px;margin:32px 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}h3{font-size:15px;margin:20px 0 8px}
code{font-family:ui-monospace,monospace;font-size:12px}small{color:#4b5563}table{border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:4px 12px 4px 0;vertical-align:middle}
.grid{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}.grid li{display:flex;flex-direction:column;gap:4px}
.stack{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px}.stack li{display:flex;align-items:center;gap:12px}
.swatch{width:40px;height:40px;border:1px solid #d1d5db;border-radius:6px;padding:0;cursor:pointer;background:#fff;overflow:hidden}.swatch span{display:block;width:100%;height:100%}
.checker{background-image:linear-gradient(45deg,#d1d5db 25%,transparent 25%,transparent 75%,#d1d5db 75%),linear-gradient(45deg,#d1d5db 25%,transparent 25%,transparent 75%,#d1d5db 75%);background-size:12px 12px;background-position:0 0,6px 6px}
.strip{display:block;width:240px;height:24px;border-radius:4px;border:1px solid #d1d5db}.bar{display:block;height:8px;background:#4b5563;border-radius:2px;max-width:320px}
.tile{display:block;width:56px;height:56px;background:#e5e7eb;border:1px solid #9ca3af}.tile.white{background:#fff;border:0}.tile.filled{background:#374151}.light-tile{background:#f4f4f5;padding:16px;border-radius:8px}
.states{display:flex;flex-wrap:wrap;gap:12px}.states figure{margin:0;display:flex;flex-direction:column;gap:4px;align-items:flex-start}.preview{min-height:56px;min-width:120px;padding:12px;border:1px dashed #d1d5db;border-radius:6px;display:flex;align-items:center;background:var(--color-background,#fff)}
.shot{max-width:320px;border:1px solid #d1d5db;border-radius:6px}#theme{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #6b7280;background:#fff;color:#1f2937;cursor:pointer}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
</style>
</head>
<body>
<header>
<h1>Design system: ${esc(d.meta.hostname)}</h1>
<p>Extracted ${esc(captureDate(d))} from <code>${esc(d.meta.sourceUrl)}</code> · WebStyle Extractor v${esc(version)}${stack.length ? ` · ${esc(stack.join(' · '))}` : ''}</p>
${toggle}
<p id="status" role="status" aria-live="polite"></p>
</header>
<main>
${sections.join('\n')}
</main>
${script}
</body>
</html>
`;
}

function previewHtml(d, recipe, styles) {
  const css = [];
  const set = (prop, value) => value && value !== 'none' && css.push(`${prop}:${cssSafe(value)}`);
  set('background-color', styles['background-color'] && cssValue(d, styles['background-color']));
  if (styles['background-image'] && styles['background-image'] !== 'none') set('background-image', cssValue(d, styles['background-image']));
  set('color', styles.color && cssValue(d, styles.color));
  if (styles.border) css.push(`border:${cssSafe(styles.border === 'none' ? '0' : styles.border)}`);
  set('border-radius', styles['border-radius'] && cssValue(d, styles['border-radius']));
  set('padding', styles.padding);
  set('font-family', styles['font-family'] && (typeof styles['font-family'] === 'object' ? styles['font-family'].raw : styles['font-family']));
  set('font-size', styles['font-size'] && cssValue(d, styles['font-size']));
  set('font-weight', styles['font-weight']);
  set('line-height', styles['line-height']);
  set('letter-spacing', styles['letter-spacing'] !== 'normal' ? styles['letter-spacing'] : null);
  set('text-transform', styles['text-transform']);
  set('box-shadow', styles['box-shadow'] && cssValue(d, styles['box-shadow']));
  set('outline', styles.outline);
  set('outline-offset', styles.outline && styles['outline-offset']);
  const label = {
    button: 'Button',
    input: 'Placeholder',
    link: 'Link text',
    card: 'Card title',
    badge: 'Badge',
    alert: 'Alert message',
    navbar: 'Home · About · Contact',
    tabs: 'Tab 1 · Tab 2',
    table: 'Cell · Cell',
    heading: `Heading ${recipe.variant.slice(1)}`,
  }[recipe.kind];
  const tag = recipe.kind === 'link' ? 'span style="text-decoration:underline;' : 'span style="display:inline-block;';
  return `<${tag}${css.join(';')}">${esc(label)}</span>`;
}

function curveSvg(e) {
  if (!e.bezier) return '<svg width="48" height="32" aria-hidden="true"></svg>';
  const [x1, y1, x2, y2] = e.bezier;
  const P = (x, y) => `${(x * 44 + 2).toFixed(1)},${(30 - y * 28).toFixed(1)}`;
  return `<svg width="48" height="32" viewBox="0 0 48 32" aria-hidden="true"><path d="M${P(0, 0)} C${P(x1, y1)} ${P(x2, y2)} ${P(1, 1)}" fill="none" stroke="#374151" stroke-width="2"/></svg>`;
}
