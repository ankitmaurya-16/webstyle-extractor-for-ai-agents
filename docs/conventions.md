# Conventions

These rules keep every session consistent: where code goes, how it is written, how it is tested and when a task counts as done.

## Folder structure

```text
webstyle-extractor/
├─ CLAUDE.md
├─ LICENSE                      # MIT
├─ README.md
├─ CONTRIBUTING.md
├─ package.json                 # webstyle-extractor-extension (private)
├─ pnpm-lock.yaml
├─ wxt.config.js                # manifest for Chrome and Firefox, GECKO_ID placeholder
├─ eslint.config.js
├─ .prettierrc
├─ .github/workflows/ci.yml     # audit, lint, format, unit, e2e, build, size checks, Firefox and CLI jobs
├─ docs/                        # these design docs, including v2-spec.md
├─ public/icon/                 # 16, 32, 48 and 128 px PNGs
├─ public/_locales/en/          # messages.json, generated from scripts/messages-source.js
├─ entrypoints/
│  ├─ background.js             # service worker
│  ├─ extractor.js              # unlisted script; installs self.__webstyle
│  ├─ picker.js                 # unlisted script; element picker (F26)
│  ├─ highlighter.js            # unlisted script; "where is this used" outlines (F30)
│  └─ sidepanel/
│     ├─ index.html
│     ├─ main.jsx
│     ├─ App.jsx                # screen switcher and data-theme
│     ├─ theme.css              # Tailwind @theme tokens from ui.md, dark and light
│     ├─ store.js               # Zustand store and actions
│     ├─ screens/               # Home, Extracting, Results and its tabs, History, Settings,
│     │                         # Picking, Diff, MapScreen, StateScreen
│     └─ components/            # Button, TokenRow, Basics, CodePreview, Dialogs, ...
├─ src/
│  ├─ model/                    # types.js (ordered enums), ids.js, design.js, site.js, highlight.js
│  ├─ messaging.js
│  ├─ i18n.js                   # t() over chrome.i18n, Intl helpers
│  ├─ collect/                  # page side: DOM walk, stylesheets, states, overlays
│  ├─ advanced/                 # CdpClient and the Advanced capture plan
│  ├─ analyze/                  # pure analysis, plus worker.js and assemble.js
│  ├─ detect/                   # framework, icons, variable rules
│  ├─ contrast/                 # WCAG contrast
│  ├─ audit/                    # consistency report
│  ├─ edit/apply-edit.js        # applyEdit and replay
│  ├─ export/                   # one file per format, files.js (file map), zip
│  ├─ diff/                     # snapshot diff and diff.md
│  ├─ mapping/                  # token-file parsers, matching, mapping.md
│  ├─ io/                       # snapshot import and export (zod)
│  ├─ project/                  # write to a project folder
│  ├─ storage/                  # snapshots.js, settings.js, migrate.js
│  └─ platform/                 # chrome.* wrappers, errors.js, extract-handler.js, overlays.js, screenshots.js
├─ cli/                         # npm package webstyle-extractor (the webstyle command)
│  ├─ package.json
│  ├─ tsup.config.js            # CLI bundle plus the collector IIFE
│  └─ src/                      # webstyle.js, args.js, extract.js, cdp.js, page-entry.js
├─ scripts/                     # check-size, capture-fixtures, build-messages, screenshots, icons
├─ store/                       # store screenshots
└─ tests/
   ├─ fixtures/                 # synthetic HTML pages written for this repo
   ├─ unit/                     # mirrors src/; fixtures/ holds captured RawSnapshots
   └─ e2e/                      # Playwright against the built extension and the CLI
```

## Code style

- JavaScript ES modules; React components in `.jsx`. Ordered enums live in `src/model/types.js`; shapes from data-model.md are documented as JSDoc typedefs in the modules that use them. Check inputs at boundaries (messages, storage) instead of trusting them.
- Prettier: 2 spaces, single quotes, semicolons, trailing commas, 100-character lines.
- ESLint: `@eslint/js` recommended plus react-hooks, with `no-eval`, `no-implied-eval` and `no-new-func` as errors.
- Modules in kebab-case (`apply-edit.js`), React components in PascalCase (`TokenRow.jsx`).
- Named exports only, except where WXT entrypoints require a default export.
- Function components and hooks. Components read and change state only through store actions; they never call `chrome.*` or storage directly.
- Every user-visible string is a key in `scripts/messages-source.js`, read with `t()`. Never put UI text in components, and never call `t()` in exporters.
- Expected failures return typed results (`EditResult`, `BackgroundReply`). Throw only for programmer errors.
- No new dependency without a row in the decision log.
- Comments explain why, not what.

## Commands

```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "build:firefox": "wxt build -b firefox",
    "zip:firefox": "wxt zip -b firefox",
    "lint:firefox": "pnpm build:firefox && web-ext lint --source-dir .output/firefox-mv3",
    "test": "vitest run",
    "test:e2e": "pnpm build && playwright test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "size": "node scripts/check-size.js",
    "cli:build": "pnpm --filter webstyle-extractor build",
    "messages": "node scripts/build-messages.js",
    "postinstall": "wxt prepare"
  }
}
```

To try a build by hand: run `pnpm build`, open chrome://extensions, turn on Developer mode, choose Load unpacked and pick `.output/chrome-mv3`. For Firefox, run `pnpm build:firefox`, open about:debugging, choose This Firefox, Load Temporary Add-on, and pick `.output/firefox-mv3/manifest.json`.

## Testing rules

- Every acceptance criterion has at least one test named with its ID, for example `it('AC-F2.2 merges near-identical colors', ...)`.
- Unit tests cover analyze, collect helpers, detect, contrast, audit, edit, export, diff, mapping, io, project, platform, storage (with fake-indexeddb), the panel components and the CLI's argument parsing.
- The collector, Advanced capture, picker, highlighter and cleanup paths are tested end to end in Playwright, because they need a real browser. `node scripts/capture-fixtures.js [names]` re-captures the RawSnapshots that the unit tests read (after `WXT_E2E=1 pnpm wxt build`).
- End-to-end tests run against a separate build (`WXT_E2E=1`, output `.output/chrome-mv3-e2e`) that adds localhost host permissions, makes `debugger` a required permission and lets the panel take its target tab from `?tab=`, because automation cannot click the toolbar icon or answer a permission prompt. The store build never has these; the manifest unit test checks the store build.
- Fixtures are synthetic pages written for this repo, never copies of real sites. v1: a utility-class site, a classic CSS site, a dark site, a large page with 6,000 elements, a lazy-loading page, a canvas-only page and a page whose stylesheet is served from a second origin. v2 adds the pages in v2 spec section 13.1 (translucent, variables, three dark mechanisms, states, motion, typography, layout, gradients, components, frameworks, icons, coverage, responsive, multi-page, user tokens and snapshot files).
- The CLI is tested end to end against a local fixture server, with byte parity against the extension's zip. Firefox gets unit tests, `pnpm lint:firefox` and a manual smoke checklist.
- Every exporter has a snapshot test for each fixture's DesignSystem.
- Before release, check accuracy by hand on 20 live sites (including dark mode and states) and check the Figma import once; keep the site list outside the repo.

## Git

- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- One branch and one pull request per milestone, built from small commits.
- Never commit `.output/`, `.wxt/`, `node_modules/` or zips.
- The project needs no secrets; never add any.
- CI must pass before merging: audit, lint, format, unit, build, size checks, e2e, and the Chrome and Firefox package builds.

## Definition of done

A task or milestone is done when all of these hold:

- [ ] Its acceptance criteria are ticked in docs/user-flows.md (v1) or docs/v2-spec.md (v2)
- [ ] A test for each criterion passes, named with the criterion's ID
- [ ] Lint and format checks are clean
- [ ] The budgets in docs/non-functional.md still hold
- [ ] The no-network e2e test passes, and every page-side change it adds has passing cleanup tests
- [ ] Any changed decision is updated in the docs in the same change
- [ ] A manual run of the milestone's flow in a loaded build works
