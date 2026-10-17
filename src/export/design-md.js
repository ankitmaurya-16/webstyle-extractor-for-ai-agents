// DESIGN.md: the file an AI coding agent reads. Format in docs/api.md.

import { formatFontStack } from '../analyze/units.js';
import { resolveValue } from '../model/design.js';
import { captureDate, collectTokens, finish, pxString } from './common.js';

const HEADING_LABEL = {
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
};

/** Renders rows as a Markdown table with columns padded to equal width. */
export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => `| ${cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ')} |`;
  return [line(headers), `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`, ...rows.map(line)];
}

export const percent = (share) =>
  share > 0 && share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`;

export function exportDesignMd(design, version) {
  const t = collectTokens(design);
  const roles = new Set(t.semantic.map(([role]) => role));
  const out = [];

  out.push(`# Design system: ${design.meta.hostname}`, '');
  out.push(
    `Extracted ${captureDate(design)} from ${design.meta.sourceUrl} · ${design.meta.colorScheme} theme · WebStyle Extractor v${version}`,
    '',
  );

  out.push('## Rules for the agent', '');
  const rules = [
    'Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.',
  ];
  const preferred = ['text', 'primary', 'border'].filter((r) => roles.has(r));
  const examples = preferred.length ? preferred : t.semantic.slice(0, 3).map(([r]) => r);
  if (examples.length) {
    rules.push(
      `In components, prefer semantic color tokens (${examples.join(', ')}) over scale tokens.`,
    );
  }
  if (design.spacing.baseUnitPx && t.spacing.length) {
    rules.push(
      `Spacing uses a ${design.spacing.baseUnitPx}px base unit. Use the spacing scale, never arbitrary values.`,
    );
  }
  if (roles.has('text')) {
    let rule = 'Body text is `text`';
    if (roles.has('background')) rule += ' on `background`';
    rule += '.';
    if (roles.has('text-muted')) rule += ' Secondary text is `text-muted`.';
    rules.push(rule);
  }
  const recipes = design.components.filter((r) => !r.excluded);
  const kinds = ['button', 'input', 'link'].filter((k) => recipes.some((r) => r.kind === k));
  if (kinds.length)
    rules.push(`Match the component recipes below for ${listWords(kinds.map((k) => `${k}s`))}.`);
  rules.push(
    'If a needed value is missing, use the nearest existing token and leave a TODO comment.',
  );
  rules.forEach((rule, i) => out.push(`${i + 1}. ${rule}`));
  out.push('');

  if (t.colors.length) {
    out.push('## Colors', '');
    if (t.semantic.length) {
      out.push('### Semantic', '');
      out.push(
        ...table(
          ['Role', 'Token', 'Hex'],
          t.semantic.map(([role, c]) => [role, c.name, c.hex]),
        ),
        '',
      );
    }
    out.push('### Scales', '');
    out.push(
      ...table(
        ['Token', 'Hex', 'Usage'],
        t.colors.map((c) => [c.name, c.hex, percent(c.usageShare)]),
      ),
      '',
    );
  }

  if (t.families.length || t.sizes.length) {
    out.push('## Typography', '');
    if (t.families.length) {
      out.push(
        ...table(
          ['Family', 'Stack'],
          t.families.map((f) => [f.name, formatFontStack(f.stack)]),
        ),
        '',
      );
    }
    if (t.sizes.length) {
      const rows = t.sizes.map((s) => [
        s.name,
        pxString(s.sizePx),
        s.lineHeightPx === null ? 'normal' : pxString(s.lineHeightPx),
        String(s.weight),
        s.headings.length ? s.headings.join(', ') : s.name === 'base' ? 'body' : '',
      ]);
      out.push(...table(['Token', 'Size', 'Line height', 'Weight', 'Used for'], rows), '');
    }
  }

  if (t.spacing.length) {
    out.push('## Spacing', '');
    const values = t.spacing.map((s) => `${s.name} ${pxString(s.px)}`).join(', ');
    out.push(
      design.spacing.baseUnitPx
        ? `Base unit ${design.spacing.baseUnitPx}px: ${values}`
        : `No base unit. Values: ${values}`,
      '',
    );
  }

  if (t.radii.length) {
    out.push('## Radius', '', t.radii.map((r) => `${r.name} ${pxString(r.px)}`).join(', '), '');
  }

  if (t.shadows.length) {
    out.push(
      '## Shadows',
      '',
      ...table(
        ['Token', 'Value'],
        t.shadows.map((s) => [s.name, s.value]),
      ),
      '',
    );
  }

  const breakpointsUnreadable = design.meta.stylesheets?.readable === 0;
  if (t.breakpoints.length || breakpointsUnreadable) {
    out.push('## Breakpoints', '');
    out.push(
      t.breakpoints.length
        ? t.breakpoints.map((b) => `${b.name} ${pxString(b.px)}`).join(', ')
        : 'Not readable on this site.',
      '',
    );
  }

  if (recipes.length) {
    out.push('## Components', '');
    for (const recipe of recipes) {
      out.push(`### ${recipeTitle(recipe)}`, '', describeRecipe(design, recipe), '');
    }
  }

  out.push('## Notes', '');
  for (const note of notes(design, roles)) out.push(`- ${note}`);
  return finish(out);
}

function listWords(words) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export function recipeTitle(recipe) {
  if (recipe.kind === 'heading') return HEADING_LABEL[recipe.variant] ?? 'Heading';
  const kind = recipe.kind[0].toUpperCase() + recipe.kind.slice(1);
  return recipe.variant === 'default' ? kind : `${kind}, ${recipe.variant}`;
}

const BACKGROUND_ROLES = [
  'primary',
  'accent',
  'surface',
  'background',
  'success',
  'warning',
  'danger',
];
const TEXT_ROLES = ['text', 'text-muted', 'primary', 'accent', 'success', 'warning', 'danger'];

/**
 * Token-first description of a color value: "primary (blue-600)", "gray-900" or "#123456".
 * Only roles that make sense for the property are named, so white button text reads "white"
 * rather than "background (white)".
 * @param {'background'|'text'} use
 */
export function describeColor(design, value, use = 'background') {
  const { token, raw } = resolveValue(design, value);
  if (!token) return raw;
  const fitting = use === 'text' ? TEXT_ROLES : BACKGROUND_ROLES;
  const role = fitting.find((r) => token.roles.includes(r));
  return role && role !== token.name ? `${role} (${token.name})` : token.name;
}

/** Padding as spacing tokens when every side has one, with the px values in brackets. */
export function describePadding(design, padding) {
  const parts = String(padding).split(/\s+/).filter(Boolean);
  if (parts.every((p) => parseFloat(p) === 0)) return '0';
  const names = parts.map((p) => {
    const n = parseFloat(p);
    if (n === 0) return '0';
    const token = design.spacing.tokens.find((s) => !s.excluded && p.endsWith('px') && s.px === n);
    return token ? token.name : null;
  });
  if (names.every((n) => n !== null)) return `${names.join(' ')} (${parts.join(' ')})`;
  return parts.join(' ');
}

export function describeRecipe(design, recipe) {
  const s = recipe.styles;
  const name = (value) => {
    const { token, raw } = resolveValue(design, value);
    return token ? token.name : raw;
  };
  const size = resolveValue(design, s['font-size']).raw;
  const line = s['line-height'] ?? 'normal';
  const parts = [
    `background ${describeColor(design, s['background-color'], 'background')}`,
    `text ${describeColor(design, s.color, 'text')}`,
    `border ${s.border ?? 'none'}`,
    `radius ${name(s['border-radius'])}`,
    `padding ${describePadding(design, s.padding ?? '0')}`,
    `font ${name(s['font-family'])} ${size}/${line} weight ${s['font-weight']}`,
  ];
  const shadow = s['box-shadow'];
  if (shadow && shadow !== 'none') parts.push(`shadow ${name(shadow)}`);
  return parts.join(', ');
}

function notes(design, roles) {
  const list = [];
  const sheets = design.meta.stylesheets ?? { readable: 0, unreadable: 0 };
  const total = sheets.readable + sheets.unreadable;
  if (sheets.readable === 0) {
    list.push(
      'Breakpoints and CSS variables are partial: no stylesheet on this page could be read.',
    );
  } else if (sheets.unreadable > 0) {
    list.push(
      `Breakpoints are partial: ${sheets.unreadable} of ${total} stylesheets could not be read.`,
    );
  }
  if (design.meta.truncated) {
    list.push(
      'The page was large, so extraction stopped at the element limit. Rare values may be missing.',
    );
  }
  if (!roles.has('primary')) list.push('No primary color detected.');
  list.push(
    `Extracted from one page in its ${design.meta.colorScheme} theme. Hover and focus states are not included.`,
  );
  return list;
}
