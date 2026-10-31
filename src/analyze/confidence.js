// Confidence per token, role, recipe and detection (F28). Pure; start values from the spec.

export const HIGH = 0.75;
export const MEDIUM = 0.45;

const clamp = (n) => Math.max(0, Math.min(1, n));
const round = (n) => Math.round(n * 100) / 100;

/** About 100 elements is full evidence. */
export const evidence = (count) => Math.min(1, Math.log10((count ?? 0) + 1) / 2);

export const levelOf = (score) => (score >= HIGH ? 'high' : score >= MEDIUM ? 'medium' : 'low');

function result(score, reasons) {
  const s = round(clamp(score));
  return { level: levelOf(s), score: s, reasons };
}

/**
 * Token score: 0.7 * evidence + 0.3 * consistency + boosts - penalties.
 * @param {{count: number, consistency?: number, siteVariable?: string|null, exactSource?: boolean,
 *   overImage?: boolean, truncated?: boolean, overrideOnly?: boolean, unreadable?: boolean}} input
 */
export function tokenConfidence(input) {
  const reasons = [];
  const e = evidence(input.count);
  const consistency = input.consistency ?? 1;
  reasons.push(`Used on ${input.count ?? 0} element${input.count === 1 ? '' : 's'}`);
  if (consistency < 0.9) reasons.push(`${Math.round(consistency * 100)}% of its cluster`);
  let score = 0.7 * e + 0.3 * consistency;
  if (input.siteVariable) {
    score += 0.3;
    reasons.push(`Named ${input.siteVariable} on the site`);
  }
  if (input.exactSource) {
    score += 0.1;
    reasons.push('From an exact capture');
  }
  if (input.overImage) {
    score -= 0.3;
    reasons.push('Measured over a background image');
  }
  if (input.truncated) {
    score -= 0.1;
    reasons.push('The capture stopped at the element limit');
  }
  if (input.overrideOnly) {
    score -= 0.2;
    reasons.push('From stylesheet overrides only');
  } else if (input.unreadable) {
    score -= 0.1;
    reasons.push('Some stylesheets were unreadable');
  }
  return result(score, reasons);
}

/**
 * Role score: 0.5 * evidence + 0.5 * margin + boosts - penalties, where margin is the
 * winner's weight minus the runner-up's over the winner's.
 */
export function roleConfidence({
  count,
  winnerWeight,
  runnerUpWeight,
  runnerUpName,
  siteVariable,
  overrideOnly,
  truncated,
}) {
  const reasons = [];
  const margin = winnerWeight > 0 ? (winnerWeight - (runnerUpWeight ?? 0)) / winnerWeight : 1;
  let score = 0.5 * evidence(count) + 0.5 * margin;
  reasons.push(`Used on ${count ?? 0} element${count === 1 ? '' : 's'}`);
  if (runnerUpName && margin < 0.3) reasons.push(`Close runner-up: ${runnerUpName}`);
  if (siteVariable) {
    score += 0.3;
    reasons.push(`Named ${siteVariable} on the site`);
  }
  if (overrideOnly) {
    score -= 0.2;
    reasons.push('From stylesheet overrides only');
  }
  if (truncated) {
    score -= 0.1;
    reasons.push('The capture stopped at the element limit');
  }
  return result(score, reasons);
}

/** Recipes: evidence of the sample count, boosted by exact states. */
export function recipeConfidence({ count, stateSource }) {
  const reasons = [`Seen on ${count} element${count === 1 ? '' : 's'}`];
  let score = 0.4 + 0.6 * evidence(count);
  if (stateSource === 'forced') {
    score += 0.1;
    reasons.push('States from forced capture');
  } else if (stateSource === 'stylesheet')
    reasons.push('States from stylesheet rules (approximate)');
  return result(score, reasons);
}

/** Wraps a detection's level into the common shape. */
export function detectionConfidence(detection) {
  return detection.confidence;
}
