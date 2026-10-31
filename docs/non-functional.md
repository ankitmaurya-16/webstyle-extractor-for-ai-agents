# Non-functional requirements

The extension must be safe to install on any machine: it reads only the page the user points it at, sends nothing anywhere, changes the page only in four opt-in, temporary ways, and never slows that page down. These are the v2 requirements (v2 spec section 11); v1 rules not mentioned here stay in force.

## Security and privacy

- **No network.** No fetch, XHR, WebSocket or sendBeacon in any context of the extension, in every feature. Deep scan reads stylesheets through the debugger (`CSS.getStyleSheetText`), not `fetch`. Production builds set `connect-src 'none'`. The end-to-end no-network test runs every feature and asserts zero network requests from the service worker and the panel. The style guide makes no request when opened.
- **The CLI** loads only the pages it is given (and their resources, as a browser does). It sends nothing anywhere else and has no telemetry.
- **No remote code.** Everything is bundled. No `eval`, `new Function` or string timers. The lockfile is committed and CI runs a dependency audit.
- **Exact permissions.** Required permissions are unchanged: `activeTab`, `scripting`, `sidePanel` and `storage`. Optional permissions are exactly `debugger` and the host patterns `https://*/*` and `http://*/*`. The manifest unit test asserts both lists, no required host permissions and no `content_scripts`. Optional permissions are requested only from a click, host permissions one origin at a time, and Settings can revoke them.
- **Page writes.** Only four exceptions, each opt-in, temporary and cleaned up on every exit path: the element picker overlay (F26), the highlight outlines (F30), auto-scroll (F22, scroll position restored), and debugger emulation during Advanced capture (F13, F23, F24), which visibly changes the page while it runs. Overlays live in a closed shadow root with `pointer-events: none` and are removed on exit. A site's theme class or attribute is never toggled.
- **Debugger hygiene.** Attached only during a capture, detached in `finally`, on CANCEL, panel disconnect, tab close, navigation and `onDetach`, and on service-worker start if `activeCapture` says it was left attached. Forced states and emulation are cleared even on error.
- **Reading.** Computed styles, tag names, roles, class names, ARIA attributes, `document.fonts` metadata and font host names. Never page text, form values, input contents, cookies, localStorage or sessionStorage; text is used only as a character count. Font URLs and files are never stored.
- **Screenshots.** Opt-in, local only, deleted with their snapshot, left out of JSON exports unless chosen. They are the only page imagery ever kept.
- **Project folders.** Writes stay inside the linked folder at validated relative paths; nothing is deleted; AGENTS.md and CLAUDE.md change only inside the markers.
- **Local data.** Snapshots stay in IndexedDB until the user deletes them. Copy details never includes page content. Snapshot exports never include project links.
- **Store disclosure.** The listing explains the optional debugger and host permissions, and still declares that no user data is collected or used.

## Performance budgets

| Metric | Budget | Checked by |
| --- | --- | --- |
| Basic extraction plus analysis | Under 3 s on each fixture | End-to-end timing |
| With auto-scroll | Under 8 s | End-to-end timing |
| Full Advanced capture (deep scan, dark, states, 3 widths) | Under 20 s, with per-stage progress | End-to-end timing; 8 s per stage and 20 s plan limits in code |
| Longest main-thread task caused by the extractor | 50 ms or less | Long-task observer in end-to-end tests |
| Core extractor bundle (`extractor.js`) | 70 KB minified or less | `pnpm size` |
| Picker and highlighter bundles (`picker.js`, `highlighter.js`) | 15 KB minified or less each | `pnpm size` |
| Panel initial JavaScript (chunks `sidepanel.html` loads) | 300 KB gzipped or less; style guide, diff, mapping, Figma and zip code are lazy-loaded | `pnpm size` (the analysis worker size is printed for information) |
| Snapshot record without screenshots | 1.5 MB or less | Unit test on the largest fixture |
| Highlight repositioning | 8 ms or less per frame | Manual DevTools check |
| DESIGN.md / prompt.md | 450 lines / 40 lines or fewer | Exporter tests on every fixture |
| Style guide without screenshots | 500 KB or less | Exporter tests |
| CLI, one URL, basic extraction | Under 10 s including browser launch on CI | CLI end-to-end test |
| Panel ready after opening | Under 300 ms | Manual DevTools check |

`pnpm size` (`scripts/check-size.js`) reads `.output/chrome-mv3` by default; pass another folder name to check a different build. The analysis worker is terminated after every run so it holds no memory between analyses.

## Reliability

- The service worker is stateless, must work if Chrome restarts it between any two events, and recovers from a restart mid-capture through `activeCapture`.
- Basic extraction times out after 10 s (16 s with auto-scroll), each Advanced stage after 8 s, the Advanced plan after 20 s, and analysis after 10 s.
- One run at a time per panel, guarded by `requestId`.
- Every page-side change (overlay, scroll, emulation, forced state) has a cleanup path tested for success, error, cancel, navigation, tab close and panel close.
- Partial captures never discard successful stages.
- Edits survive re-runs, merges and Advanced re-captures through the edit log.
- Storage and file-system failures never hide results.

## Accessibility

- The panel meets WCAG 2.1 AA in both themes.
- The keyboard-only end-to-end path covers Home, Advanced options, Extract, the Light / Dark switch, the state switcher, Insights, Export and Copy prompt.
- The picker works without a mouse: it starts with the element at the viewport's center selected, and the arrows and Enter work from there.
- The style guide passes axe-core with no serious violations.

## Compatibility

Chrome 116 or newer and current Edge with every feature, on Windows, macOS, Linux and ChromeOS. Firefox 128 or newer without Advanced capture and Write to project. Node 20 or newer for the CLI. Every UI string is in `public/_locales/en/messages.json` (generated from `scripts/messages-source.js`); only English ships, and dates and numbers use `Intl` with the UI locale. Right-to-left layouts are out of scope.

## Edge cases

| Case | Expected behavior |
| --- | --- |
| Extract double-clicked or shortcut pressed repeatedly | One run only (AC-F1.3) |
| Panel closed during a run | Result discarded, nothing saved, debugger detached, overlays removed (AC-F1.12) |
| Tab navigates during a run | PAGE\_CHANGED error (AC-F1.11); during Advanced capture the debugger is detached and nothing from the plan is saved |
| More than 4,000 visible elements | Stop at the cap, set `truncated`, mention it in DESIGN.md Notes |
| Lazy-loaded or single-page-app content not rendered yet | Turn on "Scroll to load content", or scroll and re-run |
| Canvas or WebGL page | EMPTY\_PAGE (Thin state) |
| Open shadow roots | Walked, their stylesheets read (F22) |
| Closed shadow roots and cross-origin iframes | Not read; skipped frames are counted and `meta.partial` includes `frames` |
| Iframes smaller than 100 x 100 px | Ignored |
| Cross-origin stylesheets | Computed styles still read; breakpoints, variables and states marked partial; Advanced deep scan recovers them |
| Deep-scan stylesheets over 5 MB in total | Stop at the cap and mark `cssVariables` and `breakpoints` partial |
| Thousands of custom properties | Keep the 3,000 most-referenced definitions |
| A site uses both a dark media query and a dark class | Record both; exports use the class selector, and the page is not emulated |
| Class or attribute theme mechanism | Never toggled; the other theme comes from stylesheet overrides (Path A) with a note |
| Site with no dark support | One mode and no Light / Dark switch |
| Pages of one site support different themes | Modes are united; a role missing in one theme on some pages is filled from the pages that have it |
| The same value is named differently by variables on different pages | The most-referenced name wins; the conflict appears in the consistency report |
| Translucent text over an image | Low confidence (AC-F9.9) |
| Gradients | Parsed into gradient tokens; stop colors join the palette at a quarter weight |
| Another debugger is attached to the tab | DEBUGGER\_ATTACH\_FAILED; "Run basic extraction" keeps working |
| Debugger permission declined | DEBUGGER\_DENIED toast; the switch turns off |
| Picking inside a cross-origin iframe | The iframe is selectable only as a whole element |
| Single-page app re-renders during highlight | Outlines are recomputed on scroll, resize and every 1 s while active |
| No visible element matches a highlight | HIGHLIGHT\_EMPTY toast |
| `captureVisibleTab` rejects | SCREENSHOT\_FAILED note in Export; the extraction still succeeds |
| A 21st page added to a snapshot | Toast; the page is not added |
| The linked project folder was moved or deleted | FS\_WRITE\_FAILED with a suggestion to link it again |
| Imported file is invalid, over 50 MB or from a newer version | IMPORT\_INVALID or IMPORT\_TOO\_NEW dialog; nothing imported |
| Imported snapshot id already exists | Imported as a copy with a new id and " (imported)" in its title |
| The OS theme changes while the panel is open with System appearance | The panel switches live |
| IndexedDB quota exceeded | STORAGE\_FAILED toast; results stay visible |
| Clipboard blocked | CLIPBOARD\_FAILED toast suggesting Download |
| Panel at 320 px wide | Tab bar scrolls sideways; long names truncate with an ellipsis and show in full in a tooltip |
| The CLI opens a page that needs a login | It sees what a signed-out browser sees |
| The CLI is blocked by bot protection or gets an HTTP error | Exit code 2 with a clear message |
| Chromium missing for the CLI | Prints `npx playwright install chromium` and exits 1 |
