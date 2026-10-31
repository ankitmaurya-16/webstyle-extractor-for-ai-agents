// Consistency report (F29): counts and lists only, no overall score. Pure.

/**
 * @param {object} input
 * @returns {import('../model/types.js').AuditReport}
 */
export function buildAudit({
  colorsBeforeMerge,
  colors,
  spacing,
  distinct,
  contrast,
  focusRing,
  variableConflicts,
  lowConfidence,
}) {
  const nearDuplicateGroups = colors
    .filter((c) => c.mergedFrom.length > 0)
    .map((c) => ({ kept: c.hex, merged: [...c.mergedFrom] }));
  return {
    colorsBeforeMerge,
    colorsAfterMerge: colors.length,
    nearDuplicateGroups,
    // Without a base unit "off scale" has no meaning, so the list is omitted (AC-F29.3).
    offScaleSpacing: spacing.baseUnitPx ? spacing.offScale : null,
    distinct,
    contrastFailures: contrast.filter((c) => c.level === 'fail').length,
    contrastFailureList: contrast.filter((c) => c.level === 'fail'),
    missingFocusStyle: focusRing?.source === 'browser-default',
    variableConflicts: variableConflicts ?? [],
    lowConfidence,
  };
}
