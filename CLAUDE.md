# WebStyle Extractor for AI Agents

Chrome Manifest V3 extension (plus a Firefox build and a headless CLI) that extracts a website's design system (colors with light and dark themes, typography, spacing, radii, shadows, motion, breakpoints, component styles with states) and exports it as DESIGN.md plus token files for AI coding agents. Free and open source under MIT. The extension runs entirely in the browser.

## Stack

- WXT + Vite, JavaScript (ES modules, JSX for React) with JSDoc shapes, pnpm
- React 19 side panel, Tailwind CSS v4 compiled at build time, Radix UI primitives, lucide-react icons, Zustand for state
- culori for color math, idb for IndexedDB, fflate for zip
- Vitest for unit tests, Playwright for end-to-end tests with the unpacked extension
- zod for snapshot import validation; `chrome.i18n` strings through `t()` in src/i18n.js
- `cli/`: pnpm workspace package `webstyle-extractor` (the `webstyle` command), bundled with tsup, driving Playwright Chromium

## Commands

- `pnpm install`: install dependencies
- `pnpm dev`: open Chrome with the extension loaded and hot reload
- `pnpm build`: production build to `.output/chrome-mv3`
- `pnpm zip`: Chrome Web Store zip
- `pnpm test`: unit tests
- `pnpm test:e2e`: end-to-end tests against `tests/fixtures`
- `pnpm build:firefox`, `pnpm zip:firefox`, `pnpm lint:firefox` (web-ext lint)
- `pnpm cli:build` then `node cli/dist/webstyle.js extract <url>`
- `pnpm lint`, `pnpm format:check` and `pnpm size` (bundle budgets)
- `node scripts/build-messages.js` after editing scripts/messages-source.js

## Hard rules

- The extension makes no network requests from any context: no analytics, no remote code, no CDN imports, no `eval`. Only the separate CLI package may load pages.
- Required permissions are exactly `activeTab`, `scripting`, `sidePanel` and `storage`. Optional permissions are exactly `debugger` and the host patterns `https://*/*` and `http://*/*`, requested only from a user click, one site at a time for hosts. Never request at install. No `content_scripts` key.
- The page is read-only except for the four opt-in exceptions in docs/v2-spec.md section 2.1. Every exception is temporary and cleaned up on exit, error, navigation or panel close.
- Never read or store page text. Class names, ARIA attributes, font metadata and opt-in component screenshots are allowed.
- Never invent token values or generate shades. Only values found on the page appear in output.
- The debugger is attached only during a capture and always detached in a `finally` block, and when the panel disconnects.
- Core extractor bundle 70 KB or less; picker and highlighter bundles 15 KB or less each.
- Code in `src/analyze`, `src/export`, `src/edit`, `src/diff` and `src/mapping` is pure: no `chrome.*`, no DOM, full unit tests. Every exporter has a snapshot test.
- The service worker holds no state in variables. Persist anything that must survive.
- Components use the theme tokens in docs/ui.md. No hex values in component code.
- Name tests after acceptance-criteria IDs, for example `AC-F13.4`.
- Build one milestone at a time from docs/v2-spec.md section 12 and stop at its end.
- If a doc and the code disagree, the doc wins. Ask before changing a decision, and update the doc in the same change.

## Docs

Always read:

@docs/product-brief.md

@docs/conventions.md

Read when the task touches them:

- docs/v2-spec.md: the v2 specification (features F9 to F44, milestones M8 to M21)
- docs/user-flows.md: flows and acceptance criteria
- docs/architecture.md: components, stack, permissions, manifest
- docs/data-model.md: types and storage schema
- docs/api.md: message contracts, module APIs, error codes, export formats
- docs/sequences.md: message order and failure paths
- docs/ui.md: panel design system, screens and states
- docs/non-functional.md: security, performance, accessibility, edge cases
- docs/milestones.md: build order
