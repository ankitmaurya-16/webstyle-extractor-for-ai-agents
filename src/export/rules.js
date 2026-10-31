// The agent rules shared by DESIGN.md, AGENTS.md, the Cursor rules and prompt.md, so they are
// always identical (AC-F32.4). A rule is omitted when its data is missing (v2 spec 9.5).

import { describeFocusRing } from './describe.js';
import { modesOf, primaryModeOf, roleToken } from '../model/design.js';

const listWords = (words) =>
  words.length <= 1
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

/** Framework detections worth naming: medium or high confidence (AC-F11.5). */
export const confidentFrameworks = (design) =>
  (design.meta.framework ?? []).filter((d) => d.confidence.level !== 'low');
export const confidentIcons = (design) =>
  (design.meta.icons ?? []).filter((d) => d.confidence.level !== 'low');

export function frameworkLabel(d) {
  if (d.id === 'tailwind' && d.version) return `${d.name} ${d.version}`;
  if (d.id === 'bootstrap' && d.version) return `${d.name} ${d.version.replace('v', '')}`;
  return d.name;
}

export const loadedFonts = (design) => (design.meta.webFonts ?? []).filter((f) => f.loaded);

export function mechanismText(design) {
  const { themeMechanism: m, themeSelector: sel } = design.meta;
  if (m === 'class') return `the \`${sel}\` class on \`<html>\``;
  if (m === 'attribute') return `the \`${sel}\` attribute on \`<html>\``;
  if (m === 'media') return 'the `prefers-color-scheme` media query';
  return null;
}

/**
 * @param {object} design
 * @param {{mapping?: object|null}} [ctx]
 * @returns {string[]} rules without numbers
 */
export function agentRules(design, ctx = {}) {
  const rules = [
    'Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.',
  ];
  const mode = primaryModeOf(design);
  const has = (role) => modesOf(design).some((m) => roleToken(design, role, m));
  const preferred = ['background', 'text', 'primary', 'border'].filter(has);
  if (preferred.length)
    rules.push(
      `In components, prefer semantic tokens (${preferred.join(', ')}) over scale tokens.`,
    );
  if (design.spacing.baseUnitPx && design.spacing.tokens.some((t) => !t.excluded)) {
    rules.push(
      `Spacing uses a ${design.spacing.baseUnitPx}px base unit. Use the spacing scale, never arbitrary values.`,
    );
  }
  if (roleToken(design, 'text', mode)) {
    let rule = 'Body text is `text`';
    if (has('background')) rule += ' on `background`';
    if (has('text-muted')) rule += '; secondary text is `text-muted`';
    rule += '.';
    if ((design.contrast ?? []).some((c) => c.level !== 'fail'))
      rule += ' Use only the safe text pairs in Accessibility.';
    rules.push(rule);
  }
  const recipes = (design.components ?? []).filter((r) => !r.excluded);
  if (recipes.length) {
    const withStates = recipes.some((r) =>
      Object.values(r.byMode).some((s) => Object.keys(s).length > 1),
    );
    rules.push(
      `Match the component recipes below${withStates ? ', including their hover, focus and active states' : ''}.`,
    );
  }
  const ring = describeFocusRing(design);
  if (ring)
    rules.push(`Every interactive element shows the focus ring on \`:focus-visible\`: ${ring}.`);
  if (modesOf(design).length > 1) {
    const how = mechanismText(design);
    rules.push(
      `Support light and dark themes with the paired semantic tokens.${how ? ` The site switches themes with ${how}.` : ''}`,
    );
  }
  const stack = [];
  const frameworks = confidentFrameworks(design);
  if (frameworks.length) stack.push(`Use ${listWords(frameworks.map(frameworkLabel))}`);
  const icons = confidentIcons(design)[0];
  if (icons) {
    const size = design.meta.iconSizePx ? ` at ${design.meta.iconSizePx}px` : '';
    stack.push(`${stack.length ? 'and' : 'Use'} the ${icons.name} icons${size}`);
  }
  let stackRule = stack.length ? `${stack.join(' ')}.` : '';
  const fonts = loadedFonts(design);
  if (fonts.length)
    stackRule += `${stackRule ? ' ' : ''}Load ${listWords(fonts.map((f) => f.family))} rather than substituting.`;
  if (stackRule) rules.push(stackRule);
  if ((design.motion?.durations ?? []).some((d) => !d.excluded)) {
    rules.push('Animate with the motion tokens below and honor `prefers-reduced-motion`.');
  }
  rules.push(
    'If a needed value is missing, use the nearest existing token and leave a TODO comment.',
  );
  if (ctx.mapping) {
    rules.push(
      `Prefer the existing tokens from ${ctx.mapping.sourceName}. Values under "Values not in your system" need a decision.`,
    );
  }
  return rules;
}
