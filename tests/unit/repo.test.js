// Checks on repository files that acceptance criteria name: docs, CI and package scripts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('repository', () => {
  it('AC-F44.6 CONTRIBUTING.md explains adding a language', () => {
    const text = read('CONTRIBUTING.md');
    expect(text).toContain('## Adding a language');
    expect(text).toContain('public/_locales');
    expect(text).toContain('scripts/build-messages.js');
  });

  it('AC-F41.10 the README documents the CLI with the line an agent can run', () => {
    const text = read('README.md');
    expect(text).toContain('npx webstyle-extractor extract https://example.com --out .');
    for (const option of [
      '--formats',
      '--merge',
      '--dark',
      '--states',
      '--deep',
      '--widths',
      '--json',
    ]) {
      expect(text).toContain(option);
    }
    expect(read('cli/README.md')).toContain('webstyle extract');
  });

  it('AC-F43.7 CI builds Chrome and Firefox packages on every pull request', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/pull_request/);
    expect(ci).toContain('pnpm build');
    expect(ci).toContain('pnpm zip:firefox');
    expect(ci).toContain('pnpm lint:firefox');
  });

  it('AC-F43.2 web-ext lint runs on the Firefox build', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['lint:firefox']).toContain('web-ext lint --source-dir .output/firefox-mv3');
  });

  it('AC-F41.9 a CI job installs the packed CLI on Node 20 and runs it with npx', () => {
    const ci = read('.github/workflows/ci.yml');
    const job = ci.slice(ci.indexOf('  cli:'));
    expect(job).toContain('node-version: 20');
    expect(job).toContain('npm pack');
    expect(job).toContain('npx webstyle extract');
    const cli = JSON.parse(read('cli/package.json'));
    expect(cli.name).toBe('webstyle-extractor');
    expect(cli.bin.webstyle).toBe('dist/webstyle.js');
    expect(cli.engines.node).toBe('>=20');
    expect(cli.version).toBe(JSON.parse(read('package.json')).version);
  });
});
