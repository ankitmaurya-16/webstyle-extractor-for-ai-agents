import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// The end-to-end build (WXT_E2E=1) adds localhost host permissions and the debugger permission
// so Playwright can run the extractor and Advanced capture without a toolbar click or a
// permission prompt, which automation cannot perform. It goes to its own folder and is never
// shipped; the store build keeps exactly the required and optional permissions below.
const e2e = process.env.WXT_E2E === '1';

/** Placeholder: replace with an address you control before submitting to addons.mozilla.org. */
export const GECKO_ID = 'webstyle-extractor@example.invalid';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDirTemplate: e2e
    ? '{{browser}}-mv{{manifestVersion}}-e2e'
    : '{{browser}}-mv{{manifestVersion}}',
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: ({ mode, browser }) => {
    const firefox = browser === 'firefox';
    return {
      name: '__MSG_extName__',
      description: '__MSG_extDescription__',
      default_locale: 'en',
      ...(firefox
        ? {
            browser_specific_settings: {
              // The extension collects and transmits nothing (Firefox's built-in consent).
              gecko: {
                id: GECKO_ID,
                strict_min_version: '128.0',
                data_collection_permissions: { required: ['none'] },
              },
            },
            permissions: ['activeTab', 'scripting', 'storage'],
            optional_host_permissions: ['https://*/*', 'http://*/*'],
          }
        : {
            minimum_chrome_version: '116',
            permissions: [
              'activeTab',
              'scripting',
              'sidePanel',
              'storage',
              ...(e2e ? ['debugger'] : []),
            ],
            ...(e2e ? {} : { optional_permissions: ['debugger'] }),
            optional_host_permissions: ['https://*/*', 'http://*/*'],
          }),
      action: { default_title: '__MSG_actionTitle__' },
      commands: {
        extract: {
          suggested_key: { default: 'Alt+Shift+D' },
          description: '__MSG_commandExtract__',
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
    };
  },
});
