// DESIGN.md v2: the file an AI coding agent reads (v2 spec 9.5). Under 450 lines.

import { formatFontStack } from '../analyze/units.js';
import {
  findToken,
  modesOf,
  primaryModeOf,
  roleToken,
  semanticRows,
  visible,
} from '../model/design.js';
import { captureDate, collectTokens, emString, finish, prepare, pxString } from './common.js';
import { describeFocusRing, describeStyles, recipeTitle } from './describe.js';
import {
  agentRules,
  confidentFrameworks,
  confidentIcons,
  frameworkLabel,
  mechanismText,
} from './rules.js';
import { screenshotPath } from './files.js';

export const MAX_LINES = 450;

/** Renders rows as a Markdown table with columns padded to equal width. */
export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => `| ${cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ')} |`;
  return [line(headers), `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`, ...rows.map(line)];
}

export const percent = (share) =>
  share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;
const verify = (t) => (t?.confidence?.level === 'low' ? ' (verify)' : '');

/**
 * @param {object} design
 * @param {string} version
 * @param {{mapping?: object|null, screenshots?: Array<{recipeId: string, mode: string}>}} [ctx]
 */
export function exportDesignMd(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  // Drop the lowest-usage scale colors first, then low-confidence tokens, until it fits (v2 spec
  // decision log). Semantic roles and rules are never dropped.
  let dropScale = 0;
  let dropLow = false;
  for (;;) {
    const text = render(d, version, ctx, { dropScale, dropLow });
    const lines = text.split('\n').length;
    if (lines <= MAX_LINES) return text;
    const scaleCount = scaleCandidates(d).length;
    if (dropScale < scaleCount)
      dropScale = Math.min(scaleCount, dropScale + Math.max(1, lines - MAX_LINES));
    else if (!dropLow) dropLow = true;
    else return text;
  }
}

function scaleCandidates(d) {
  const roleIds = new Set(Object.values(d.semantic ?? {}).flatMap((ref) => Object.values(ref)));
  return visible(d.colors)
    .filter((c) => !roleIds.has(c.id))
    .sort((a, b) => a.usageShare - b.usageShare);
}

function render(d, version, ctx, { dropScale, dropLow }) {
  const t = collectTokens(d);
  const modes = modesOf(d);
  const primary = primaryModeOf(d);
  const dropped = new Set(
    scaleCandidates(d)
      .slice(0, dropScale)
      .map((c) => c.id),
  );
  const keep = (token) => !dropped.has(token.id) && !(dropLow && token.confidence?.level === 'low');
  let omitted = dropped.size;
  const out = [];

  // ---- Title ----
  out.push(`# Design system: ${d.meta.hostname}`, '');
  const pages = d.meta.pages?.length ?? 1;
  const source = pages > 1 ? `${pages} pages of ${d.meta.sourceUrl}` : d.meta.sourceUrl;
  const themes = modes.length > 1 ? 'light and dark themes' : `${modes[0]} theme`;
  const capture = d.meta.capture?.advanced ? ' · Advanced capture' : '';
  out.push(
    `Extracted ${captureDate(d)} from ${source} · ${themes}${capture} · WebStyle Extractor v${version}`,
    '',
  );

  // ---- Rules ----
  out.push('## Rules for the agent', '');
  agentRules(d, ctx).forEach((rule, i) => out.push(`${i + 1}. ${rule}`));
  out.push('');

  // ---- Stack ----
  const frameworks = confidentFrameworks(d);
  const icons = confidentIcons(d);
  const fonts = (d.meta.webFonts ?? []).filter((f) => f.loaded);
  if (frameworks.length || icons.length || fonts.length) {
    out.push('## Stack', '');
    if (frameworks.length)
      out.push(
        `- Framework: ${frameworks.map((f) => `${frameworkLabel(f)} (${f.confidence.level} confidence)`).join(', ')}`,
      );
    for (const icon of icons.slice(0, 1)) {
      const size = d.meta.iconSizePx ? `, ${d.meta.iconSizePx}px` : '';
      const stroke = d.meta.iconStroke ? `, stroke ${d.meta.iconStroke}` : '';
      out.push(`- Icons: ${icon.name}${size}${stroke} (${icon.confidence.level} confidence)`);
    }
    for (const f of fonts)
      out.push(`- Web font: ${f.family} ${f.weights.join(', ')}${providerText(f)}`);
    out.push('');
  }

  // ---- Colors ----
  const rows = semanticRows(d);
  const scale = t.opaque.filter(keep);
  const translucent = t.translucent.filter(keep);
  if (t.colors.length) {
    out.push('## Colors', '');
    if (rows.length) {
      out.push('### Semantic', '');
      const hasSite = rows.some((r) => Object.values(r.byMode).some((tok) => tok?.siteVariable));
      const site = (r) =>
        Object.values(r.byMode).find((tok) => tok?.siteVariable)?.siteVariable ?? '';
      if (modes.length > 1) {
        const headers = [
          'Role',
          'Light token',
          'Light',
          'Dark token',
          'Dark',
          ...(hasSite ? ['Site variable'] : []),
        ];
        out.push(
          ...table(
            headers,
            rows.map((r) => [
              r.role,
              r.byMode.light ? `${r.byMode.light.name}${verifyRole(d, r.role, 'light')}` : '',
              r.byMode.light?.hex ?? '',
              r.byMode.dark ? `${r.byMode.dark.name}${verifyRole(d, r.role, 'dark')}` : '',
              r.byMode.dark?.hex ?? '',
              ...(hasSite ? [site(r)] : []),
            ]),
          ),
          '',
        );
      } else {
        const headers = ['Role', 'Token', 'Hex', ...(hasSite ? ['Site variable'] : [])];
        out.push(
          ...table(
            headers,
            rows.map((r) => {
              const tok = r.byMode[primary];
              return [
                r.role,
                `${tok.name}${verifyRole(d, r.role, primary)}`,
                tok.hex,
                ...(hasSite ? [tok.siteVariable ?? ''] : []),
              ];
            }),
          ),
          '',
        );
      }
      if (modes.length > 1 && mechanismText(d))
        out.push(
          `Theme switching: ${mechanismText(d)}${d.meta.themeSelector && d.meta.themeMechanism !== 'media' ? ` (\`${d.meta.themeSelector}\`)` : ''}.`,
          '',
        );
    }
    if (scale.length) {
      out.push('### Scales', '');
      const hasSite = scale.some((c) => c.siteVariable);
      out.push(
        ...table(
          ['Token', 'Hex', 'Usage', ...(hasSite ? ['Site variable'] : [])],
          scale.map((c) => [
            `${c.name}${verify(c)}`,
            c.hex,
            percent(c.usageShare),
            ...(hasSite ? [c.siteVariable ?? ''] : []),
          ]),
        ),
        '',
      );
    }
    if (translucent.length) {
      out.push('### Translucent', '');
      out.push(
        ...table(
          ['Token', 'Value', 'Alpha', 'Looks like on background'],
          translucent.map((c) => [
            `${c.name}${verify(c)}`,
            c.hex,
            `${Math.round(c.alpha * 100)}%`,
            c.effectiveHex,
          ]),
        ),
        '',
      );
      out.push('Use opacity modifiers in Tailwind, for example `border-black/10`.', '');
    }
    if (t.gradients.length) {
      out.push('### Gradients', '');
      out.push(
        ...table(
          ['Token', 'Value'],
          t.gradients.map((g) => [g.name, gradientText(d, g)]),
        ),
        '',
      );
      if (d.meta.gradientText > 0)
        out.push('Gradients are also used as text fills (`background-clip: text`).', '');
    }
  }

  // ---- Typography ----
  if (t.families.length || t.sizes.length) {
    out.push('## Typography', '');
    if (t.families.length) {
      out.push(
        ...table(
          ['Family', 'Stack', 'Source'],
          t.families.map((f) => [
            f.name,
            formatFontStack(f.stack),
            f.webFont ? `web font${providerText(f.webFont)}` : 'system font',
          ]),
        ),
        '',
      );
    }
    const styles = t.textStyles.filter(keep);
    if (styles.length) {
      out.push('### Text styles', '');
      out.push(
        ...table(
          ['Text style', 'Font', 'Size/line', 'Weight', 'Tracking', 'Transform', 'Used for'],
          styles.map((s) => [
            s.name,
            familyName(d, s.familyId),
            `${s.sizePx}/${s.lineHeightPx ?? 'normal'}`,
            String(s.fontWeight),
            trackingName(t, s.letterSpacingEm),
            s.textTransform,
            s.usedFor.slice(0, 4).join(', '),
          ]),
        ),
        '',
      );
    }
    const sizes = t.sizes.filter(keep);
    if (sizes.length) {
      out.push('### Scale', '');
      out.push(
        ...table(
          ['Token', 'Size', 'Line height', 'Weight', 'Used for'],
          sizes.map((s) => [
            `${s.name}${verify(s)}`,
            pxString(s.sizePx),
            s.lineHeightPx === null ? 'normal' : pxString(s.lineHeightPx),
            String(s.fontWeight),
            s.headings.length ? s.headings.join(', ') : s.name === 'base' ? 'body' : '',
          ]),
        ),
        '',
      );
    }
    if (t.letterSpacings.length) {
      out.push(
        `Letter spacing: ${t.letterSpacings.map((l) => `${l.name} ${emString(l.em)}`).join(', ')}`,
        '',
      );
    }
  }

  // ---- Spacing and layout ----
  const spacing = t.spacing.filter(keep);
  if (spacing.length) {
    out.push('## Spacing', '');
    const values = spacing.map((s) => `${s.name} ${pxString(s.px)}`).join(', ');
    out.push(
      d.spacing.baseUnitPx
        ? `Base unit ${d.spacing.baseUnitPx}px: ${values}`
        : `No base unit. Values: ${values}`,
      '',
    );
  }
  if (t.containers.length || t.gridColumns.length || t.gaps.length) {
    out.push('## Layout', '');
    if (t.containers.length)
      out.push(
        `- Containers: ${t.containers.map((c) => `${c.name} ${pxString(c.px)}`).join(', ')}`,
      );
    if (t.gridColumns.length)
      out.push(
        `- Grid columns: ${t.gridColumns.map((g) => `${g.value} (${percent(g.usageShare)})`).join(', ')}`,
      );
    if (t.gaps.length)
      out.push(`- Gaps: ${t.gaps.map((g) => `${g.name} ${pxString(g.px)}`).join(', ')}`);
    out.push('');
  }
  if (t.radii.length)
    out.push('## Radius', '', t.radii.map((r) => `${r.name} ${pxString(r.px)}`).join(', '), '');
  if (t.borderWidths.length) {
    out.push(
      '## Borders',
      '',
      `${t.borderWidths.map((b) => `${b.name} ${pxString(b.px)}`).join(', ')}${d.meta.borderStyle ? ` · usually ${d.meta.borderStyle}` : ''}`,
      '',
    );
  }
  if (t.shadows.length) {
    out.push(
      '## Shadows',
      '',
      ...table(
        ['Token', 'Value'],
        t.shadows.map((s) => [`${s.name}${verify(s)}`, s.value]),
      ),
      '',
    );
  }
  if (t.opacities.length)
    out.push('## Opacity', '', t.opacities.map((o) => `${o.name} ${o.value}`).join(', '), '');
  if (t.zIndex.length)
    out.push('## Z-index', '', t.zIndex.map((z) => `${z.name} ${z.value}`).join(', '), '');
  if (t.durations.length || t.easings.length) {
    out.push('## Motion', '');
    const parts = [];
    if (t.durations.length) parts.push(t.durations.map((x) => x.name).join(', '));
    if (t.easings.length)
      parts.push(
        t.easings.map((e) => (e.name === e.css ? e.name : `${e.name} ${e.css}`)).join(', '),
      );
    if (d.motion.properties?.length)
      parts.push(`usually animates ${d.motion.properties.join(', ')}`);
    out.push(parts.join(' · '), '');
    out.push(
      d.motion.reducedMotion
        ? 'The site honors `prefers-reduced-motion`.'
        : 'No `prefers-reduced-motion` rules were found; add them for new animations.',
      '',
    );
  }
  const unreadable = d.meta.stylesheets?.readable === 0;
  if (t.breakpoints.length || unreadable) {
    out.push('## Breakpoints', '');
    out.push(
      t.breakpoints.length
        ? t.breakpoints.map((b) => `${b.name} ${pxString(b.px)}`).join(', ')
        : 'Not readable on this site.',
      '',
    );
  }
  if (d.responsive) {
    out.push('## Responsive', '');
    const w = d.responsive.widths;
    out.push(
      ...table(
        ['Text', ...w.map((x) => `${x}px`)],
        d.responsive.textSizes.map((r) => [
          r.label,
          ...w.map((x) => (r.byWidth[x] ? `${r.byWidth[x]}px` : '-')),
        ]),
      ),
      '',
    );
    out.push(
      ...table(
        ['Layout', ...w.map((x) => `${x}px`)],
        [
          [
            'container',
            ...w.map((x) => (d.responsive.containers[x] ? `${d.responsive.containers[x]}px` : '-')),
          ],
          ['grid columns', ...w.map((x) => d.responsive.gridColumns[x] ?? '-')],
          [
            'spacing base',
            ...w.map((x) =>
              d.responsive.spacingBase[x] ? `${d.responsive.spacingBase[x]}px` : '-',
            ),
          ],
        ],
      ),
      '',
    );
    out.push(
      'Build mobile first: start from the smallest width and add the larger values at the breakpoints.',
      '',
    );
  }

  // ---- Components ----
  const recipes = (d.components ?? []).filter((r) => !r.excluded);
  const ring = describeFocusRing(d);
  if (recipes.length || d.focusRing) {
    out.push('## Components', '');
    out.push('### Focus ring', '');
    out.push(
      ring
        ? `${ring} (${d.focusRing.source === 'forced' ? 'from forced states' : 'from stylesheet rules'})`
        : 'No focus style was found; the site relies on the browser default. Add a visible ring on `:focus-visible`.',
      '',
    );
    for (const recipe of recipes) {
      out.push(`### ${recipeTitle(recipe)}${verify(recipe)}`, '');
      const stateRows = [];
      for (const mode of modes) {
        const states = recipe.byMode[mode];
        if (!states) continue;
        const suffix =
          modes.length > 1 && Object.keys(recipe.byMode).length > 1 ? ` (${mode})` : '';
        for (const [state, styles] of Object.entries(states)) {
          const text = describeStyles(d, styles, mode);
          if (text) stateRows.push([`${state}${suffix}`, text]);
        }
      }
      if (stateRows.length === 1) out.push(stateRows[0][1], '');
      else out.push(...table(['State', 'Changes'], stateRows), '');
      for (const shot of (ctx.screenshots ?? []).filter((s) => s.recipeId === recipe.id)) {
        out.push(
          `![${recipeTitle(recipe)}${shot.mode === 'dark' ? ' (dark)' : ''}](${screenshotPath(recipe, shot.mode)})`,
          '',
        );
      }
    }
  }

  // ---- Accessibility ----
  const contrast = (d.contrast ?? []).filter(
    (c) => tokenVisible(d, c.textTokenId) && tokenVisible(d, c.backgroundTokenId),
  );
  if (contrast.length || (d.nonTextContrast ?? []).length) {
    out.push('## Accessibility', '');
    const name = (id) => findToken(d, id)?.token.name ?? id;
    const label = (c) =>
      `${name(c.textTokenId)} on ${name(c.backgroundTokenId)}${modes.length > 1 ? ` (${c.mode})` : ''}`;
    const safe = contrast.filter((c) => c.level !== 'fail').slice(0, 8);
    const avoid = contrast.filter((c) => c.level === 'fail').slice(0, 8);
    if (safe.length)
      out.push(
        `Safe text pairs: ${safe.map((c) => `${label(c)} (${c.ratio}:1, ${c.level})`).join(' · ')}`,
      );
    if (avoid.length)
      out.push(`Avoid: ${avoid.map((c) => `${label(c)} (${c.ratio}:1, fails)`).join(' · ')}`);
    for (const n of d.nonTextContrast ?? []) {
      out.push(
        `${n.check === 'focus-ring' ? 'Focus ring vs background' : 'Input border vs input'}: ${n.ratio}:1, ${n.pass ? 'passes' : 'fails'} 3:1`,
      );
    }
    out.push('');
  }

  // ---- Values not in your system (F38) ----
  if (ctx.mapping) {
    const missing = (ctx.mapping.entries ?? []).filter(
      (e) => e.status === 'none' && tokenVisible(d, e.tokenId),
    );
    if (missing.length) {
      out.push('## Values not in your system', '');
      out.push(
        ...missing.slice(0, 40).map((e) => `- ${findToken(d, e.tokenId)?.token.name ?? e.tokenId}`),
        '',
      );
    }
  }

  // ---- Notes ----
  out.push('## Notes', '');
  for (const note of notes(d, modes)) out.push(`- ${note}`);
  const low = lowConfidence(d);
  if (low.length) out.push(`- Check these first (low confidence): ${low.slice(0, 12).join(', ')}`);
  if (dropLow) omitted += low.length;
  if (omitted > 0)
    out.push(
      `- ${omitted} low-usage or low-confidence tokens were left out to keep this file under ${MAX_LINES} lines.`,
    );
  return finish(out);
}

const tokenVisible = (d, id) => {
  const found = findToken(d, id);
  return found && !found.token.excluded;
};

function verifyRole(d, role, mode) {
  return d.roleConfidence?.[role]?.[mode]?.level === 'low' ? ' (verify)' : '';
}

function providerText(f) {
  const names = {
    'google-fonts': 'Google Fonts',
    'adobe-fonts': 'Adobe Fonts',
    'self-hosted': 'self-hosted',
  };
  if (names[f.provider]) return ` from ${names[f.provider]}`;
  if (f.provider === 'other' && f.providerHost) return ` from ${f.providerHost}`;
  return '';
}

function familyName(d, familyId) {
  return d.typography.families.find((f) => f.id === familyId)?.name ?? '';
}

function trackingName(t, em) {
  const token = t.letterSpacings.find((l) => Math.abs(l.em - em) < 0.0005);
  if (token) return token.name.replace(/^tracking-/, '');
  return em === 0 ? 'normal' : emString(em);
}

function gradientText(d, g) {
  const stops = g.stops.map((s) => {
    const token = s.colorTokenId
      ? d.colors.find((c) => c.id === s.colorTokenId && !c.excluded)
      : null;
    return `${token ? token.name : s.hex}${s.position ? ` ${s.position}` : ''}`;
  });
  return `${g.repeating ? 'repeating-' : ''}${g.type}-gradient(${[g.direction, ...stops].filter(Boolean).join(', ')})`;
}

function lowConfidence(d) {
  const ids = new Set(d.audit?.lowConfidence ?? []);
  const names = [];
  for (const id of ids) {
    const found = findToken(d, id);
    if (found && !found.token.excluded) names.push(found.token.name);
  }
  for (const [role, byMode] of Object.entries(d.roleConfidence ?? {})) {
    for (const [mode, c] of Object.entries(byMode)) {
      if (c.level === 'low' && roleToken(d, role, mode)) names.push(`${role} (${mode})`);
    }
  }
  return names;
}

/** The Notes list, shared with the style guide. */
export function notes(d, modes = modesOf(d)) {
  const list = [];
  const sheets = d.meta.stylesheets ?? { readable: 0, unreadable: 0 };
  const total = sheets.readable + sheets.unreadable;
  if (d.meta.capture?.deepScan) list.push('Breakpoints and variables were read through deep scan.');
  else if (sheets.readable === 0)
    list.push(
      'Breakpoints and CSS variables are partial: no stylesheet on this page could be read.',
    );
  else if (sheets.unreadable > 0)
    list.push(
      `Breakpoints are partial: ${sheets.unreadable} of ${total} stylesheets could not be read.`,
    );
  if (d.meta.partial?.includes('states'))
    list.push('Hover and focus states come from readable stylesheet rules only (approximate).');
  if (d.meta.partial?.includes('dark'))
    list.push(
      'The other theme came from stylesheet overrides; component colors in it are not known (verify).',
    );
  if (d.meta.partial?.includes('frames'))
    list.push(`Some frames could not be read (${d.meta.coverage?.frames?.skipped ?? 0} skipped).`);
  if (d.meta.truncated)
    list.push(
      'The page was large, so extraction stopped at the element limit. Rare values may be missing.',
    );
  if (!modes.some((m) => roleToken(d, 'primary', m))) list.push('No primary color detected.');
  if (d.focusRing?.source === 'browser-default')
    list.push('No focus style was found on buttons, links or inputs.');
  if (modes.length === 1) {
    list.push(
      `Extracted from ${(d.meta.pages?.length ?? 1) > 1 ? `${d.meta.pages.length} pages` : 'one page'} in its ${modes[0]} theme.${d.components.some((r) => r.stateSource !== 'none') ? '' : ' Hover and focus states are not included.'}`,
    );
  }
  return list;
}
