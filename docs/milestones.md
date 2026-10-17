# Milestones

The build runs in eight milestones, each small enough for one Claude Code session and each ending with tests that prove its acceptance criteria. Do them in order; later milestones assume earlier ones are done.

| Milestone | Delivers | Acceptance criteria |
| --- | --- | --- |
| M0 Project setup | Scaffold, tooling, CI, a panel that opens | AC-F1.1 |
| M1 Messaging and errors | EXTRACT round trip with a stub extractor, error mapping, shortcut | AC-F1.2, F1.3, F1.6 to F1.8, F1.10 to F1.12 |
| M2 Collector | Full page-side collection and the fixture pages | AC-F1.5, F1.9 |
| M3 Analysis engine | Normalize, cluster, roles, scales, naming, recipes | AC-F1.4, F2.1 to F2.8, F3.1 to F3.6, F4.1 to F4.6, F5.1 to F5.7 |
| M4 Results UI | Home, Extracting, Results tabs and every state, styled | AC-F1.13, F2.9 |
| M5 Edit and history | Edits, autosave, reset, History | AC-F6.1 to F6.8, F8.1 to F8.6 |
| M6 Exporters | Five formats, Export tab, copy, download, zip | AC-F7.1 to F7.9 |
| M7 Hardening and release | Budgets, accessibility, no-network proof, store assets | Every budget in non-functional.md |

## Prompts for each session

Start in plan mode (Shift+Tab twice) and paste this, replacing M1 with the milestone:

```text
Read CLAUDE.md, the M1 section of docs/milestones.md and every doc it lists under Read.
Propose a step-by-step plan for M1 only: files to create or change, the tests you will
write (named by acceptance-criteria ID), and anything in the docs that is unclear or
contradictory. Do not write code yet.
```

After you have corrected and approved the plan, leave plan mode and paste:

```text
Implement the approved plan. Run pnpm lint, pnpm typecheck and pnpm test (and
pnpm test:e2e if the milestone touches the browser). Tick the criteria you completed in
docs/user-flows.md. Stop at the end of the milestone and summarize what changed.
```

## M0 Project setup

Read: architecture.md, conventions.md, the color and type tokens in ui.md.

- Scaffold WXT with React and TypeScript using pnpm; add every package in the architecture.md stack table.
- Write `wxt.config.ts` as specified, and `theme.css` with the ui.md tokens and fonts.
- The service worker calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
- The panel shows the header and an empty Home screen in the dark theme.
- Add the CI workflow, the manifest permission test, LICENSE (MIT) and a README stub.

Done when AC-F1.1 passes, a production build loads unpacked, and CI is green.

## M1 Messaging and errors

Read: api.md (messages, module APIs, error codes), sequences.md flows 1, 2 and 4.

- Write `src/messaging.ts`, the `src/platform/` wrappers and the error classifier with unit tests.
- Add an extractor stub whose `main()` returns a RawSnapshot with only `elementsSampled` filled; the real collector comes in M2.
- Implement the EXTRACT round trip, the 10 s timeout, page-change detection, the `requestId` guard and the shortcut with `pendingExtract`.
- Show plain, unstyled state screens; M4 styles them.

## M2 Collector

Read: data-model.md (RawSnapshot), api.md (`collect`), non-functional.md (budgets, edge cases).

- Walk visible elements with a TreeWalker in slices of 200 and yield between slices; stop at 4,000 elements or 1.5 s and set `truncated`.
- Read the computed properties, weight fills by visible area and text by character count, and aggregate into ValueStats.
- Parse readable stylesheets for custom properties and @media breakpoints; count unreadable ones.
- Collect component samples for buttons, inputs, links and headings.
- Write the synthetic fixture pages and the end-to-end tests that run the collector on them. Keep the extractor bundle at 50 KB or less.

## M3 Analysis engine

Read: data-model.md (types and naming rules), user-flows.md F2 to F5.

- Build the worker and `analyze()` with the four progress stages.
- Normalize, merge colors within OKLab 0.02, drop values under 0.5%, assign families, steps and roles, and resolve step collisions.
- Build the type scale, spacing base unit, radii, shadows, breakpoints and recipes with token references.
- Unit-test each stage against saved fixture snapshots, and confirm AC-F1.4 end to end.

## M4 Results UI

Read: ui.md (all of it), user-flows.md.

- Build Home, Extracting, the Results header and the Colors, Type, Layout and Components tabs to the wireframes.
- Style every state screen from the ui.md states table.
- Add copy-on-swatch with the toast, and Re-run in the results menu.
- Test that the whole results view works with the keyboard alone.

## M5 Edit and history

Read: api.md (`applyEdit`, storage), data-model.md (storage schema), sequences.md flows 5 and 7.

- Write `applyEdit` with unit tests for every edit kind and error.
- Add token menus (Rename, Set role, Merge into, Exclude) and the excluded rows.
- Add IndexedDB storage, the 500 ms autosave, Reset to extracted with a confirmation, the History screen, Recent on Home and the delete dialogs.

## M6 Exporters

Read: api.md (export formats), sequences.md flow 6.

- Write the five exporters and the zip, with a snapshot test per fixture.
- Check the tokens.json value shapes against the current DTCG spec and add a fixture test for them.
- Build the Export tab: format picker, preview, Copy, Download, Download all, the line and size footer, and the remembered format.

## M7 Hardening and release

Read: non-functional.md, the success criteria in product-brief.md.

- Add the production CSP, the no-network test, the size checks, the long-task check and the keyboard-only test.
- Walk the edge-case table and fix anything that fails.
- Run the 20-site accuracy check by hand and tune the start values if needed, updating the docs.
- Write the README with screenshots and CONTRIBUTING, prepare the store listing text and 1280 x 800 screenshots, and build the 1.0.0 zip.
