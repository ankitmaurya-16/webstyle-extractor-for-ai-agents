# Chrome Web Store listing

Text and assets for the store submission. Screenshots (1280 x 800) are in `store/` and are regenerated with `node scripts/screenshots.js`; the 128 px icon is `public/icon/128.png`. Build the upload with `pnpm zip` (the file lands in `.output/`).

## Name

WebStyle Extractor for AI Agents

## Summary (132 characters max)

Extract any website's colors, fonts and spacing into a DESIGN.md your AI coding agent can follow. Free, open source, local.

## Category

Developer Tools

## Description

AI coding agents read files, but they can't see a live website. WebStyle Extractor reads the design system of the page in your current tab and writes it down in a form your agent can follow.

Click the toolbar icon or press Alt+Shift+D, then Extract. In a second or two you get:

• Colors, merged and ranked by usage, with semantic roles (background, text, primary, border and more) and numeric scales like gray-100 to gray-900
• Typography: font families, a type scale with line heights and weights, and the heading sizes
• Layout tokens: the spacing scale and its base unit, radii, shadows and breakpoints
• Component recipes for buttons, inputs, links and headings, written in tokens

Review and edit everything in the side panel: rename tokens, set roles, merge near-duplicates or exclude noise. Then export:

• DESIGN.md: rules plus tokens for Claude Code, Cursor and other agents
• tokens.json in the Design Tokens Community Group format
• theme.css for Tailwind CSS v4
• tailwind.config.js for Tailwind CSS v3
• variables.css with plain CSS custom properties

Copy, download one file, or download all five as a zip. Every extraction is saved locally in History.

Private by design: the extension makes no network requests, has no analytics and calls no AI service. It only reads a tab after you click its icon or press its shortcut there, reads computed styles rather than page content, and keeps everything in your browser.

Free and open source under the MIT license.

## Privacy practices

- Single purpose: extract the visual design tokens of the current page and export them as files.
- Permission justifications:
  - activeTab: read the tab the user invoked the extension on, only after a toolbar click or the shortcut.
  - scripting: inject the read-only extractor into that tab.
  - sidePanel: the extension's only interface.
  - storage: remember the last export format and pass the shortcut's request to the panel.
- Remote code: none.
- Data usage: the extension does not collect or transmit any user data. Snapshots are stored locally in IndexedDB and can be deleted from History.
