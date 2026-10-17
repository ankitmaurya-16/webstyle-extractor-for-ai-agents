// Selector specificity, used to resolve conflicting state rules (AC-F12.2). Pure; no DOM.

/**
 * Splits a selector list on top-level commas.
 * @param {string} list
 */
export function splitSelectorList(list) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Specificity of one complex selector as [ids, classes, types]. :is(), :not() and :has() take
 * their most specific argument; :where() counts zero.
 * @param {string} selector
 * @returns {[number, number, number]}
 */
export function specificity(selector) {
  let a = 0;
  let b = 0;
  let c = 0;
  let s = selector;
  // Functional pseudo-classes with selector arguments.
  s = s.replace(/:(is|not|has|matches|where)\(((?:[^()]|\([^()]*\))*)\)/gi, (_, fn, inner) => {
    if (fn.toLowerCase() === 'where') return ' ';
    const best = splitSelectorList(inner)
      .map(specificity)
      .sort(compareSpecificity)
      .at(-1) ?? [0, 0, 0];
    a += best[0];
    b += best[1];
    c += best[2];
    return ' ';
  });
  s = s.replace(/"[^"]*"|'[^']*'/g, '');
  a += (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+/g) ?? []).length;
  b += (s.match(/\[[^\]]*\]/g) ?? []).length;
  // Pseudo-elements count as types; other pseudo-classes as classes.
  const pseudoElements = (s.match(/::[\w-]+|:(before|after|first-line|first-letter)\b/gi) ?? []).length;
  c += pseudoElements;
  b += (s.replace(/::[\w-]+/g, '').match(/:[\w-]+(\([^)]*\))?/g) ?? []).filter(
    (p) => !/^:(before|after|first-line|first-letter)$/i.test(p),
  ).length;
  const types = s
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/::?[\w-]+(\([^)]*\))?/g, ' ')
    .replace(/[#.][\w-]+/g, ' ')
    .split(/[\s>+~]+/)
    .filter((t) => /^[a-z][\w-]*$/i.test(t) && t !== '*');
  c += types.length;
  return [a, b, c];
}

/** Sort comparator: lower specificity first. */
export function compareSpecificity(x, y) {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const STATE_PSEUDO = /:(hover|focus-visible|focus-within|focus|active)\b/g;

/**
 * Removes the interaction-state pseudo-classes from a selector so it can be matched against an
 * element in its default state (AC-F12.1). Returns the states it found.
 * @param {string} selector
 * @returns {{base: string, states: string[]}}
 */
export function stripStates(selector) {
  const states = [];
  const base = selector.replace(STATE_PSEUDO, (_, state) => {
    if (state !== 'focus-within') states.push(state);
    return '';
  });
  return { base: base.trim() || '*', states };
}
