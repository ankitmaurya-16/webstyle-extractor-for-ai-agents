# Contributing

Thanks for helping. Bug reports with the site URL (if public) and what you expected are the most useful contribution; open an issue for them.

## Setup

```bash
pnpm install        # also runs `wxt prepare`
pnpm dev            # Chrome with the extension and hot reload
```

To try a production build by hand: `pnpm build`, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `.output/chrome-mv3`.

## Before you open a pull request

```bash
pnpm lint
pnpm format:check   # or `pnpm format` to fix
pnpm test
pnpm test:e2e       # builds, then runs Playwright against tests/fixtures
pnpm size
```

CI runs the same checks plus a dependency audit.

## Rules that keep the extension safe

These come from [CLAUDE.md](CLAUDE.md) and [docs/non-functional.md](docs/non-functional.md):

- **No network requests** from any part of the extension: no analytics, remote code, CDN imports or `eval`.
- **Permissions stay exactly** `activeTab`, `scripting`, `sidePanel` and `storage`. No host permissions or `content_scripts`. (The `WXT_E2E=1` test build adds localhost host permissions so Playwright can inject without a toolbar click; it is never shipped.)
- **The extractor stays small** (50 KB or less) and only reads. It never writes to the page or reads form values or page text.
- **`src/analyze` and `src/export` are pure:** no `chrome.*`, no DOM, full unit tests.
- **Never invent token values.** Only values found on the page appear in the output.
- **Panel components use the theme tokens** in `entrypoints/sidepanel/theme.css`, never hex values, and read and change state only through the store.
- **No new dependency** without a row in the decision log in `docs/product-brief.md`.

## Where things live

| Path                     | What                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `src/collect/`           | Page-side DOM walk and aggregation, bundled into `entrypoints/extractor.js`      |
| `src/analyze/`           | Normalize, cluster, roles, naming, type scale, layout tokens and recipes         |
| `src/edit/apply-edit.js` | The only way an edited design changes                                            |
| `src/export/`            | One file per export format, plus the zip                                         |
| `src/storage/`           | IndexedDB snapshots and settings                                                 |
| `src/platform/`          | `chrome.*` wrappers, the error classifier and the service worker's extract logic |
| `entrypoints/sidepanel/` | React UI: `store.js`, `strings.js`, `screens/`, `components/`                    |
| `tests/fixtures/`        | Synthetic pages written for this repo, never copies of real sites                |
| `tests/unit/fixtures/`   | RawSnapshots captured from those pages for the unit tests                        |

## Tests

- Name tests after the acceptance criterion they prove, for example `it('AC-F2.2 merges near-identical colors', ...)`. The criteria are in [docs/user-flows.md](docs/user-flows.md).
- Every exporter has a snapshot test per fixture in `tests/unit/export/__snapshots__/`. If you change output on purpose, run `pnpm vitest run -u` and review the diff.
- When the collector changes, rebuild the test build and re-capture the unit fixtures:

  ```bash
  WXT_E2E=1 pnpm wxt build
  node scripts/capture-fixtures.js
  ```

- `node scripts/screenshots.js` regenerates the README and store screenshots (needs the test build).

## Commits

Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). If code and a doc disagree, the doc wins: change the doc in the same pull request when you change a decision.
