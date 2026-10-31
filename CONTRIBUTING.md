# Contributing

Thanks for helping. Bug reports with the site URL (if public) and what you expected are the most useful contribution; open an issue for them.

## Setup

```bash
pnpm install        # also runs `wxt prepare`
pnpm dev            # Chrome with the extension and hot reload
```

To try a production build by hand: `pnpm build`, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `.output/chrome-mv3`. For Firefox: `pnpm build:firefox`, open `about:debugging`, choose **This Firefox**, then **Load Temporary Add-on** and pick `.output/firefox-mv3/manifest.json`.

For the CLI: `pnpm cli:build`, then `node cli/dist/webstyle.js extract <url>`. It needs Playwright's Chromium (`npx playwright install chromium`).

## Before you open a pull request

```bash
pnpm lint
pnpm format:check   # or `pnpm format` to fix
pnpm test
pnpm test:e2e       # builds, then runs Playwright against tests/fixtures
pnpm size
pnpm lint:firefox   # Firefox build plus web-ext lint
```

CI runs the same checks plus a dependency audit, the Firefox package and a CLI install on a clean runner.

## Rules that keep the extension safe

These come from [CLAUDE.md](CLAUDE.md), [docs/non-functional.md](docs/non-functional.md) and [docs/v2-spec.md](docs/v2-spec.md) section 2:

- **No network requests** from any part of the extension: no analytics, remote code, CDN imports or `eval`. Deep scan reads stylesheets through the debugger, never `fetch`. Only the separate CLI package loads pages.
- **Required permissions stay exactly** `activeTab`, `scripting`, `sidePanel` and `storage`. **Optional permissions stay exactly** `debugger` and the host patterns `https://*/*` and `http://*/*`, requested only from a user click, one site at a time for hosts, never at install. No `content_scripts`. (The `WXT_E2E=1` test build adds localhost host permissions and a required `debugger` so Playwright can run without a toolbar click or a permission prompt; it is never shipped.)
- **The page is read-only** except for four opt-in, temporary exceptions: the picker overlay, highlight outlines, auto-scroll and debugger emulation during Advanced capture. Each is cleaned up on exit, error, navigation and panel close, with a test for each path.
- **The debugger** is attached only during a capture and always detached in a `finally` block, and when the panel disconnects.
- **Never read or store page text.** Class names, ARIA attributes, font metadata and opt-in component screenshots are allowed.
- **Never invent token values or generate shades.** Only values found on the page appear in the output.
- **Bundles stay small:** core extractor 70 KB or less, picker and highlighter 15 KB or less each, panel initial JavaScript 300 KB gzipped or less (`pnpm size`).
- **`src/analyze`, `src/export`, `src/edit`, `src/diff` and `src/mapping` are pure:** no `chrome.*`, no DOM, full unit tests. Every exporter has a snapshot test.
- **The service worker holds no state in variables.** Persist anything that must survive a restart.
- **Panel components use the theme tokens** in `entrypoints/sidepanel/theme.css`, never hex values, in both themes, and read and change state only through the store.
- **Every UI string goes through `t()`**; exports stay English and never call it.
- **No new dependency** without a row in the decision log in `docs/product-brief.md`.

## Where things live

| Path                         | What                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/collect/`               | Page-side DOM walk, stylesheets, variables, states, translucency, overlays; bundled into the page scripts |
| `src/advanced/`              | `CdpClient` and the Advanced capture plan (deep scan, dark, states, widths)                               |
| `src/analyze/`               | Pooling, themes, translucency, site variables, colors, typography, layout, motion, recipes, confidence    |
| `src/detect/`                | Framework and icon library detection, variable-name rules                                                 |
| `src/contrast/`              | WCAG contrast results                                                                                     |
| `src/audit/`                 | The consistency report                                                                                    |
| `src/edit/apply-edit.js`     | The only way an edited design changes, plus edit-log replay                                               |
| `src/export/`                | One file per export format, the file map (`files.js`) and the zip                                         |
| `src/diff/`                  | Snapshot diff and `diff.md`                                                                               |
| `src/mapping/`               | Token-file parsers, matching and `mapping.md`                                                             |
| `src/io/`                    | Snapshot import and export with zod schemas                                                               |
| `src/project/`               | Writing to a linked project folder, marked-block merging                                                  |
| `src/model/`                 | Ordered enums (`types.js`), stable ids, the same-site rule, design and highlight helpers                  |
| `src/storage/`               | IndexedDB snapshots, screenshots and projects, settings, the v1 migration                                 |
| `src/platform/`              | `chrome.*` wrappers, the error classifier, the service worker's extract logic, overlays, screenshots      |
| `src/i18n.js`                | `t()` over `chrome.i18n`, and `Intl` date and number helpers                                              |
| `entrypoints/`               | `background.js`, `extractor.js`, `picker.js`, `highlighter.js` and the React `sidepanel/`                 |
| `entrypoints/sidepanel/`     | React UI: `store.js`, `theme.css`, `screens/`, `components/`                                              |
| `cli/`                       | The `webstyle-extractor` npm package: `src/args.js`, `src/extract.js`, `src/cdp.js`, `tsup.config.js`     |
| `scripts/messages-source.js` | The English source of every UI string                                                                     |
| `public/_locales/`           | Generated `messages.json` per language                                                                    |
| `tests/fixtures/`            | Synthetic pages written for this repo, never copies of real sites                                         |
| `tests/unit/fixtures/`       | RawSnapshots captured from those pages for the unit tests                                                 |
| `tests/e2e/`                 | Playwright tests against the built extension and the CLI                                                  |

## Tests

- Name tests after the acceptance criterion they prove, for example `it('AC-F13.4 never toggles a class-based theme', ...)`. v1 criteria are in [docs/user-flows.md](docs/user-flows.md); v2 criteria are in [docs/v2-spec.md](docs/v2-spec.md) section 8.
- Every exporter has a snapshot test per fixture in `tests/unit/export/__snapshots__/`. If you change output on purpose, run `pnpm vitest run -u` and review the diff.
- Fixtures are synthetic pages in `tests/fixtures/` (v2 spec 13.1 lists what each covers). When the collector changes, rebuild the test build and re-capture the unit fixtures, all of them or only the ones you name (paths under `tests/fixtures`, without `.html`):

  ```bash
  WXT_E2E=1 pnpm wxt build
  node scripts/capture-fixtures.js                # the default set
  node scripts/capture-fixtures.js states motion  # only these
  ```

- Every page-side change needs cleanup tests for success, error, cancel, navigation, tab close and panel close.
- `node scripts/screenshots.js` regenerates the README and store screenshots (needs the test build).
- Firefox has no Playwright run: use unit tests, `pnpm lint:firefox` and the manual smoke checklist (extract, review, export, history), and record the result in the pull request.

## Adding a language

Only English ships, but every UI string is ready for translation.

1. Copy `public/_locales/en/messages.json` to `public/_locales/<code>/messages.json`, where `<code>` is a Chrome locale code such as `de`, `fr` or `pt_BR`.
2. Translate only the `message` fields. Leave the keys, `description` fields and `placeholders` blocks as they are, and keep every placeholder such as `$p1$` in the translated text.
3. English is the source. The English file is generated from `scripts/messages-source.js`; to change or add an English string, edit that file and run `node scripts/build-messages.js` (or `pnpm messages`). Never edit `public/_locales/en/messages.json` by hand.
4. Exports (DESIGN.md and every other file) stay in English whatever the UI language, because agents read them. Do not translate exporter text.
5. Test it: `pnpm build`, load the build, and start Chrome with the language flag, for example `google-chrome --lang=de`. Check every screen at 320 px wide, since translations are often longer.

## Commits

Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). If code and a doc disagree, the doc wins: change the doc in the same pull request when you change a decision.
