import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// The end-to-end build (WXT_E2E=1) adds localhost host permissions so Playwright can run the
// extractor without a toolbar click, which automation cannot perform. It goes to its own folder
// and is never shipped; the store build keeps exactly the four permissions.
const e2e = process.env.WXT_E2E === '1';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDirTemplate: e2e
    ? '{{browser}}-mv{{manifestVersion}}-e2e'
    : '{{browser}}-mv{{manifestVersion}}',
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ mode }) => ({
    name: 'WebStyle Extractor for AI Agents',
    description:
      "Extract any website's colors, fonts and spacing into a DESIGN.md your AI coding agent can follow. Free, open source, local.",
    minimum_chrome_version: '116',
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage'],
    action: { default_title: 'Extract design system' },
    commands: {
      extract: {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Extract the design system of this page',
      },
    },
    ...(e2e ? { host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'] } : {}),
    // The dev server needs network access, so the no-network CSP is production only.
    ...(mode === 'production'
      ? {
          content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'self'; connect-src 'none'",
          },
        }
      : {}),
  }),
});
