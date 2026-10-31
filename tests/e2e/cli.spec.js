import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { unzipSync, strFromU8 } from 'fflate';
import { FIXTURES, expect, openFixture, openPanel, test } from './harness.js';
import { extractFrom } from './v2-helpers.js';
import { DEFAULT_EXPORT_SELECTION } from '../../src/model/types.js';

const run = promisify(execFile);
const CLI = new URL('../../cli/dist/webstyle.js', import.meta.url).pathname;
const env = {
  ...process.env,
  CHROMIUM_PATH: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
};

async function webstyle(args) {
  try {
    const { stdout, stderr } = await run('node', [CLI, ...args], {
      env,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

async function filesIn(dir) {
  const out = {};
  const walk = async (d) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) await walk(path);
      else out[relative(dir, path)] = await readFile(path, 'utf8');
    }
  };
  await walk(dir);
  return out;
}

test('AC-F41.1 AC-F41.2 CLI output matches the extension zip byte for byte', async ({ ext }) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await extractFrom(panel);
  await panel.getByRole('tab', { name: 'Export' }).click();
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download all (.zip)' }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(await readFile(await download.path())));
  const fromExtension = Object.fromEntries(
    Object.entries(zip).map(([path, bytes]) => [path, strFromU8(bytes)]),
  );

  const out = await mkdtemp(join(tmpdir(), 'webstyle-cli-'));
  const result = await webstyle([
    'extract',
    `${FIXTURES}/classic.html`,
    '--out',
    out,
    '--no-dark',
    '--formats',
    DEFAULT_EXPORT_SELECTION.join(','),
  ]);
  expect(result.code).toBe(0);
  const fromCli = await filesIn(out);
  expect(Object.keys(fromCli)).toContain('snapshot.webstyle.json');
  delete fromCli['snapshot.webstyle.json'];
  expect(Object.keys(fromCli).sort()).toEqual(Object.keys(fromExtension).sort());
  for (const path of Object.keys(fromExtension))
    expect(fromCli[path], path).toBe(fromExtension[path]);
});

test('AC-F41.7 exit codes: too little to read is 3, a failed load is 2, a usage error is 1', async () => {
  expect((await webstyle(['extract', `${FIXTURES}/canvas.html`, '--no-dark'])).code).toBe(3);
  expect(
    (await webstyle(['extract', 'http://127.0.0.1:1/nothing.html', '--timeout', '3000'])).code,
  ).toBe(2);
  expect((await webstyle(['extract', 'not-a-url'])).code).toBe(1);
});

test('AC-F41.8 --json prints valid snapshot JSON and writes no files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'webstyle-json-'));
  const { stdout, code } = await run(
    'node',
    [CLI, 'extract', `${FIXTURES}/classic.html`, '--no-dark', '--json'],
    { env, cwd, maxBuffer: 50 * 1024 * 1024 },
  ).then((r) => ({ ...r, code: 0 }));
  expect(code).toBe(0);
  const doc = JSON.parse(stdout);
  expect(doc.format).toBe('webstyle-snapshots');
  expect(doc.snapshots).toHaveLength(1);
  expect(await readdir(cwd)).toEqual([]);
});

test('AC-F41.4 --merge makes one site snapshot and enforces the same-site rule', async () => {
  const out = await mkdtemp(join(tmpdir(), 'webstyle-merge-'));
  const urls = [`${FIXTURES}/classic.html`, `${FIXTURES}/components.html`];
  const merged = await webstyle(['extract', ...urls, '--merge', '--no-dark', '--out', out]);
  expect(merged.code).toBe(0);
  const snapshot = JSON.parse(await readFile(join(out, 'snapshot.webstyle.json'), 'utf8'));
  expect(snapshot.snapshots[0].kind).toBe('site');
  expect(snapshot.snapshots[0].pages).toHaveLength(2);
  const cross = await webstyle([
    'extract',
    urls[0],
    'http://localhost:4173/components.html',
    '--merge',
    '--no-dark',
  ]);
  expect(cross.code).toBe(1);
  expect(cross.stderr).toContain('--allow-cross-site');
});

test('AC-F41.6 diff and map produce the extension formats', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'webstyle-dm-'));
  await webstyle(['extract', `${FIXTURES}/classic.html`, '--no-dark', '--out', join(dir, 'a')]);
  await webstyle(['extract', `${FIXTURES}/utility.html`, '--no-dark', '--out', join(dir, 'b')]);
  const diff = await webstyle([
    'diff',
    join(dir, 'a/snapshot.webstyle.json'),
    join(dir, 'b/snapshot.webstyle.json'),
  ]);
  expect(diff.code).toBe(0);
  expect(diff.stdout).toMatch(/added · .* removed/);
  const map = await webstyle([
    'map',
    join(dir, 'a/snapshot.webstyle.json'),
    '--tokens',
    new URL('../fixtures/user-tokens/tokens.json', import.meta.url).pathname,
  ]);
  expect(map.code).toBe(0);
  expect(map.stdout).toContain('# Token mapping');
});

test('AC-F41.5 AC-F24.7 states and widths use the shared Advanced capture plan', async () => {
  const out = await mkdtemp(join(tmpdir(), 'webstyle-adv-'));
  const result = await webstyle([
    'extract',
    `${FIXTURES}/responsive.html`,
    '--states',
    '--widths',
    '375,768',
    '--out',
    out,
  ]);
  expect(result.code).toBe(0);
  const record = JSON.parse(await readFile(join(out, 'snapshot.webstyle.json'), 'utf8'))
    .snapshots[0];
  expect(record.extracted.meta.capture.advanced).toBe(true);
  expect(record.captures.filter((c) => c.kind === 'width').map((c) => c.viewportWidth)).toEqual([
    375, 768,
  ]);
  expect(record.extracted.responsive.widths).toEqual(expect.arrayContaining([375, 768]));
  expect(await readFile(join(out, 'DESIGN.md'), 'utf8')).toContain('## Responsive');

  const states = await mkdtemp(join(tmpdir(), 'webstyle-states-'));
  expect(
    (
      await webstyle([
        'extract',
        `${FIXTURES}/states.html`,
        '--states',
        '--no-dark',
        '--out',
        states,
      ])
    ).code,
  ).toBe(0);
  const stateRecord = JSON.parse(await readFile(join(states, 'snapshot.webstyle.json'), 'utf8'))
    .snapshots[0];
  expect(stateRecord.extracted.components.some((r) => r.stateSource === 'forced')).toBe(true);
});

test('AC-F40.8 an extension export opens in the CLI and a CLI snapshot imports into the extension', async ({
  ext,
}) => {
  const { tabId } = await openFixture(ext.context, ext.worker, 'classic.html');
  const panel = await openPanel(ext.context, ext.extensionId, tabId);
  await extractFrom(panel);
  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel
      .getByRole('button', { name: 'Menu' })
      .click()
      .then(() => panel.getByRole('menuitem', { name: 'Export snapshot' }).click()),
  ]);
  const fromExtension = await download.path();
  const dir = await mkdtemp(join(tmpdir(), 'webstyle-io-'));
  await webstyle(['extract', `${FIXTURES}/utility.html`, '--no-dark', '--out', dir]);
  const diff = await webstyle(['diff', fromExtension, join(dir, 'snapshot.webstyle.json')]);
  expect(diff.code).toBe(0);
  expect(diff.stdout).toContain('# 127.0.0.1 vs 127.0.0.1');

  await panel.getByRole('button', { name: 'Back' }).first().click();
  await panel.getByRole('button', { name: 'History' }).click();
  await panel.locator('input[type=file]').setInputFiles(join(dir, 'snapshot.webstyle.json'));
  await expect(panel.getByText('Imported 1 snapshots.')).toBeVisible();
  await expect(panel.locator('[data-snapshot]')).toHaveCount(2);
});
