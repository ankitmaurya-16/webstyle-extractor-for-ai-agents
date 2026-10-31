// `webstyle extract`: loads each URL in Playwright Chromium, runs the shared collector, Advanced
// capture plan, analysis and exporters, and writes the project file map (F41).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../../src/analyze/index.js';
import { toCapture, withOverrideCapture } from '../../src/analyze/assemble.js';
import { runAdvancedPlan } from '../../src/advanced/plan.js';
import { exportFiles } from '../../src/export/index.js';
import { defaultFileMap, mapFiles } from '../../src/project/index.js';
import { exportSnapshots } from '../../src/io/index.js';
import { makeRecord } from '../../src/storage/snapshots.js';
import { sameSite } from '../../src/model/site.js';
import { MIN_ELEMENTS } from '../../src/messaging.js';
import { playwrightCdpClient } from './cdp.js';

export const EXIT = { OK: 0, USAGE: 1, LOAD: 2, EMPTY: 3, INTERNAL: 4 };

export class CliError extends Error {
  constructor(exit, message) {
    super(message);
    this.exit = exit;
  }
}

const here = dirname(fileURLToPath(import.meta.url));

/** The collector IIFE built by tsup next to the CLI bundle, or by the dev build script. */
async function collectorSource() {
  for (const path of [join(here, 'collector.iife.js'), join(here, '../dist/collector.iife.js')]) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // Try the next location.
    }
  }
  throw new CliError(EXIT.INTERNAL, 'The collector bundle is missing. Run `pnpm --filter webstyle-extractor build`.');
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // In the repo the workspace may only have @playwright/test, which ships the same chromium.
  }
  try {
    return await import('@playwright/test');
  } catch {
    throw new CliError(EXIT.USAGE, 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium');
  }
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  } catch (error) {
    if (/Executable doesn't exist|playwright install/i.test(String(error?.message))) {
      throw new CliError(EXIT.USAGE, 'Chromium is not installed. Run: npx playwright install chromium');
    }
    throw new CliError(EXIT.INTERNAL, `Couldn't start Chromium: ${error.message}`);
  }
}

let ids = 0;
const nextId = () => `cli-${(ids += 1).toString(36)}-${Date.now().toString(36)}`;

/** Captures one URL: the base capture, Advanced stages and screenshots. */
async function capturePage(browser, url, options, source, log) {
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    try {
      const response = await page.goto(url, { waitUntil: 'load', timeout: options.timeout });
      if (response && response.status() >= 400) throw new Error(`HTTP ${response.status()}`);
      await page.waitForLoadState('networkidle', { timeout: Math.min(5000, options.timeout) }).catch(() => {});
      if (options.wait) await page.waitForTimeout(options.wait);
    } catch (error) {
      throw new CliError(EXIT.LOAD, `Couldn't load ${url}: ${error.message}`);
    }
    await page.evaluate(source);
    const collect = (opts) => page.evaluate((o) => globalThis.__webstyle.collect(o), opts);
    const base = await collect({ autoScroll: options.scroll });
    if (!base || base.elementsSampled < MIN_ELEMENTS) {
      throw new CliError(EXIT.EMPTY, `Found too little to read on ${url} (${base?.elementsSampled ?? 0} elements)`);
    }

    const screenshots = [];
    const shoot = async (mode) => {
      if (!options.screenshots) return null;
      const png = await page.screenshot({ type: 'png' });
      screenshots.push({ mode, png, dpr: base.devicePixelRatio ?? 1, representatives: base.representatives });
      return null;
    };
    await shoot(base.colorScheme);

    let captures = [toCapture(base, nextId)];
    const warnings = [];
    const advanced = { deepScan: options.deepScan, dark: options.dark, states: options.states, widths: options.widths };
    if (advanced.deepScan || advanced.dark || advanced.states || advanced.widths.length) {
      const cdp = playwrightCdpClient(await context.newCDPSession(page));
      try {
        const result = await runAdvancedPlan({
          cdp,
          baseRaw: base,
          options: advanced,
          collect: (opts) => collect({ ...opts, autoScroll: false }),
          readRecipe: (selector) => page.evaluate((s) => globalThis.__webstyle.readRecipe(s), selector),
          onStage: (stage) => log(`  ${stage}`),
          onThemeCaptured: shoot,
        });
        captures = [
          toCapture(result.base, nextId),
          ...result.extra.map((e) => toCapture(e.raw, nextId, { mode: e.mode, kind: e.kind, method: e.method, viewportWidth: e.viewportWidth })),
        ];
        warnings.push(...result.failed);
      } finally {
        // Mirrors the extension: the CDP session always ends here.
        await cdp.detach();
      }
    }
    return { captures: withOverrideCapture(captures, nextId), warnings, screenshots };
  } finally {
    await context.close();
  }
}

/** Crops screenshots per recipe in Node by re-rendering clips in a blank page (no network). */
async function cropScreenshots(browser, shots, recipes) {
  if (!shots.length) return [];
  const page = await browser.newPage();
  const out = [];
  try {
    for (const shot of shots) {
      const mode = shot.mode === 'dark' ? 'dark' : 'light';
      await page.setContent(`<img id="s" src="data:image/png;base64,${shot.png.toString('base64')}" style="display:block">`);
      await page.waitForFunction(() => document.getElementById('s').complete);
      for (const recipe of recipes) {
        const rep = (shot.representatives ?? []).find((r) => r.variant === recipe.sampleKey && r.inViewport);
        if (!rep || rep.rect.width < 4 || rep.rect.height < 4) continue;
        const dpr = shot.dpr || 1;
        await page.setViewportSize({ width: Math.ceil((rep.rect.x + rep.rect.width) * dpr) + 1, height: Math.ceil((rep.rect.y + rep.rect.height) * dpr) + 1 });
        const bytes = await page.screenshot({ type: 'png', clip: { x: rep.rect.x * dpr, y: rep.rect.y * dpr, width: rep.rect.width * dpr, height: rep.rect.height * dpr } });
        out.push({ recipeId: recipe.id, mode, bytes: new Uint8Array(bytes) });
      }
    }
  } finally {
    await page.close();
  }
  return out;
}

const hostnameOf = (url) => new URL(url).hostname || 'local';

/**
 * Builds snapshots for the URLs. Without --merge each URL becomes its own snapshot.
 * @returns {Promise<Array<{record: object, files: object[]}>>}
 */
export async function runExtract(urls, options, { version, log = () => {}, warn = () => {} } = {}) {
  if (options.merge && !options.allowCrossSite) {
    const first = urls[0];
    const other = urls.find((u) => !sameSite(first, u));
    if (other) throw new CliError(EXIT.USAGE, `${hostnameOf(other)} is not on the same site as ${hostnameOf(first)}. Add --allow-cross-site to merge anyway.`);
  }
  const source = await collectorSource();
  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  try {
    const runs = [];
    for (const url of urls) {
      log(`Reading ${url}`);
      runs.push(await capturePage(browser, url, options, source, log));
    }
    const groups = options.merge ? [runs] : runs.map((r) => [r]);
    const results = [];
    for (const group of groups) {
      const captures = group.flatMap((r) => r.captures);
      const warnings = [...new Set(group.flatMap((r) => r.warnings))];
      for (const w of warnings) warn(`Some details couldn't be captured: ${w}`);
      const advanced = options.deepScan || options.dark || options.states || options.widths.length > 0;
      const extracted = analyze(captures, {
        useSiteVariableNames: options.siteNames,
        advanced,
        deepScan: options.deepScan,
        partial: warnings,
      });
      const record = makeRecord({
        id: nextId(),
        kind: group.length > 1 ? 'site' : 'page',
        captures,
        extracted,
        edited: structuredClone(extracted),
      });
      const recipes = extracted.components;
      const shots = await cropScreenshots(browser, group.flatMap((r) => r.screenshots), recipes);
      const formats = options.formats.filter((f) => f !== 'screenshots');
      const includeScreenshots = options.formats.includes('screenshots') || options.screenshots;
      const files = mapFiles(
        exportFiles(record.edited, version, {
          formats,
          ctx: { shadcnFormat: options.shadcnFormat, screenshots: shots },
          includeScreenshots,
        }),
        defaultFileMap(),
      );
      results.push({ record, files });
    }
    return results;
  } finally {
    await browser.close();
  }
}

/** Writes one snapshot's files and snapshot.webstyle.json into a folder. */
export async function writeOutput(dir, { record, files }) {
  for (const file of [...files, { path: 'snapshot.webstyle.json', text: exportSnapshots([record]) }]) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes ?? file.text);
  }
}
