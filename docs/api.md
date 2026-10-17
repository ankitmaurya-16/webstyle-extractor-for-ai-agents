# API contracts

There is no server, so the contracts are the messages between extension contexts, the public functions of each module, the error codes and the export file formats. All message types live in `src/messaging.js`. Signatures below use TypeScript notation to describe shapes; the code is JavaScript.

## Messages

| Message | Direction | Payload | Reply or effect | Errors |
| --- | --- | --- | --- | --- |
| EXTRACT | Panel to service worker, `chrome.runtime.sendMessage` | `{ type: 'EXTRACT', tabId }` | `SNAPSHOT { raw }` or `EXTRACT_ERROR { code, detail }` | RESTRICTED\_PAGE, FILE\_ACCESS, NO\_ACCESS, TIMEOUT, EMPTY\_PAGE, PAGE\_CHANGED, INJECTION\_FAILED |
| pendingExtract | Service worker to panel, through `chrome.storage.session` | `{ tabId, windowId, at }` | Panel reads it on load and on `storage.onChanged`, clears it, then sends EXTRACT | None |
| ANALYZE | Panel to analysis worker, `postMessage` | `{ type: 'ANALYZE', requestId, raw }` | PROGRESS (0 or more), then RESULT or ERROR | ANALYSIS\_FAILED |
| PROGRESS | Worker to panel | `{ type: 'PROGRESS', requestId, stage }` | Panel updates the progress list | None |
| RESULT | Worker to panel | `{ type: 'RESULT', requestId, design }` | Panel saves and shows Results | None |

The panel ignores worker messages whose `requestId` is not the current run, which handles cancelled and duplicate runs.

```ts
// src/messaging.js (shapes)
export type ExtractErrorCode =
  | 'RESTRICTED_PAGE' | 'FILE_ACCESS' | 'NO_ACCESS' | 'TIMEOUT'
  | 'EMPTY_PAGE' | 'PAGE_CHANGED' | 'INJECTION_FAILED';

export type PanelToBackground = { type: 'EXTRACT'; tabId: number };

export type BackgroundReply =
  | { type: 'SNAPSHOT'; raw: RawSnapshot }
  | { type: 'EXTRACT_ERROR'; code: ExtractErrorCode; detail?: string };

export type AnalyzeStage = 'normalize' | 'cluster' | 'roles' | 'naming';

export type PanelToWorker = { type: 'ANALYZE'; requestId: string; raw: RawSnapshot };

export type WorkerToPanel =
  | { type: 'PROGRESS'; requestId: string; stage: AnalyzeStage }
  | { type: 'RESULT'; requestId: string; design: DesignSystem }
  | { type: 'ERROR'; requestId: string; code: 'ANALYSIS_FAILED'; detail: string };
```

The `onMessage` listener is a plain function that starts the async work, calls `sendResponse` when it finishes, and returns `true` synchronously. Never pass an async function as the listener.

## Module APIs

```ts
// src/collect/index.js: runs in the page, bundled into the extractor
export interface CollectLimits {
  elementCap: number;     // default 4000
  sliceSize: number;      // default 200 elements per slice
  timeBudgetMs: number;   // default 1500
  scrollScreens: number;  // default 3 viewport heights below the fold
}
export const DEFAULT_LIMITS: CollectLimits;
export function collect(limits?: CollectLimits): Promise<RawSnapshot>;

// src/analyze/index.js: pure, runs in the worker
export function analyze(raw: RawSnapshot, onStage?: (s: AnalyzeStage) => void): DesignSystem;

// src/edit/apply-edit.js: pure
export type Edit =
  | { kind: 'rename'; tokenId: string; name: string }
  | { kind: 'setRole'; tokenId: string; role: SemanticRole }
  | { kind: 'clearRole'; role: SemanticRole }
  | { kind: 'exclude'; tokenId: string }
  | { kind: 'include'; tokenId: string }
  | { kind: 'merge'; sourceId: string; targetId: string };
export type EditResult =
  | { ok: true; design: DesignSystem }
  | { ok: false; error: 'INVALID_NAME' | 'NAME_TAKEN' | 'NOT_FOUND' | 'SAME_TOKEN' };
export function applyEdit(design: DesignSystem, edit: Edit): EditResult;

// src/export/index.js: pure; version is the extension version for every file's generated-by header
export const EXPORT_FILES: Record<ExportFormat, string>; // DESIGN.md, tokens.json, theme.css, tailwind.config.js, variables.css
export function exportDesignMd(design: DesignSystem, version: string): string;
export function exportDtcg(design: DesignSystem, version: string): string;
export function exportTailwindV4(design: DesignSystem, version: string): string;
export function exportTailwindV3(design: DesignSystem, version: string): string;
export function exportCssVars(design: DesignSystem, version: string): string;
export function exportFile(format: ExportFormat, design: DesignSystem, version: string): string;
export function exportZip(design: DesignSystem, version: string): Uint8Array;

// src/storage/snapshots.js
export function saveSnapshot(record: SnapshotRecord): Promise<void>;
export function getSnapshot(id: string): Promise<SnapshotRecord | undefined>;
export function listSnapshots(): Promise<SnapshotSummary[]>; // newest first
export function deleteSnapshot(id: string): Promise<void>;
export function deleteAllSnapshots(): Promise<number>;      // number deleted

// src/storage/settings.js
export function getSettings(): Promise<Settings>;
export function setSettings(patch: Partial<Settings>): Promise<void>;
```

## Error codes

| Code | Raised when | UI state | Message shown |
| --- | --- | --- | --- |
| RESTRICTED\_PAGE | Chrome refuses injection on chrome://, about:, view-source:, the Web Store, the PDF viewer or extension pages | Restricted | Chrome doesn't allow extensions to read this page. Open a regular website and try again. |
| FILE\_ACCESS | A file:// page and injection is refused | Restricted | To read local files, turn on "Allow access to file URLs" for this extension in chrome://extensions. |
| NO\_ACCESS | Injection refused for missing permission on a normal page | No access | Click the WebStyle icon in the toolbar, or press Alt+Shift+D, to give access to this tab. |
| TIMEOUT | No result within 10 s | Error | This page took too long to read. Wait for it to finish loading, then retry. |
| EMPTY\_PAGE | Fewer than 30 elements sampled | Thin | Found too little to read. Scroll to load the content, then re-run. Pages drawn on a canvas can't be read. |
| PAGE\_CHANGED | The tab navigated or the frame was removed during the run, or the snapshot's URL differs from the tab's URL at the start | Error | The page changed while it was being read. Try again. |
| INJECTION\_FAILED | Any other injection error | Error | Couldn't read this page. (with Copy details) |
| ANALYSIS\_FAILED | The worker threw or did not answer within 10 s | Error | Something went wrong while analyzing. (with Copy details) |
| STORAGE\_FAILED | An IndexedDB write failed | Toast; results stay visible | Couldn't save to history. Your results stay here until you close the panel. |
| CLIPBOARD\_FAILED | `navigator.clipboard.writeText` rejected | Toast | Copy failed. Use Download instead. |

The service worker classifies injection errors by matching Chrome's error text in `src/platform/errors.js`, for example "Cannot access a chrome:// URL", "The extensions gallery cannot be scripted" and "Frame with ID 0 was removed". Keep the patterns in one table with unit tests, and check them against the current Chrome version. Copy details copies the error code, Chrome's message, the extension version and the page URL, never page content.

## Export formats

All five exporters follow the same rules, and the values in the examples below are placeholders that show shape, not real output.

- Excluded tokens are omitted everywhere. Sections with no tokens are omitted.
- Order is deterministic: semantic roles in the order of the SemanticRole type, then scales with gray first and the other families in hue order, steps ascending; sizes ascending.
- Hex is lowercase. Files use LF line endings, 2-space indents and a trailing newline.
- Dates are the capture date in UTC as YYYY-MM-DD.
- Every file starts with a generated-by comment naming the version, source URL and date (as a `$description` in tokens.json).

### DESIGN.md

Rule 3 is omitted when there is no base unit, and rule 4 when there is no text role. Keep the file under 300 lines.

```markdown
# Design system: example.com

Extracted 2026-10-18 from https://example.com · light theme · WebStyle Extractor v1.0.0

## Rules for the agent

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii or shadows.
2. In components, prefer semantic color tokens (text, primary, border) over scale tokens.
3. Spacing uses a 4px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`. Secondary text is `text-muted`.
5. Match the component recipes below for buttons, inputs and links.
6. If a needed value is missing, use the nearest existing token and leave a TODO comment.

## Colors

### Semantic

| Role       | Token    | Hex     |
| ---------- | -------- | ------- |
| background | white    | #ffffff |
| text       | gray-900 | #111827 |
| primary    | blue-600 | #2563eb |

### Scales

| Token    | Hex     | Usage |
| -------- | ------- | ----- |
| gray-100 | #f3f4f6 | 12%   |
| gray-900 | #111827 | 22%   |
| blue-600 | #2563eb | 6%    |

## Typography

| Family | Stack                          |
| ------ | ------------------------------ |
| sans   | "Inter", system-ui, sans-serif |

| Token | Size | Line height | Weight | Used for |
| ----- | ---- | ----------- | ------ | -------- |
| base  | 16px | 24px        | 400    | body     |
| 4xl   | 36px | 40px        | 700    | h1       |

## Spacing

Base unit 4px: space-1 4px, space-2 8px, space-4 16px, space-6 24px, space-8 32px

## Radius

radius-sm 4px, radius-md 8px, radius-full 9999px

## Shadows

| Token     | Value                        |
| --------- | ---------------------------- |
| shadow-sm | 0 1px 2px rgb(0 0 0 / 0.05)  |

## Breakpoints

sm 640px, md 768px, lg 1024px

## Components

### Button, primary

background primary (blue-600), text white, border none, radius radius-md,
padding space-2 space-4 (8px 16px), font sans 14px/20px weight 600

## Notes

- Breakpoints are partial: 2 of 5 stylesheets could not be read.
- Extracted from one page in its light theme. Hover and focus states are not included.
```

### tokens.json (DTCG)

Groups are categories, plus `line-height` and `font-weight` groups keyed like `text`; keys drop the category prefix (`space-4` becomes `space.4`, `radius-md` becomes `radius.md`), while color keys keep scale names. Semantic colors are aliases. Follow the stable Design Tokens Community Group format at designtokens.org, and check the exact `$value` shapes for color, dimension and shadow against the spec when building M6, with a fixture test.

```json
{
  "$description": "Generated by WebStyle Extractor v1.0.0 from https://example.com on 2026-10-18",
  "color": {
    "gray-900": { "$type": "color", "$value": { "colorSpace": "srgb", "components": [0.067, 0.094, 0.153], "hex": "#111827" } },
    "text": { "$type": "color", "$value": "{color.gray-900}" }
  },
  "font": {
    "sans": { "$type": "fontFamily", "$value": ["Inter", "system-ui", "sans-serif"] }
  },
  "text": {
    "base": { "$type": "dimension", "$value": { "value": 16, "unit": "px" } }
  },
  "space": {
    "4": { "$type": "dimension", "$value": { "value": 16, "unit": "px" } }
  },
  "radius": {
    "md": { "$type": "dimension", "$value": { "value": 8, "unit": "px" } }
  }
}
```

### theme.css (Tailwind v4)

Scale tokens go in `@theme`. Semantic aliases reference other variables, so they go in `@theme inline`. With a base unit, emit only `--spacing` (Tailwind derives the multiples); with no base unit, omit it and list the raw spacing values in a comment.

```css
/* Generated by WebStyle Extractor v1.0.0 from https://example.com on 2026-10-18 */
@theme {
  --color-white: #ffffff;
  --color-gray-100: #f3f4f6;
  --color-gray-900: #111827;
  --color-blue-600: #2563eb;

  --font-sans: "Inter", system-ui, sans-serif;

  --text-base: 16px;
  --text-base--line-height: 24px;

  --spacing: 4px;

  --radius-md: 8px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --breakpoint-md: 768px;
}

@theme inline {
  --color-background: var(--color-white);
  --color-text: var(--color-gray-900);
  --color-primary: var(--color-blue-600);
}
```

### tailwind.config.js (Tailwind v3)

Uses `theme.extend` so Tailwind's defaults stay available. Semantic colors are written as resolved hex.

```js
// Generated by WebStyle Extractor v1.0.0 from https://example.com on 2026-10-18
/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        white: '#ffffff',
        gray: { 100: '#f3f4f6', 900: '#111827' },
        blue: { 600: '#2563eb' },
        background: '#ffffff',
        text: '#111827',
        primary: '#2563eb',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      fontSize: { base: ['16px', { lineHeight: '24px' }] },
      spacing: { 1: '4px', 2: '8px', 4: '16px' },
      borderRadius: { md: '8px', full: '9999px' },
      boxShadow: { sm: '0 1px 2px rgb(0 0 0 / 0.05)' },
      screens: { md: '768px' },
    },
  },
};
```

### variables.css

```css
/* Generated by WebStyle Extractor v1.0.0 from https://example.com on 2026-10-18 */
:root {
  --color-white: #ffffff;
  --color-gray-900: #111827;
  --color-blue-600: #2563eb;
  --color-text: var(--color-gray-900);
  --color-primary: var(--color-blue-600);
  --font-sans: "Inter", system-ui, sans-serif;
  --text-base: 16px;
  --text-base-line-height: 24px;
  --space-1: 4px;
  --space-4: 16px;
  --radius-md: 8px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --breakpoint-md: 768px; /* reference only: custom properties do not work inside @media */
}
```
