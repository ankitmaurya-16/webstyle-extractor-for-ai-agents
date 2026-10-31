# Product brief

WebStyle Extractor for AI Agents turns the website in the current tab into a DESIGN.md and token files that an AI coding agent follows. One click, nothing leaves the browser, free and open source. v2 adds themes, interaction states, more token categories, more export formats, a headless CLI, a light panel theme and a Firefox build. The full v2 specification is [docs/v2-spec.md](v2-spec.md).

## Problem

AI coding agents read files but cannot see a live website. Developers hand them screenshots (lossy), values copied from DevTools (slow) or raw CSS (noisy), so agent-written UI drifts from the brand and needs repeated correction.

## Users

| User | Job to be done | Priority |
| --- | --- | --- |
| Developer building with Claude Code, Cursor or a similar agent | Make my app match my brand site or a reference without describing every value | Primary |
| Freelance or agency frontend developer | Get a client's real tokens in minutes when no design system is documented | Primary |
| Developer migrating a legacy site | Capture the existing visual language before rewriting it in Tailwind or React | Secondary |
| An AI agent working without a human | Extract a site's design system itself from the command line | Secondary (v2) |

## Core features

F1 to F8 shipped in v1.0. F9 to F44 are v2; their details and acceptance criteria are in [docs/v2-spec.md](v2-spec.md) section 8.

| ID | Feature | Summary |
| --- | --- | --- |
| F1 | Extract | One click or Alt+Shift+D reads the current page's styles |
| F2 | Colors | Merged, ranked colors with semantic roles and numeric scales such as gray-100 to gray-900 |
| F3 | Typography | Font families, type scale, weights, line heights, heading map |
| F4 | Layout tokens | Spacing scale with a base unit, radii, shadows, breakpoints |
| F5 | Component recipes | Button, input, link and h1 to h6 styles, expressed in tokens |
| F6 | Review and edit | Rename, set role, merge, exclude, reset to extracted values |
| F7 | Export | DESIGN.md and token files; copy, download or zip |
| F8 | History | Every extraction saved locally; reopen or delete |
| F9 | Translucent colors | Blended over their backdrop, named `<base>/<alpha%>`, real alpha kept |
| F10 | Site variable names | The site's own custom property names become token names |
| F11 | Framework detection | Tailwind, Bootstrap, MUI, Chakra, shadcn/ui, Radix Themes, Ant Design, Bulma |
| F12 | Interaction states | Hover, focus, active and the focus ring, from stylesheets or forced states |
| F13 | Light and dark themes | Paired semantic tokens for both themes |
| F14 | Motion | Durations and easings |
| F15 | Text styles | Letter spacing, text transform and composite text styles |
| F16 | Layout structure | Containers, grid columns and gaps |
| F17 | Layout values | Z-index layers, opacity and border widths |
| F18 | Gradients | Linear, radial and conic gradients with token stops |
| F19 | Web fonts | `@font-face` families, weights and provider (names only) |
| F20 | More components | Card, badge, nav bar, tabs, alert and table recipes |
| F21 | Icon library detection | Lucide, Heroicons, Font Awesome, Material, Bootstrap Icons, Phosphor, Tabler, Remix |
| F22 | Coverage | Open shadow roots, same-origin iframes and opt-in auto-scroll |
| F23 | Advanced capture | Optional debugger: deep scan of every stylesheet, dark emulation, forced states |
| F24 | Responsive capture | Type, container, grid and spacing at several widths |
| F25 | Multi-page merge | Add pages of one site to one snapshot |
| F26 | Element picker | Extract one component from the page |
| F27 | Contrast check | WCAG 2.x contrast for text pairs, the focus ring and input borders |
| F28 | Confidence | A score, level and reasons for every token, role, recipe and detection |
| F29 | Consistency report | Near-duplicates, off-scale spacing, distinct counts, contrast failures |
| F30 | Where is this used? | Temporary outlines on the page for a token |
| F31 | shadcn/ui export | `shadcn-theme.css` in oklch or legacy HSL |
| F32 | Agent rule exports | AGENTS.md block, `.cursor/rules` file and CLAUDE.md block |
| F33 | Compact prompt | `prompt.md`, 40 lines or fewer, for chat-based builders |
| F34 | Style guide | Self-contained `styleguide.html` |
| F35 | Figma variables | Three DTCG files for Figma's native variable import |
| F36 | Component screenshots | Opt-in PNGs of components, stored locally |
| F37 | Write to project | Write the export straight into a linked folder |
| F38 | Map to my tokens | Match extracted tokens to your own token file |
| F39 | Snapshot diff | Compare two snapshots |
| F40 | Snapshot import and export | `.webstyle.json` files |
| F41 | Headless CLI | `npx webstyle-extractor extract <url>` |
| F42 | Panel light theme | System, Dark or Light appearance |
| F43 | Firefox and Edge | A Firefox MV3 build; the Chrome build runs on Edge |
| F44 | Localization | Every UI string in `messages.json` through `t()`; English ships |

## Not building

Agents tend to over-build. None of the following is in v2, even if it seems helpful:

- Accounts, login, cloud sync, a backend or a server of any kind
- Calls to any AI model or external API
- Payments, licenses, a Pro tier, upsells or donation prompts inside the UI
- Analytics, telemetry or error-reporting services, in the extension or the CLI
- Copying HTML, layouts, images, logos, icons or font files (opt-in component screenshots, F36, are the only page imagery kept)
- Reading or storing page text
- A popup, an options page, onboarding tours, notifications or badge counts (the side panel, or the sidebar on Firefox, is the only UI)
- Reading cross-origin iframes or closed shadow roots
- Required host permissions or declared content scripts; optional permissions beyond `debugger` and per-site host access
- Generating shades or any value not found on the page
- Toggling a site's theme class or attribute on the page
- Safari builds, right-to-left layouts, APCA contrast and an overall consistency score
- Shipping languages other than English (the infrastructure exists; see CONTRIBUTING.md)

Built in v2 after being "later" in v1: multi-page merge, element picker, hover and focus states, dark-mode capture, deep scan of cross-origin stylesheets, component screenshots, AGENTS.md and `.cursor/rules` formats, the light theme and the Firefox build.

## Success criteria for v2.0

Targets we set, not industry benchmarks (v2 spec 13.4).

| Criterion | Target |
| --- | --- |
| Base accuracy | Primary color, body font and base spacing correct on at least 18 of 20 test sites (unchanged) |
| Dark mode | Dark primary, background and text correct on at least 8 of the 10 test sites that support dark mode |
| States | Focus ring and primary button hover correct on at least 15 of 20 test sites with Advanced capture |
| Site names | On test sites that use custom properties, at least 80% of semantic roles carry the site's variable name |
| Translucency | No translucent border or muted text misnamed on the fixtures or the test sites |
| Agent usefulness | An agent given only DESIGN.md builds a button, card and input with correct states and dark mode on at least 15 of 20 test sites |
| CLI parity | Byte-identical output on every fixture |
| Privacy | The no-network test passes for every feature; the debugger is never left attached in repeated cleanup tests |
| Adoption | 500 installs and 100 GitHub stars within 60 days of v2.0 |

The v1.0 targets (speed under 3 s, no task over 50 ms, DESIGN.md under 300 lines) are replaced by the budgets in [docs/non-functional.md](non-functional.md).

## Decision log

Choices marked "Default" are sensible picks that nobody has objected to yet. Change any of them by editing this table and the doc it affects in the same change.

### v1

| Decision | Choice | Decided by |
| --- | --- | --- |
| Name | WebStyle Extractor for AI Agents | You |
| Business model | Free and open source, MIT license | You |
| Panel look | Dark developer-tool style (v2 adds a light theme, see below) | You |
| UI framework | React 19 | You |
| Language | JavaScript (JSX), not TypeScript | You |
| Token naming | Semantic aliases plus numeric hue scales, steps 100 to 900 | You |
| Tailwind exports | Both v4 and v3 | Default |
| Extension framework | WXT + Vite | Default |
| Test-only dependencies | jsdom, fake-indexeddb, eslint-plugin-react, globals, @eslint/js for tests and linting | Default |
| End-to-end build | A separate `WXT_E2E=1` build with localhost host permissions (and `debugger` as a required permission), never shipped | Default |
| Styling | Tailwind CSS v4 with Radix UI primitives | Default |
| State | Zustand | Default |
| Fonts | Inter for UI, JetBrains Mono for values, bundled through Fontsource | Default |
| Package manager | pnpm | Default |
| Scale filling | Only extracted values sit on steps; empty steps stay empty | Default |
| Tailwind v3 output | `theme.extend`, not a full theme replacement | Default |
| Re-run | Re-run replaces the current snapshot; a new Extract creates a new one | Default |
| History limit | None | Default |
| Minimum Chrome version | 116, the first with `chrome.sidePanel.open` | Default |

### v2

| Decision | Choice | Decided by |
| --- | --- | --- |
| v2 scope | Every feature F9 to F44 | You |
| Build order | Translucent colors first, then site variable names, then framework detection, then the rest | You |
| Advanced capture | One optional `debugger` permission powers deep stylesheet scan, full dark-mode emulation, forced hover/focus/active states and responsive widths. Off by default, asked on first use | Default |
| Deep scan method | Read every stylesheet's text through the debugger (`CSS.getStyleSheetText`), not `fetch`, so the extension stays network-free | Default |
| Dark mode without the debugger | Read dark overrides from readable stylesheets (`prefers-color-scheme` media blocks and `.dark` / `[data-theme]` selector blocks). Never toggle classes on the page | Default |
| States without the debugger | Match `:hover`, `:focus`, `:focus-visible` and `:active` rules in readable stylesheets against sampled elements | Default |
| Paired themes in DTCG | Two files: `tokens.json` (primitives plus light semantic) and `tokens.dark.json` (dark semantic overrides) | Default |
| Translucent naming | `<base>/<alpha%>` rounded to the nearest 5, such as `black/10` or `blue-600/20` | Default |
| Site variable names | Used as the primary token name when they match; the generated scale name is kept as an alias. On by default, switchable in Settings | Default |
| Token naming for new categories | Numeric where a value scale exists (`duration-150`, `border-2`, `z-50`), t-shirt sizes where v1 already uses them (containers, letter spacing) | Default |
| shadcn/ui export format | Current shadcn style with `oklch()` values and `:root` / `.dark` blocks; legacy HSL triplets as a Settings option | Default |
| Same-site check for merging pages | Same hostname, or hostnames sharing the last two labels; anything else asks for confirmation | Default |
| Multi-page access | "Allow on this site" requests the host permission for that one origin, so adding pages needs no toolbar click | Default |
| Screenshots storage | Separate IndexedDB store, deleted with the snapshot | Default |
| Write to project folder | File System Access API from the side panel; AGENTS.md and CLAUDE.md are edited only inside marked blocks; Tailwind v3 output is written as `design/tailwind.webstyle.js`, never over the project's own config | Default |
| Figma export | Three DTCG files in Figma's native variable import format (`design/figma/Primitives.tokens.json`, `Semantic.Light.tokens.json`, `Semantic.Dark.tokens.json`), because native import reads one file per mode | Default |
| CLI packaging | pnpm workspace package `cli/` in the same repo, published to npm as `webstyle-extractor` with the `webstyle` command | Default |
| CLI argument parsing | Node's built-in `util.parseArgs`, no extra dependency | Default |
| CLI bundling | tsup, with the collector also built as an IIFE | Default |
| Import validation | `zod` schemas for snapshot import and the CLI's JSON | Default |
| Panel theme | System by default, with Dark and Light overrides | Default |
| Firefox | Sidebar instead of side panel; Advanced capture and Write to project hidden (APIs not available); minimum Firefox 128 | Default |
| Firefox target | MV3, minimum version 128; `gecko.id` placeholder replaced before submission | Default |
| Firefox lint | web-ext (dev dependency) for `pnpm lint:firefox` | Default |
| Localization | `chrome.i18n` with `_locales/en/messages.json`; English only shipped | Default |
| DESIGN.md truncation | When over 450 lines, drop the lowest-usage scale tokens first, then low-confidence tokens, never semantic roles or rules | Default |
| Page weighting in merges | Each page contributes equally, so one long page cannot dominate | Default |
| Export language | Exported files are always English, whatever the UI language | Default |
| New dev dependencies | `eslint-plugin-i18next` (F44 lint rule), `axe-core` (style guide and panel checks), `fake-indexeddb` already in v1 | Default |
| Extra Radix primitives | @radix-ui/react-toggle-group, react-switch, react-popover for the segmented controls, switches and popovers in docs/ui.md | Default |
| Role edits on migration | v1 role edits are replayed onto the snapshot's primary theme | Default |
| Capture kind | Captures carry `kind: base \| theme \| width` so analysis can tell width captures from theme captures | Default |
| Path A theme capture | Built in the panel (and the CLI) from the base capture's stylesheet overrides, not in the page | Default |
| Root package name | webstyle-extractor-extension (private) so the CLI package can be webstyle-extractor | Default |
