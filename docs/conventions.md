# Conventions

These rules keep every session consistent: where code goes, how it is written, how it is tested and when a task counts as done.

## Folder structure

```text
webstyle-extractor/
├─ CLAUDE.md
├─ LICENSE                      # MIT
├─ README.md
├─ CONTRIBUTING.md
├─ package.json
├─ pnpm-lock.yaml
├─ wxt.config.js
├─ eslint.config.js
├─ .prettierrc
├─ .github/workflows/ci.yml     # lint, typecheck, unit, e2e, build, size checks
├─ docs/                        # these design docs
├─ public/icon/                 # 16, 32, 48 and 128 px PNGs
├─ entrypoints/
│  ├─ background.js             # service worker
│  ├─ extractor.js              # unlisted script; main() returns the RawSnapshot
│  └─ sidepanel/
│     ├─ index.html
│     ├─ main.jsx
│     ├─ App.jsx                # screen switcher
│     ├─ theme.css              # Tailwind @theme tokens from ui.md
│     ├─ strings.js             # every UI string
│     ├─ store.js               # Zustand store and actions
│     ├─ screens/               # Home, Extracting, Results, History, state screens
│     └─ components/            # Button, TokenRow, ScaleStrip, CodePreview, ...
├─ src/
│  ├─ model/types.js            # ordered enums and JSDoc shapes
│  ├─ model/design.js           # read helpers over a DesignSystem
│  ├─ messaging.js
│  ├─ collect/                  # page side: DOM walk and aggregation
│  ├─ analyze/                  # pure analysis, plus worker.ts
│  ├─ edit/apply-edit.js
│  ├─ export/                   # one file per format, plus zip
│  ├─ storage/                  # snapshots.ts, settings.ts
│  └─ platform/                 # chrome.* wrappers, errors.js, extract-handler.js
└─ tests/
   ├─ fixtures/                 # synthetic HTML pages written for this repo
   ├─ unit/                     # mirrors src/; fixtures/ holds captured RawSnapshots
   └─ e2e/                      # Playwright against the built extension
```

## Code style

- JavaScript ES modules; React components in `.jsx`. Shapes from data-model.md are documented as JSDoc typedefs in `src/model/types.js`. Check inputs at boundaries (messages, storage) instead of trusting them.
- Prettier: 2 spaces, single quotes, semicolons, trailing commas, 100-character lines.
- ESLint: `@eslint/js` recommended plus react-hooks, with `no-eval`, `no-implied-eval` and `no-new-func` as errors.
- Modules in kebab-case (`apply-edit.js`), React components in PascalCase (`TokenRow.jsx`).
- Named exports only, except where WXT entrypoints require a default export.
- Function components and hooks. Components read and change state only through store actions; they never call `chrome.*` or storage directly.
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
    "test": "vitest run",
    "test:e2e": "pnpm build && playwright test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "size": "node scripts/check-size.js",
    "postinstall": "wxt prepare"
  }
}
```

To try a build by hand: run `pnpm build`, open chrome://extensions, turn on Developer mode, choose Load unpacked and pick `.output/chrome-mv3`.

## Testing rules

- Every acceptance criterion has at least one test named with its ID, for example `it('AC-F2.2 merges near-identical colors', ...)`.
- Unit tests cover analyze, edit, export, platform/errors and storage (with fake-indexeddb).
- The collector is tested end to end in Playwright, because computed styles need a real browser. `node scripts/capture-fixtures.js` re-captures the RawSnapshots that the unit tests read.
- End-to-end tests run against a separate build (`WXT_E2E=1`, output `.output/chrome-mv3-e2e`) that adds localhost host permissions and lets the panel take its target tab from `?tab=`, because automation cannot click the toolbar icon to grant activeTab. The store build never has either; the manifest unit test checks the store build.
- Fixtures are synthetic pages written for this repo, never copies of real sites: a utility-class site, a classic CSS site, a dark site, a large page with 6,000 elements, a lazy-loading page, a canvas-only page and a page whose stylesheet is served from a second origin.
- Every exporter has a snapshot test for each fixture's DesignSystem.
- Before release, check accuracy by hand on 20 live sites; keep that list outside the repo.

## Git

- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- One branch and one pull request per milestone, built from small commits.
- Never commit `.output/`, `.wxt/`, `node_modules/` or zips.
- The project needs no secrets; never add any.
- CI must pass before merging: audit, lint, format, unit, build, size checks and e2e.

## Definition of done

A task or milestone is done when all of these hold:

- [ ] Its acceptance criteria are ticked in docs/user-flows.md
- [ ] A test for each criterion passes, named with the criterion's ID
- [ ] Lint and format checks are clean
- [ ] The budgets in docs/non-functional.md still hold
- [ ] Any changed decision is updated in the docs in the same change
- [ ] A manual run of the milestone's flow in a loaded build works
