# Privacy policy

WebStyle Extractor for AI Agents (the browser extension) does not collect, transmit, sell or share any personal or user data.

## What the extension reads

When you click its toolbar icon or press its shortcut on a tab (or on a site you have allowed in Settings), the extension reads the page's computed styles, stylesheet rules, class names, ARIA attributes and font names. It never reads page text, form values, cookies, browsing history or network traffic.

If you turn on **Advanced capture**, the extension uses Chrome's debugger, only while that capture runs, to read stylesheet text and to emulate the other color theme, hover and focus states and other screen widths. It detaches as soon as the capture ends.

If you turn on **Include screenshots**, it saves small images of the components on that page.

## Where your data goes

Nowhere. The extension makes no network requests: no analytics, no telemetry, no error reporting, no remote code and no calls to any AI service. Its content security policy blocks outgoing connections.

Snapshots, screenshots and settings are stored only in your browser (IndexedDB and extension storage). You can delete any snapshot, or all of them, from History, and removing the extension deletes everything. Files leave the browser only when you download them or write them to a project folder you chose.

## Permissions

- `activeTab`, `scripting`: read the tab you invoked the extension on.
- `sidePanel`: show the extension's panel.
- `storage`: keep your settings on this computer.
- `debugger` (optional, asked only when you turn on Advanced capture).
- Site access (optional, asked one site at a time when you click "Allow on this site"; listed and removable in Settings).

## Contact

Open an issue at https://github.com/ankitmaurya-16/webstyle-extractor-for-ai-agents/issues.

Last updated: 2026-11-16.
