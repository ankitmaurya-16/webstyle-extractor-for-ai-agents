# WebStyle Extractor for AI Agents

A Chrome extension that reads the design system of the website in your current tab (colors, typography, spacing, radii, shadows, breakpoints and component styles) and exports it as a **DESIGN.md** plus token files that an AI coding agent such as Claude Code or Cursor can follow.

One click, nothing leaves your browser. Free and open source under the MIT license.

<p>
  <img src="docs/images/colors.png" width="240" alt="Colors tab with semantic roles and hue scales">
  <img src="docs/images/components.png" width="240" alt="Components tab with a primary button recipe">
  <img src="docs/images/export.png" width="240" alt="Export tab showing DESIGN.md">
</p>

## Why

AI coding agents read files, but they cannot see a live website. Screenshots are lossy, values copied from DevTools are slow, and raw CSS is noisy, so agent-written UI drifts from the brand. WebStyle turns a page into a short, structured file of real tokens and rules the agent can follow.

## What you get

| Export               | File                 | Use it for                                                                                   |
| -------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| DESIGN.md            | `DESIGN.md`          | Drop into your repo and point your agent at it. Rules plus every token and component recipe. |
| Design tokens (DTCG) | `tokens.json`        | Style Dictionary, Figma Tokens and other tools that read the W3C Design Tokens format.       |
| Tailwind CSS v4      | `theme.css`          | `@import` it after `tailwindcss` to get `bg-primary`, `text-text-muted`, `p-4` and so on.    |
| Tailwind CSS v3      | `tailwind.config.js` | Merge into your config; it uses `theme.extend`, so Tailwind's defaults stay.                 |
| CSS variables        | `variables.css`      | Plain `:root` custom properties for any stack.                                               |

What it extracts:

- **Colors:** merged near-duplicates, ranked by usage, with semantic roles (background, surface, text, text-muted, border, primary, accent, success, warning, danger) and numeric scales such as `gray-100` to `gray-900`.
- **Typography:** font families with full stacks, a type scale (`xs` to `6xl`) with line heights and weights, and which size each heading uses.
- **Layout:** the spacing scale and its 4 or 8 px base unit, radii, shadows and `@media` breakpoints.
- **Components:** default-state recipes for primary and secondary buttons, inputs, links and h1 to h6, written in tokens (`background primary (blue-600), padding space-2 space-4`).

## Install

### From source (now)

You need Node.js 20 or newer and pnpm (`corepack enable` gives you pnpm).

```bash
git clone https://github.com/ankitmaurya-16/webstyle-extractor-for-ai-agents.git
cd webstyle-extractor-for-ai-agents
pnpm install
pnpm build
```

Then load it in Chrome (version 116 or newer):

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `.output/chrome-mv3` folder.
4. Pin **WebStyle Extractor for AI Agents** from the puzzle-piece menu so the icon is always in the toolbar.

Edge, Brave and other Chromium browsers should work the same way but are not tested.

## How to use

1. **Open a website** whose look you want to reuse: your brand site, a client site or a reference.
2. **Click the WebStyle icon** in the toolbar, or press **Alt+Shift+D**. The side panel opens.
3. **Click Extract design system.** The shortcut starts it without a click. It takes a second or two.
4. **Review the results** in the tabs:
   - **Colors:** click any swatch to copy its hex. Click a scale swatch to see its details.
   - **Type**, **Layout** and **Components:** check the families, scale, spacing and recipes.
   - Open a token's **⋯** menu to **Rename** it, **Set role** (for example make a color `primary`), **Merge into** another token, or **Exclude** it from every export. Edits save automatically. **⋯ → Reset to extracted** in the header undoes them all.
5. **Export:** open the **Export** tab, pick a format, then **Copy**, **Download**, or **Download all (.zip)** for all five files.
6. **Give it to your agent.** Save `DESIGN.md` in the root of your project and tell the agent to follow it, for example:

   > Read DESIGN.md and follow its rules. Build a pricing card and a signup form that match it.

   For Claude Code you can reference it from `CLAUDE.md` (`@DESIGN.md`); for Cursor, mention it in your rules or attach it to the chat.

Every extraction is kept in **History** (the clock icon) on your computer, so you can reopen, edit and export it later or delete it. **Re-run** in the results menu re-reads the page and replaces that snapshot.

### Tips

- **Scroll first** on pages that load content as you scroll, then extract. WebStyle reads what is rendered, up to about three screens below the fold and 4,000 elements.
- **Change the shortcut** at `chrome://extensions/shortcuts` (also linked from the panel menu).
- **Local files:** to read `file://` pages, open the extension's details in `chrome://extensions` and turn on **Allow access to file URLs**.

### When it can't read a page

| You see                 | Why                                                                                             | What to do                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Can't read this page    | Chrome blocks extensions on `chrome://` pages, the Web Store, the PDF viewer and `view-source:` | Open a regular website.                                                 |
| Give access to this tab | The extension only gets access to a tab when you click its icon or press the shortcut           | Click the toolbar icon or press Alt+Shift+D on that tab.                |
| Too little to read      | Fewer than 30 visible elements, or the page is drawn on a canvas                                | Scroll to load content and re-run. Canvas or WebGL pages can't be read. |
| Something went wrong    | The page took over 10 s, or it navigated during the run                                         | Wait for the page to finish loading and retry.                          |
| Partial banner          | Some stylesheets come from another origin and can't be read                                     | Colors, type and spacing are still read; breakpoints may be incomplete. |

## Privacy

- **No network requests.** No analytics, no remote code, no AI calls. The production build sets `connect-src 'none'`, so Chrome itself blocks any request from the extension, and an end-to-end test checks for zero requests.
- **Minimal permissions:** `activeTab`, `scripting`, `sidePanel` and `storage`. No host permissions and no content scripts, so the extension can only read a tab after you click its icon or press its shortcut on that tab.
- **Read-only.** It reads computed styles, tag names and roles. It never reads form values, cookies or storage, and uses page text only as a character count.
- **Local data.** Snapshots stay in your browser's IndexedDB until you delete them.

## Development

| Command                          | What it does                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                       | Opens Chrome with the extension loaded and hot reload                             |
| `pnpm build`                     | Production build to `.output/chrome-mv3`                                          |
| `pnpm zip`                       | Chrome Web Store zip in `.output/`                                                |
| `pnpm test`                      | Unit and component tests (Vitest)                                                 |
| `pnpm test:e2e`                  | End-to-end tests (Playwright) against the built extension and `tests/fixtures`    |
| `pnpm lint`, `pnpm format:check` | ESLint and Prettier                                                               |
| `pnpm size`                      | Checks the bundle budgets (extractor 50 KB or less, panel 250 KB gzipped or less) |

The code is JavaScript with React 19 (JSX), built with WXT and Vite, styled with Tailwind CSS v4 and Radix UI. The extension has four parts, each with one job:

```text
entrypoints/extractor.js   runs in the page on demand, reads computed styles  -> RawSnapshot
entrypoints/background.js  stateless service worker: opens the panel, injects the extractor
src/analyze/               pure analysis in a Web Worker                     -> DesignSystem
entrypoints/sidepanel/     React side panel: review, edit, history, export
src/export/                pure exporters: DESIGN.md, DTCG, Tailwind v4/v3, CSS variables
```

The full specification is in [`docs/`](docs): product brief, user flows with acceptance criteria, architecture, data model, message contracts, UI spec, non-functional requirements and milestones. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to work on the code.

## License

[MIT](LICENSE) © 2026 Ankit Maurya
