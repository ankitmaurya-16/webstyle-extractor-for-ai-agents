# Non-functional requirements

The extension must be safe to install on any machine: it reads only the page the user points it at, sends nothing anywhere, and never slows that page down.

## Security and privacy

- **No network.** No fetch, XHR, WebSocket or sendBeacon in any context. Production builds set `connect-src 'none'`. An end-to-end test runs a full extraction and asserts zero network requests from the service worker and the panel.
- **No remote code.** Everything is bundled. No `eval`, `new Function` or string timers. The lockfile is committed and CI runs a dependency audit.
- **Exact permissions.** A unit test asserts the built manifest's permissions equal `activeTab`, `scripting`, `sidePanel` and `storage`, with no host permissions and no `content_scripts`.
- **Read-only on the page.** The extractor runs in the isolated world, never writes to the page DOM and never adds visible elements or styles.
- **Minimal reading.** The extractor reads computed styles, tag names and roles only. It never reads form values, input contents, cookies, localStorage, sessionStorage or page text; text is used only as a character count.
- **Local data.** Snapshots stay in IndexedDB until the user deletes them. Copy details never includes page content.
- **Store disclosure.** The Chrome Web Store privacy section declares that no user data is collected or used.

## Performance budgets

| Metric | Budget | Checked by |
| --- | --- | --- |
| Extraction plus analysis | Under 3 s on each fixture | End-to-end timing |
| Longest main-thread task caused by the extractor | 50 ms or less | Long-task observer in end-to-end tests |
| Extractor bundle | 50 KB minified or less | Size check in CI |
| Panel JavaScript | 250 KB gzipped or less | Size check in CI |
| Panel ready after opening | Under 300 ms | Manual DevTools check in M7 |
| One snapshot record | 500 KB or less | Unit test on the largest fixture |

The analysis worker is terminated after every run so it holds no memory between analyses.

## Reliability

- The service worker is stateless and must work if Chrome restarts it between any two events.
- Extraction and analysis each time out after 10 s.
- One run at a time per panel, guarded by `requestId`.
- A storage failure never blocks showing results.

## Accessibility

The panel meets WCAG 2.1 AA. An end-to-end test drives the main path with the keyboard only: Home, Extract, Export, Copy.

## Compatibility

Chrome 116 or newer on Windows, macOS, Linux and ChromeOS. Other Chromium browsers such as Edge and Brave should work but are not tested in v1. The UI is English only, with every string in `entrypoints/sidepanel/strings.ts` so translation can come later.

## Edge cases

| Case | Expected behavior |
| --- | --- |
| Extract double-clicked or shortcut pressed repeatedly | One run only (AC-F1.3) |
| Panel closed during a run | Result discarded, nothing saved (AC-F1.12) |
| Tab navigates during a run | PAGE\_CHANGED error (AC-F1.11) |
| More than 4,000 visible elements | Stop at the cap, set `truncated`, mention it in DESIGN.md Notes |
| Lazy-loaded or single-page-app content not rendered yet | Thin or incomplete result; the user scrolls and re-runs |
| Canvas or WebGL page | EMPTY\_PAGE (Thin state) |
| Iframes and shadow roots | Ignored in v1; only the top document is read |
| Cross-origin stylesheets | Computed styles still read; breakpoints and variables marked partial |
| Dark-themed site | `colorScheme: 'dark'` recorded; roles still assigned by usage |
| Utility-class site with many one-off values | Merged by distance and dropped below the usage threshold |
| Gradients and background images | Ignored; colors inside gradients are not extracted |
| Modern color syntax (oklch, lab, color-mix) in computed values | Parsed by culori; unparseable values skipped and counted |
| Transparent backgrounds | Ignored for background weight |
| No buttons or links | No primary; the Components tab shows only what exists |
| IndexedDB quota exceeded | STORAGE\_FAILED toast; results stay visible |
| Clipboard blocked | CLIPBOARD\_FAILED toast suggesting Download |
| Panel at 320 px wide | Tab bar scrolls sideways; long names truncate with an ellipsis and show in full in a tooltip |
| Same site extracted many times | Each run is its own snapshot; history lists them all |
