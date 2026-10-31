# User flows and acceptance criteria

Each feature lists the steps a user takes, then its acceptance criteria. Every criterion has an ID, tests are named after it, and a milestone is done when its criteria are ticked.

F1 to F8 are the v1 features and keep their criteria here. Where v2 changed a v1 criterion, a note says so; the v2 rule wins. The v2 flows (F9 to F44) are summarized at the end, and their acceptance criteria live in [docs/v2-spec.md](v2-spec.md) section 8, where they are ticked.

## F1 Extract a page

1. User opens a website and clicks the toolbar icon, or presses Alt+Shift+D.
2. The side panel opens on the Home screen with the tab's hostname and an Extract button.
3. User clicks Extract. The shortcut starts it without a click.
4. The panel shows progress: Reading page, Analyzing, Saving (v2 adds Scrolling and the Advanced capture stages when they run).
5. The Results screen opens on the Colors tab.

- [x] AC-F1.1 Clicking the toolbar icon opens the side panel.
- [x] AC-F1.2 Alt+Shift+D opens the panel and starts extraction on the active tab without a second click.
- [x] AC-F1.3 Extract is disabled while a run is in progress; extra clicks or shortcut presses start nothing.
- [x] AC-F1.4 Extraction plus analysis finishes in under 3 s on every page in tests/fixtures.
- [x] AC-F1.5 The extractor causes no main-thread task over 50 ms on the large fixture, measured with a long-task PerformanceObserver.
- [x] AC-F1.6 Restricted pages (chrome://, Chrome Web Store, built-in PDF viewer, view-source:) show the Restricted state; nothing is thrown uncaught.
- [x] AC-F1.7 A file:// page without file access shows the Restricted state with steps to turn on "Allow access to file URLs". (Unit and component tests: automation cannot grant activeTab, without which Chrome hides a tab's URL.)
- [x] AC-F1.8 If Chrome refuses access to the tab, the panel shows the No access state: click the toolbar icon or press Alt+Shift+D. (v2 also offers Allow on this site.)
- [x] AC-F1.9 Fewer than 30 sampled elements shows the Thin state with a Re-run button.
- [x] AC-F1.10 No result within 10 s shows the Error state with Retry.
- [x] AC-F1.11 If the tab navigates during a run, the run is cancelled and the Error state says the page changed.
- [x] AC-F1.12 Closing the panel during a run discards the result and saves nothing.
- [x] AC-F1.13 Re-run replaces the current snapshot (same id); Extract from Home always creates a new snapshot. (v2: Re-run replaces that page's captures and replays the edit log.)

## F2 Colors

1. The Colors tab shows Semantic roles first, then Scales grouped by hue family.
2. Each row shows a swatch, token name, hex, usage share and a menu.
3. Clicking a swatch copies its hex.

- [x] AC-F2.1 Fully transparent colors are ignored. Colors with partial alpha keep it as 8-digit hex. (v2: translucent colors are blended and named `<base>/<alpha%>`, AC-F9.1 to AC-F9.9.)
- [x] AC-F2.2 Colors closer than OKLab distance 0.02 merge into one token; the most-used value wins and the rest are listed in mergedFrom.
- [x] AC-F2.3 Each color gets a hue family and a step from 100 to 900 by OKLCH lightness, using the tables in data-model.md. Pure white and black are named white and black.
- [x] AC-F2.4 When two colors land on one step, the more-used keeps it and the other moves to the nearest free step in its lightness direction; with no free step it is named `<family>-extra-<n>`.
- [x] AC-F2.5 Steps with no extracted color are left out. No shades are generated.
- [x] AC-F2.6 Semantic roles follow the rules in data-model.md: background, surface, text, text-muted, border and primary; accent, success, warning and danger only when detected. Each role points to at most one scale token. (v2: one token per role per theme, plus focus-ring and overlay.)
- [x] AC-F2.7 Primary comes from button and link colors with OKLCH chroma of at least 0.08. If none qualifies, no primary is set and the panel says "No primary color detected".
- [x] AC-F2.8 Colors under 0.5% of total weight are dropped unless they hold a semantic role.
- [x] AC-F2.9 Clicking a swatch copies the hex and shows a "Copied" toast for 1.5 s.

## F3 Typography

1. The Type tab shows font families, then the size scale as live text samples, then the heading map.

- [x] AC-F3.1 Families show their full declared stack with quotes normalized, named sans, serif, mono or display (display = used only on headings).
- [x] AC-F3.2 rem and em values convert to px using the page's root font size.
- [x] AC-F3.3 Sizes under 0.5% of text weight are dropped.
- [x] AC-F3.4 The most-used body size is named base; smaller sizes are sm and xs, larger are lg, xl, 2xl up to 6xl.
- [x] AC-F3.5 Each size shows its most common line height and weight.
- [x] AC-F3.6 h1 to h6 map to sizes when those elements exist; missing headings are omitted.

## F4 Layout tokens

1. The Layout tab shows the spacing scale as bars, then radii, shadows and breakpoints with previews.

- [x] AC-F4.1 The base unit is 4 or 8 px, whichever more spacing weight is an exact multiple of; ties go to 4. Because every multiple of 8 is also a multiple of 4, 8 wins only when it covers 60% of the weight and no value used enough to become a token (0.5%) sits on an odd multiple of 4. If neither covers 60% of the weight, the base is none and raw values are listed.
- [x] AC-F4.2 With a base unit, spacing tokens are named space-n where n is the value divided by the base; values within 1 px snap to the nearest multiple.
- [x] AC-F4.3 Radii are deduplicated and named radius-sm, radius-md, radius-lg and upward in ascending order; 9999px or 50% is radius-full.
- [x] AC-F4.4 Up to 6 shadows are kept by usage and named shadow-sm to shadow-2xl by blur radius; with 6, the smallest is shadow-xs.
- [x] AC-F4.5 Breakpoints come from min-width and max-width @media rules in readable stylesheets, named sm, md, lg, xl, 2xl in ascending order.
- [x] AC-F4.6 With no readable stylesheet, Breakpoints says "Not readable on this site" and DESIGN.md marks it partial.

## F5 Component recipes

1. The Components tab shows one card per recipe (primary button, secondary button, input, link, h1 to h6) with a live preview drawn from the tokens and its property list.

- [x] AC-F5.1 Buttons are `button` elements, `input` of type button or submit, and elements with `role="button"`.
- [x] AC-F5.2 The most common button style is primary when its background is the primary color; the next distinct style is secondary. At most two button recipes.
- [x] AC-F5.3 Inputs are text-like `input` elements, `textarea` and `select`; the most common style becomes the recipe.
- [x] AC-F5.4 The link recipe comes from `a` elements inside running text, excluding links styled as buttons.
- [x] AC-F5.5 Each recipe lists background, text color, border, radius, padding, font family, size, weight, line height and shadow.
- [x] AC-F5.6 A recipe value that matches a token is shown and exported as a token reference (for example blue-600); otherwise as the raw value.
- [x] AC-F5.7 Recipes capture the default state only. Hover and focus are not read. (Superseded in v2 by F12: recipes carry hover, focus and active states.)

## F6 Review and edit

1. User opens a token's menu: Rename, Set role, Merge into, Exclude.
2. Changes apply at once to the lists and the export preview.
3. Reset to extracted, in the results menu, restores the original analysis after a confirmation.

- [x] AC-F6.1 Rename accepts lowercase letters, digits and hyphens, starting with a letter and unique within its category. Invalid names show an inline error and change nothing.
- [x] AC-F6.2 Set role moves the role away from any other token, so a role always points to one token.
- [x] AC-F6.3 Merge into adds the source's usage to the target, records the source hex in mergedFrom and removes the source.
- [x] AC-F6.4 Exclude dims the token and hides it from every export; Include restores it. Excluded tokens collapse into an "N excluded" row per section.
- [x] AC-F6.5 Excluding a token clears any semantic role on it, and recipes that referenced it fall back to raw values.
- [x] AC-F6.6 Every edit goes through the pure `applyEdit` function, covered by unit tests.
- [x] AC-F6.7 Edits save to IndexedDB within 500 ms and survive closing the panel.
- [x] AC-F6.8 Reset to extracted asks for confirmation, then replaces the edited copy with the extracted copy. (v2: it also clears the edit log.)

## F7 Export

1. User opens the Export tab and picks a format.
2. A preview shows the exact file content.
3. User clicks Copy, Download or Download all (.zip).

- [x] AC-F7.1 Formats are DESIGN.md, tokens.json, theme.css (Tailwind v4), tailwind.config.js (Tailwind v3) and variables.css, as specified in api.md. (v2: 13 formats, and the Tailwind v3 file is `tailwind.webstyle.js`.)
- [x] AC-F7.2 The preview is exactly the text that is copied or downloaded, and it updates immediately after an edit.
- [x] AC-F7.3 Copy writes the text to the clipboard and shows "Copied". If the write fails, a toast suggests Download.
- [x] AC-F7.4 Download saves `<hostname>-<filename>`, for example `example.com-DESIGN.md`.
- [x] AC-F7.5 Download all saves `<hostname>-webstyle.zip` containing all five files. (Superseded in v2: the zip holds the formats in the export selection at the paths in the api.md file map.)
- [x] AC-F7.6 Excluded tokens never appear in any export.
- [x] AC-F7.7 DESIGN.md stays under 300 lines on every fixture. (v2: under 450 lines, with the truncation rule in api.md.)
- [x] AC-F7.8 The same DesignSystem always produces byte-identical output, enforced by snapshot tests.
- [x] AC-F7.9 The last chosen format is remembered in chrome.storage.local.

## F8 History

1. User opens History from the header.
2. Snapshots are listed newest first with hostname, date and a strip of the top five colors.
3. User opens one to see its results, or deletes it.

- [x] AC-F8.1 Every completed extraction saves a SnapshotRecord as defined in data-model.md. (v2: a SnapshotRecordV2.)
- [x] AC-F8.2 History lists snapshots newest first with hostname, relative date and the top five colors by usage.
- [x] AC-F8.3 Opening a snapshot shows its Results using the edited copy.
- [x] AC-F8.4 Delete asks for confirmation; Delete all asks for confirmation and states how many snapshots it removes.
- [x] AC-F8.5 With no snapshots, History shows the empty state with an Extract button.
- [x] AC-F8.6 The Home screen lists the three most recent snapshots under Recent.

## v2 flows

Steps for each v2 feature. Acceptance criteria: v2 spec section 8, under the same feature ID.

### Read more from a page (F9 to F22)

1. User extracts as in F1. Nothing new to click: translucent colors (F9), site variable names (F10), framework (F11), states and the focus ring from stylesheets (F12), the other theme from stylesheet overrides (F13 Path A), motion (F14), text styles (F15), layout structure and values (F16, F17), gradients (F18), web fonts (F19), more components (F20), icons (F21), open shadow roots and same-origin iframes (F22) are read in the same run.
2. Optional: before extracting, turn on "Scroll to load content" on Home (F22). The page scrolls down, then back to where it was.
3. In Results, the Light / Dark switch shows each theme when both exist. Colors gains Translucent and Gradients, Type gains Web fonts, Text styles and Letter spacing, Layout gains Containers, Grid, Gaps, Borders, Opacity, Z-index and Responsive, the new Motion tab lists durations and easings, and the Components tab has the focus ring card and a state switcher.
4. A token's menu offers "Use site name" or "Use generated name". Settings has the global "Use site variable names" switch.

Criteria: AC-F9.1 to AC-F22.7.

### Advanced capture (F23, F24, and the forced paths of F12 and F13)

1. User turns on "Advanced capture" on Home. The first time, Chrome asks for the debugger permission. Declining shows DEBUGGER_DENIED and turns the switch off; basic extraction still works.
2. "Options" on Home sets Deep scan, Dark theme, Hover and focus states, and Widths (default 375, 768 and 1280).
3. User clicks Extract. Chrome shows its "started debugging this browser" bar while the stages run; the progress list shows each one.
4. Results open as usual. A failed stage shows the CAPTURE_PARTIAL banner while the rest is kept. The Layout tab gains the Responsive section.
5. Settings, Capture, shows the permission with Revoke.

Criteria: AC-F23.1 to AC-F23.10, AC-F24.1 to AC-F24.7, AC-F12.5, AC-F13.3.

### Several pages (F25)

1. With a snapshot open, the user navigates the tab to another page of the site and chooses "Add this page" in the Results menu.
2. A page on another site asks for confirmation (CROSS_SITE_PAGE).
3. The "N pages" chip lists the pages; any page but the last can be removed.
4. "Allow on this site" grants access to that one origin so later pages need no toolbar click. Settings, Allowed sites, removes it.

Criteria: AC-F25.1 to AC-F25.9.

### Element picker (F26)

1. User clicks "Pick element" on Home or in the Results menu.
2. The Picking screen shows instructions and the current element. On the page the hovered element is outlined; arrows move to the parent or first child, Enter or a click selects, Escape cancels. The Parent, Child and Select buttons in the panel do the same.
3. The component is extracted and saved as a component snapshot, renamable. Its Components tab shows "Picked component" first. "Add to snapshot…" copies the recipe into another snapshot as variant `picked`.

Criteria: AC-F26.1 to AC-F26.11.

### Trust and review (F27 to F30)

1. The Insights tab shows Framework, Icons, Accessibility (contrast pairs, failing filter, non-text checks), Consistency (counts with lists), "Check these first" and the coverage line.
2. Rows show confidence dots with reasons; lists can sort "Low confidence first".
3. With "Highlight on page" on in Settings, token rows and recipe cards show an eye button. It outlines matching elements and shows the count; clicking again, another token, navigation or closing the panel clears it.

Criteria: AC-F27.1 to AC-F30.9.

### Outputs (F31 to F40)

1. The Export tab lists 13 formats, with "Copy prompt" next to the picker, the shadcn format choice and Figma help text.
2. The checklist sets which formats go into "Download all (.zip)" and project writes.
3. Settings, Projects: "Link a project folder", edit its file map, then "Write to {project}" in the Export tab writes the files and shows a new, updated and unchanged summary.
4. "Include screenshots" (Home and Settings) saves component pictures locally; they export to `design/screenshots/`.
5. "Map to my tokens" (Results menu or Export tab) reads a DTCG, CSS variables or Tailwind v4 `@theme` file and shows matches; "Use my token names in exports" renames matched tokens; "Export mapping.md" saves the table.
6. "Compare with…" in Results, or Select two and Compare in History, opens the Diff screen with "Export diff.md".
7. "Export snapshot" in Results, and Import, Export all and Export selected in History, read and write `.webstyle.json` files.

Criteria: AC-F31.1 to AC-F40.8.

### Platform (F41 to F44)

1. CLI: `npx webstyle-extractor extract https://example.com --out .` writes the file map plus `snapshot.webstyle.json`; `diff` and `map` read those files. See cli/README.md.
2. Settings, Appearance: System, Dark or Light.
3. Firefox: build with `pnpm build:firefox`; Advanced capture and Write to project are hidden.
4. Every UI string comes from `messages.json`; exports stay English.

Criteria: AC-F41.1 to AC-F44.6.
