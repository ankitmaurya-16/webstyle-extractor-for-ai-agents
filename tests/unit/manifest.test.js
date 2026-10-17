import { beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve(process.cwd(), '.output/chrome-mv3/manifest.json');
let manifest;

beforeAll(() => {
  // The store build is what users install, so the test reads the real built manifest.
  execSync('pnpm wxt build', { stdio: 'ignore', env: { ...process.env, WXT_E2E: '' } });
  expect(existsSync(manifestPath)).toBe(true);
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
}, 120_000);

describe('built manifest', () => {
  it('has exactly activeTab, scripting, sidePanel and storage', () => {
    expect([...manifest.permissions].sort()).toEqual([
      'activeTab',
      'scripting',
      'sidePanel',
      'storage',
    ]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('AC-F1.1 declares the side panel, the toolbar action and the Alt+Shift+D command', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.side_panel.default_path).toBe('sidepanel.html');
    expect(manifest.action.default_title).toBe('Extract design system');
    expect(manifest.commands.extract.suggested_key.default).toBe('Alt+Shift+D');
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('enforces the no-network rule with connect-src none', () => {
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'; connect-src 'none'",
    );
  });

  it('ships the toolbar icons', () => {
    expect(Object.keys(manifest.icons ?? {}).sort()).toEqual(['128', '16', '32', '48']);
  });
});
