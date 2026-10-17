# WebStyle Extractor for AI Agents

Chrome Manifest V3 extension that extracts a website's design system (colors, typography, spacing, radii, shadows, breakpoints, component styles) and exports it as DESIGN.md plus token files for AI coding agents. Free and open source under MIT. Everything runs locally in the browser.

## Stack

- WXT + Vite, JavaScript (ES modules, JSX for React) with JSDoc shapes, pnpm
- React 19 side panel, Tailwind CSS v4 compiled at build time, Radix UI primitives, lucide-react icons, Zustand for state
- culori for color math, idb for IndexedDB, fflate for zip
- Vitest for unit tests, Playwright for end-to-end tests with the unpacked extension

## Commands

- `pnpm install`: install dependencies
- `pnpm dev`: open Chrome with the extension loaded and hot reload
- `pnpm build`: production build to `.output/chrome-mv3`
- `pnpm zip`: Chrome Web Store zip
- `pnpm test`: unit tests
- `pnpm test:e2e`: end-to-end tests against `tests/fixtures`
- `pnpm lint`, `pnpm format:check` and `pnpm size` (bundle budgets)

## Hard rules

- No network requests from any part of the extension: no analytics, no remote code, no CDN imports, no `eval`.
- Permissions are exactly `activeTab`, `scripting`, `sidePanel` and `storage`. Never add permissions, host permissions or a `content_scripts` key.
- The extractor bundle stays under 50 KB and imports nothing heavy. Color math runs only in the analysis worker.
- Code in `src/analyze` and `src/export` is pure: no `chrome.*` calls, no DOM access, full unit tests. Every exporter has a snapshot test.
- The service worker holds no state in variables. Persist anything that must survive.
- Never invent token values. Only values found on the page appear in the output.
- Components use the theme tokens in docs/ui.md. No hex values in component code.
- Name tests after acceptance-criteria IDs, for example `AC-F2.3`.
- Build one milestone at a time from docs/milestones.md and stop at its end.
- If a doc and the code disagree, the doc wins. Ask before changing a decision, and update the doc in the same change.

## Docs

Always read:

@docs/product-brief.md

@docs/conventions.md

Read when the task touches them:

- docs/user-flows.md: flows and acceptance criteria
- docs/architecture.md: components, stack, permissions, manifest
- docs/data-model.md: types and storage schema
- docs/api.md: message contracts, module APIs, error codes, export formats
- docs/sequences.md: message order and failure paths
- docs/ui.md: panel design system, screens and states
- docs/non-functional.md: security, performance, accessibility, edge cases
- docs/milestones.md: build order
