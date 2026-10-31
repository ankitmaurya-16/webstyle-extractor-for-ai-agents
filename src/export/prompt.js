// prompt.md (F33): a version of DESIGN.md for chat-based builders, 40 lines or fewer.

import { modesOf, primaryModeOf, roleToken, visible } from '../model/design.js';
import { finish, prepare } from './common.js';
import { describeFocusRing, describeStyles } from './describe.js';
import { confidentFrameworks, confidentIcons, frameworkLabel, loadedFonts } from './rules.js';

export const MAX_PROMPT_LINES = 40;

/** Low-confidence tokens without a role are left out (AC-F33.3). */
function keepToken(d, t) {
  if (t.confidence?.level !== 'low') return true;
  return Object.values(d.semantic ?? {}).some((ref) => Object.values(ref).includes(t.id));
}

/** "md 8", or just "full" for a pill radius named full. */
const radiusText = (name, px) =>
  px >= 9999 ? (name === 'full' ? 'full' : `${name} full`) : `${name} ${px}`;

export function exportPrompt(design, version, ctx = {}) {
  const d = prepare(design, ctx);
  const modes = modesOf(d);
  const primary = primaryModeOf(d);
  const out = [];
  const themes = modes.length > 1 ? 'light and dark' : modes[0];
  out.push(`Design system for ${d.meta.hostname} (${themes}). Follow it exactly.`);
  const rules = ['only these tokens', 'semantic colors first'];
  if (d.spacing.baseUnitPx) rules.push(`${d.spacing.baseUnitPx}px spacing scale`);
  if (describeFocusRing(d)) rules.push('focus ring on :focus-visible');
  if (modes.length > 1) rules.push('support dark mode');
  if (d.motion?.durations?.length) rules.push('honor reduced motion');
  out.push(`Rules: ${rules.join('; ')}.`);
  const stack = [];
  const fw = confidentFrameworks(d);
  if (fw.length) stack.push(fw.map(frameworkLabel).join(' + '));
  const icons = confidentIcons(d)[0];
  if (icons) stack.push(`${icons.name} icons${d.meta.iconSizePx ? ` ${d.meta.iconSizePx}px` : ''}`);
  const fonts = loadedFonts(d);
  if (fonts.length) stack.push(fonts.map((f) => f.family).join(', '));
  if (stack.length) out.push(`Stack: ${stack.join(' · ')}`);

  const colorParts = [];
  for (const [role, label] of [
    ['background', 'background'],
    ['text', 'text'],
    ['text-muted', 'muted'],
    ['primary', 'primary'],
    ['accent', 'accent'],
    ['border', 'border'],
    ['focus-ring', 'ring'],
    ['danger', 'danger'],
  ]) {
    const values = modes.map((m) => roleToken(d, role, m)?.hex);
    if (values.every((v) => !v)) continue;
    colorParts.push(`${label} ${values.map((v) => v ?? '-').join(' / ')}`);
  }
  if (colorParts.length) {
    const label = modes.length > 1 ? 'Colors (light / dark): ' : 'Colors: ';
    // Wrap at 4 per line to stay readable.
    for (let i = 0; i < colorParts.length; i += 4)
      out.push(`${i === 0 ? label : '  '}${colorParts.slice(i, i + 4).join(' · ')}`);
  }
  const sizes = visible(d.typography.sizes)
    .filter((s) => keepToken(d, s))
    .sort((a, b) => a.sizePx - b.sizePx);
  if (sizes.length) {
    const family = visible(d.typography.families).filter((f) => keepToken(d, f))[0];
    out.push(
      `Type: ${sizes.map((s) => `${s.name} ${s.sizePx}${s.name === 'base' && s.lineHeightPx ? `/${s.lineHeightPx}` : ''}`).join(' · ')}${family ? ` (${family.name})` : ''}`,
    );
  }
  const styles = visible(d.typography.textStyles ?? [])
    .filter((s) => keepToken(d, s))
    .slice(0, 3);
  if (styles.length) {
    out.push(
      `Text styles: ${styles
        .map(
          (s) =>
            `${s.name} ${s.sizePx}/${s.lineHeightPx ?? 'normal'} ${s.fontWeight}${s.letterSpacingEm ? ` ${s.letterSpacingEm}em` : ''}${s.textTransform !== 'none' ? ` ${s.textTransform}` : ''}`,
        )
        .join(' · ')}`,
    );
  }
  const layout = [];
  const spacing = visible(d.spacing.tokens).filter((s) => keepToken(d, s));
  if (spacing.length)
    layout.push(
      `Spacing: ${d.spacing.baseUnitPx ? `${d.spacing.baseUnitPx}px base ` : ''}(${spacing.map((s) => s.px).join(', ')})`,
    );
  const radii = visible(d.radii).filter((r) => keepToken(d, r));
  if (radii.length)
    layout.push(
      `Radius: ${radii.map((r) => radiusText(r.name.replace(/^radius-/, ''), r.px)).join(', ')}`,
    );
  const shadow = visible(d.shadows).filter((s) => keepToken(d, s))[0];
  if (shadow) layout.push(`Shadow: ${shadow.name.replace(/^shadow-/, '')} ${shadow.value}`);
  if (layout.length) out.push(layout.join(' · '));
  const button = d.components.find((r) => !r.excluded && r.kind === 'button');
  if (button) {
    const states = button.byMode[primary] ?? {};
    const parts = [describeStyles(d, states.default, primary)];
    for (const state of ['hover', 'focus-visible', 'active']) {
      const text = states[state] && describeStyles(d, states[state], primary);
      if (text) parts.push(`${state} ${text}`);
    }
    out.push(`Button: ${parts.filter(Boolean).join(' · ')}`);
  }
  const ring = describeFocusRing(d);
  const motion = visible(d.motion?.durations ?? []).filter((x) => keepToken(d, x))[0];
  const easing = visible(d.motion?.easings ?? []).filter((x) => keepToken(d, x))[0];
  const tail = [];
  if (ring) tail.push(`Focus ring: ${ring}`);
  if (motion) tail.push(`Motion: ${motion.ms}ms${easing ? ` ${easing.name}` : ''}`);
  if (tail.length) out.push(tail.join(' · '));
  return finish(out.slice(0, MAX_PROMPT_LINES));
}
