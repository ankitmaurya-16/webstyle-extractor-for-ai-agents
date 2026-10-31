import { defineConfig } from 'tsup';

// Two outputs: the Node CLI with the shared core inlined, and the collector as an IIFE string
// the CLI injects into each page (F41). Runtime dependencies other than Playwright are bundled.
export default defineConfig([
  {
    entry: { webstyle: 'src/webstyle.js' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    clean: true,
    noExternal: [/^(?!playwright)/],
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  },
  {
    entry: { 'collector.iife': 'src/page-entry.js' },
    format: ['iife'],
    platform: 'browser',
    target: 'chrome116',
    outDir: 'dist',
    minify: true,
    outExtension: () => ({ js: '.js' }),
  },
]);
