// "Where is this used?" (F30): the match a token's highlight looks for on the page. Pure.

import { findToken } from './design.js';

const px = (n) => `${n}px`;

/**
 * @param {object} design DesignSystemV2
 * @param {string} tokenId
 * @returns {{property: string, values: string[], anyColor?: boolean} | null}
 */
export function highlightMatch(design, tokenId) {
  const recipe = (design.components ?? []).find((r) => r.id === tokenId);
  if (recipe) {
    return recipe.representativeSelector
      ? { property: 'selector', values: [recipe.representativeSelector] }
      : null;
  }
  const found = findToken(design, tokenId);
  if (!found) return null;
  const { category, token } = found;
  switch (category) {
    case 'color': {
      const hexes = [token.hex, ...(token.mergedFrom ?? [])].map((h) => h.toLowerCase());
      return { property: 'color', values: [...new Set(hexes)], anyColor: true };
    }
    case 'font':
      return { property: 'font-family', values: [String(token.stack?.[0] ?? '').toLowerCase()] };
    case 'text':
      return { property: 'font-size', values: [px(token.sizePx)] };
    case 'tracking':
      return { property: 'letter-spacing', values: [px(Math.round(token.em * 16 * 100) / 100)] };
    case 'space':
      return { property: 'padding', values: [px(token.px)] };
    case 'gap':
      return { property: 'gap', values: [px(token.px)] };
    case 'radius':
      return { property: 'border-radius', values: [px(token.px)] };
    case 'border':
      return { property: 'border-width', values: [px(token.px)] };
    case 'shadow':
      return { property: 'box-shadow', values: [token.value] };
    case 'opacity':
      return { property: 'opacity', values: [String(token.value)] };
    case 'z':
      return { property: 'z-index', values: [String(token.value)] };
    case 'duration':
      return { property: 'transition-duration', values: [`${token.ms / 1000}s`] };
    case 'gradient':
      return { property: 'background-image', values: [token.css] };
    default:
      return null;
  }
}
