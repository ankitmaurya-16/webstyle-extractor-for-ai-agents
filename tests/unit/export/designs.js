// Designs for the exporter tests. None of the captured fixtures has two themes, motion,
// gradients or layout layers, so `richRaw` adds them to the classic capture as stylesheet data a
// page could hold. Every value below is then "found on the page" for the analysis.

import { analyze } from '../../../src/analyze/index.js';
import { buildOverrideRaw } from '../../../src/analyze/themes.js';
import { FIXTURE_NAMES, analyzeFixture, captureOf, loadRaw } from '../helpers.js';

export const VERSION = '2.0.0';

/** The five captured fixtures as DesignSystems, analyzed once. */
export const fixtureDesigns = () =>
  Object.fromEntries(FIXTURE_NAMES.map((name) => [name, analyzeFixture(name)]));

/**
 * The classic capture with a dark theme in its stylesheets and every v2 token category.
 * @param {{mechanism?: 'class'|'attribute'|'media'}} [options]
 */
export function richRaw({ mechanism = 'class' } = {}) {
  const raw = loadRaw('classic');
  const scope = mechanism === 'media' ? 'dark-media' : 'dark-selector';
  const selector =
    mechanism === 'class' ? '.dark' : mechanism === 'attribute' ? '[data-theme="dark"]' : ':root';
  raw.variableDefs = [
    ...raw.variableDefs,
    { name: '--brand', scope, selector, value: '#60a5fa' },
    { name: '--ink', scope, selector, value: '#f9fafb' },
  ];
  raw.themeSignals = {
    ...raw.themeSignals,
    darkMedia: mechanism === 'media',
    darkSelectors: mechanism === 'media' ? [] : [selector],
  };
  raw.themeRootRules = [
    { scope, selector: `${selector} body`, property: 'background-color', value: '#0b0f19' },
  ];
  raw.durations = [
    { value: '150', count: 12, weight: 12, contexts: [] },
    { value: '300', count: 4, weight: 4, contexts: [] },
  ];
  raw.easings = [{ value: 'cubic-bezier(0, 0, 0.2, 1)', count: 16, weight: 16, contexts: [] }];
  raw.transitionProperties = [{ value: 'background-color', count: 10, weight: 10, contexts: [] }];
  raw.reducedMotion = true;
  raw.gradients = [
    { css: 'linear-gradient(135deg, rgb(37, 99, 235), rgb(96, 165, 250))', usage: 100, count: 2 },
  ];
  raw.zIndices = [{ value: 50, count: 3, hints: ['dialog'] }];
  raw.opacities = [{ value: '0.5', count: 4, weight: 4, contexts: ['disabled'] }];
  raw.gridColumns = [{ value: '3', count: 2, weight: 2, contexts: [] }];
  raw.gaps = [{ value: '20px', count: 6, weight: 6, contexts: [] }];
  raw.fontFaces = [
    {
      family: 'Helvetica Neue',
      weights: [400, 600],
      styles: ['normal'],
      provider: 'self-hosted',
      providerHost: null,
      loaded: true,
    },
  ];
  raw.stateSamples = [
    {
      kind: 'button',
      variant: 'button:7aa340e1',
      state: 'hover',
      styles: { 'background-color': 'rgb(17, 24, 39)' },
      source: 'stylesheet',
    },
    {
      kind: 'button',
      variant: 'button:7aa340e1',
      state: 'focus-visible',
      styles: { outline: '2px solid rgb(37, 99, 235)', 'outline-offset': '2px' },
      source: 'forced',
    },
  ];
  return raw;
}

/** Analyzes a raw snapshot with its stylesheet-override theme, without site names. */
export function analyzePaired(raw) {
  const base = captureOf(raw);
  const override = buildOverrideRaw(raw);
  const captures = [base];
  if (override) {
    captures.push(
      captureOf(override, { mode: 'dark', method: 'stylesheet-override', kind: 'theme' }),
    );
  }
  // Site names are off: the analysis gives both theme values of one variable its name.
  return analyze(captures, { useSiteVariableNames: false });
}

export const richDesign = (options) => analyzePaired(richRaw(options));

/** Line count of a file without its trailing newline. */
export const lineCount = (text) => text.replace(/\n$/, '').split('\n').length;
