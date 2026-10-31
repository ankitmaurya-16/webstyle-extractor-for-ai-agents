# Store listings

Text and assets for the Chrome Web Store, Microsoft Edge Add-ons and addons.mozilla.org. Screenshots (1280 x 800) are in `store/` and are regenerated with `node scripts/screenshots.js`; take them in both panel themes for v2. The 128 px icon is `public/icon/128.png`. Build the uploads with `pnpm zip` (Chrome and Edge) and `pnpm zip:firefox` (Firefox); the files land in `.output/`. The name and short description in the manifest come from `public/_locales/en/messages.json` (`extName`, `extDescription`).

## Name

WebStyle Extractor for AI Agents

## Summary (132 characters max)

Extract any website's colors, fonts and spacing into a DESIGN.md your AI coding agent can follow. Free, open source, local.

## Category

Developer Tools

## Description

AI coding agents read files, but they can't see a live website. WebStyle Extractor reads the design system of the page in your current tab and writes it down in a form your agent can follow.

Click the toolbar icon or press Alt+Shift+D, then Extract. In a second or two you get:

• Colors, merged and ranked by usage, with semantic roles (background, text, primary, border, focus ring and more) and numeric scales like gray-100 to gray-900, in light and dark themes
• Translucent colors with their real alpha, gradients, and the site's own CSS variable names
• Typography: font families, web fonts, a type scale, text styles and letter spacing
• Layout tokens: spacing and its base unit, containers, grids, gaps, radii, borders, shadows, opacity, z-index layers and breakpoints
• Motion: durations and easing curves
• Component recipes for buttons, inputs, links, headings, cards, badges, nav bars, tabs, alerts and tables, with hover, focus and active states
• The framework and icon library the site uses, a contrast check, a confidence score for every token and a consistency report

Review and edit everything in the side panel: rename tokens, set roles per theme, merge near-duplicates or exclude noise. Your edits survive re-runs. Then export:

• DESIGN.md and a compact prompt for chat-based builders
• AGENTS.md, CLAUDE.md and Cursor rules for coding agents
• tokens.json (Design Tokens Community Group), Tailwind CSS v4 and v3, CSS variables and a shadcn/ui theme
• A self-contained style guide, Figma variables and a consistency report

Copy, download one file, download a zip, or write the files straight into your project folder. Add several pages of a site to one snapshot, pick a single component on the page, highlight where a token is used, compare two snapshots, or match the result to your own token file. Every extraction is saved locally in History, and you can export and import snapshots as files.

Optional Advanced capture uses Chrome's debugger, only when you turn it on, to read every stylesheet, the other color theme, hover and focus states and other screen widths. Chrome shows a "started debugging this browser" bar while it runs.

Private by design: the extension makes no network requests, has no analytics and calls no AI service. It only reads a tab after you click its icon or press its shortcut there (or after you allow a site), reads computed styles and class names rather than page content, and keeps everything in your browser. Light and dark panel themes.

Free and open source under the MIT license. A command-line version for AI agents is on npm as webstyle-extractor.

## Privacy practices

- Single purpose: extract the visual design tokens of the current page and export them as files.
- Permission justifications:
  - activeTab: read the tab the user invoked the extension on, only after a toolbar click or the shortcut.
  - scripting: inject the read-only extractor, and the element picker and highlight outlines when the user asks for them, into that tab.
  - sidePanel: the extension's only interface.
  - storage: remember settings, pass the shortcut's request to the panel, and record an in-progress capture so the debugger can be detached if the service worker restarts.
  - debugger (optional, never requested at install): used only for Advanced capture, which the user turns on with a click. While a capture runs, the extension reads the page's stylesheet text and emulates the other color scheme, hover and focus states and other screen widths through the Chrome DevTools Protocol, then detaches immediately. It never reads network traffic, cookies or page text and makes no network requests.
  - Host permissions `https://*/*` and `http://*/*` (optional, never requested at install): requested one site at a time, as exactly that site's origin, when the user clicks "Allow on this site", so they can add several pages of the site, pick elements and highlight tokens without clicking the toolbar icon on every page. Allowed sites are listed in Settings, where the user can remove them.
- Remote code: none.
- Data usage: the extension does not collect or transmit any user data. Snapshots, opt-in component screenshots and settings are stored locally in the browser and can be deleted from History. Files are written to the user's computer only when the user downloads them or links a project folder.

## Microsoft Edge Add-ons

Submit the Chrome zip unchanged after the smoke test on current Edge (extract, review, export, history, Advanced capture, write to project). Use the same name, summary, description and privacy answers.

## addons.mozilla.org

- Package: `pnpm zip:firefox`. Run `pnpm lint:firefox` first.
- Replace the placeholder `GECKO_ID` (`webstyle-extractor@example.invalid`) in `wxt.config.js` with an address you control before the first submission.
- Description: as above, without the Advanced capture paragraph and the project-folder sentence, since Firefox lacks the debugger and File System Access APIs. Add: "Opens in the Firefox sidebar. Requires Firefox 128 or newer."
- Permissions: activeTab, scripting and storage as above; the optional host permissions as above. No debugger permission.
- Source code: link the GitHub repository; reviewers can build with `pnpm install && pnpm build:firefox`.
