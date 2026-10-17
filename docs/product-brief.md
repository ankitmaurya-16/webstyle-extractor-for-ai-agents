# Product brief

WebStyle Extractor for AI Agents turns the website in the current tab into a DESIGN.md and token files that an AI coding agent follows. One click, nothing leaves the browser, free and open source.

## Problem

AI coding agents read files but cannot see a live website. Developers hand them screenshots (lossy), values copied from DevTools (slow) or raw CSS (noisy), so agent-written UI drifts from the brand and needs repeated correction.

## Users

| User | Job to be done | Priority |
| --- | --- | --- |
| Developer building with Claude Code, Cursor or a similar agent | Make my app match my brand site or a reference without describing every value | Primary |
| Freelance or agency frontend developer | Get a client's real tokens in minutes when no design system is documented | Primary |
| Developer migrating a legacy site | Capture the existing visual language before rewriting it in Tailwind or React | Secondary |

## Core features

| ID | Feature | Summary |
| --- | --- | --- |
| F1 | Extract | One click or Alt+Shift+D reads the current page's styles |
| F2 | Colors | Merged, ranked colors with semantic roles and numeric scales such as gray-100 to gray-900 |
| F3 | Typography | Font families, type scale, weights, line heights, heading map |
| F4 | Layout tokens | Spacing scale with a base unit, radii, shadows, breakpoints |
| F5 | Component recipes | Button, input, link and h1 to h6 styles, expressed in tokens |
| F6 | Review and edit | Rename, set role, merge, exclude, reset to extracted values |
| F7 | Export | DESIGN.md, tokens.json (DTCG), Tailwind v4 theme.css, Tailwind v3 config, variables.css; copy, download or zip |
| F8 | History | Every extraction saved locally; reopen or delete |

## Not building

Agents tend to over-build. None of the following is in v1, even if it seems helpful:

- Accounts, login, cloud sync, a backend or a server of any kind
- Calls to any AI model or external API
- Payments, licenses, a Pro tier, upsells or donation prompts inside the UI
- Analytics, telemetry or error-reporting services
- Copying HTML, layouts, images, logos, icons or font files
- A popup, an options page, onboarding tours, notifications or badge counts (the side panel is the only UI)
- A light theme for the panel
- Reading iframes or closed shadow roots
- Host permissions, optional permissions or declared content scripts
- Firefox or Safari builds

**Later, not now (v1.x candidates):** multi-page merge, element picker, hover and focus states, dark-mode capture, deep scan of cross-origin stylesheets, component screenshots, AGENTS.md and .cursor/rules formats, light theme, Firefox build.

## Success criteria for v1.0

| Criterion | Target |
| --- | --- |
| Accuracy | Primary color, body font family and base spacing unit correct on at least 18 of 20 test sites |
| Speed | Extraction plus analysis under 3 s on the fixture pages |
| Page impact | No main-thread task over 50 ms caused by the extractor |
| Output size | DESIGN.md under 300 lines on every fixture |
| Agent usefulness | An agent given only DESIGN.md builds an on-brand button and card on at least 15 of 20 test sites |
| Adoption | 100 installs and 10 pieces of written feedback (reviews or GitHub issues) within 30 days of launch |

## Decision log

Choices marked "Default" are sensible picks that nobody has objected to yet. Change any of them by editing this table and the doc it affects in the same change.

| Decision | Choice | Decided by |
| --- | --- | --- |
| Name | WebStyle Extractor for AI Agents | You |
| Business model | Free and open source, MIT license | You |
| Panel look | Dark developer-tool style, dark theme only | You |
| UI framework | React 19 | You |
| Language | JavaScript (JSX), not TypeScript | You |
| Token naming | Semantic aliases plus numeric hue scales, steps 100 to 900 | You |
| Tailwind exports | Both v4 and v3 | Default |
| Extension framework | WXT + Vite | Default |
| Test-only dependencies | jsdom, fake-indexeddb, eslint-plugin-react, globals, @eslint/js for tests and linting | Default |
| End-to-end build | A separate `WXT_E2E=1` build with localhost host permissions, never shipped | Default |
| Styling | Tailwind CSS v4 with Radix UI primitives | Default |
| State | Zustand | Default |
| Fonts | Inter for UI, JetBrains Mono for values, bundled through Fontsource | Default |
| Package manager | pnpm | Default |
| Scale filling | Only extracted values sit on steps; empty steps stay empty | Default |
| Tailwind v3 output | `theme.extend`, not a full theme replacement | Default |
| Re-run | Re-run replaces the current snapshot; a new Extract creates a new one | Default |
| History limit | None | Default |
| Minimum Chrome version | 116, the first with `chrome.sidePanel.open` | Default |
