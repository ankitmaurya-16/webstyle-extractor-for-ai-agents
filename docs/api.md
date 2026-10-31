# API contracts

There is no server, so the contracts are the messages between extension contexts, the public functions of each module, the error codes and the export file formats. All message types and timeouts live in `src/messaging.js`. Signatures below use TypeScript notation to describe shapes; the code is JavaScript.

## Messages

### Panel port

The panel opens a long-lived port on load: `chrome.runtime.connect({ name: 'panel' })` (`PANEL_PORT`). EXTRACT, CANCEL, PICK_START, PICK_STOP, PICK_KEY, HIGHLIGHT_SHOW and HIGHLIGHT_CLEAR go over it, and replies come back on it. When the port disconnects (panel closed or reloaded), the service worker aborts every run the port started, which detaches the debugger, and removes the picker and highlight overlays from every tab the port touched. If the service worker restarts, the panel reconnects on the next message and pending replies resolve to nothing.

### Panel and service worker

| Message | Direction | Payload | Reply or effect |
| --- | --- | --- | --- |
| EXTRACT | Panel to service worker, over the port (or `runtime.sendMessage`, without progress or cancel) | `{ type, requestId, tabId, intent: 'new' \| 'rerun' \| 'add-page' \| 'component', snapshotId, rootSelector, autoScroll, advanced: AdvancedOptions \| null, screenshots }` | `CAPTURES { requestId, captures, warnings, screenshots }` or `EXTRACT_ERROR { requestId, code, detail? }` |
| EXTRACT_PROGRESS | Service worker to panel | `{ type, requestId, stage: 'scrolling' \| 'reading' \| AdvancedStage }` | Panel updates the progress list |
| CANCEL | Panel to service worker | `{ type, requestId }` | Aborts the run and detaches the debugger; no reply |
| PICK_START | Panel to service worker | `{ type, tabId }` | Injects the picker; replies `PICK_READY { tabId }` or `EXTRACT_ERROR` (PICK_FAILED, or an access code) |
| PICK_KEY | Panel to service worker | `{ type, tabId, key: 'ArrowUp' \| 'ArrowDown' \| 'Enter' }` | Forwards the key to the page picker (Picking screen buttons) |
| PICK_STOP | Panel to service worker | `{ type, tabId }` | Removes the picker overlay |
| PICK_HOVER | Picker to panel, `runtime.sendMessage` | `{ type, tag, width, height }` | Panel shows the current element |
| PICK_RESULT | Picker to panel | `{ type, selector, rect, tag, role }` | Panel sends EXTRACT with `intent: 'component'` and `rootSelector` |
| PICK_CANCELLED | Picker to panel | `{ type }` | Panel returns to the previous screen |
| HIGHLIGHT_SHOW | Panel to service worker | `{ type, tabId, tokenId, match: { property, values, anyColor? } }` | Injects or updates the highlighter; replies `HIGHLIGHT_COUNT { count, tokenId, error? }` |
| HIGHLIGHT_CLEAR | Panel to service worker | `{ type, tabId }` | Removes outlines |
| pendingExtract | Service worker to panel, through `chrome.storage.session` | `{ tabId, windowId, at }` | Panel reads it on load and on `storage.onChanged`, ignores it after 10 s, clears it, then extracts |

`CAPTURES.captures` holds the base capture plus any Advanced theme and width captures; the panel adds the Path A `stylesheet-override` capture itself. `CAPTURES.screenshots` holds up to one `{ mode, dataUrl, at, dpr, representatives }` viewport image per theme when screenshots were asked for; the panel crops them. `warnings` lists failed Advanced stages (CAPTURE_PARTIAL).

The highlight `match` comes from `highlightMatch(design, tokenId)` in `src/model/highlight.js`: `property` is one of `color` (with `anyColor: true`, matching text, background, border and outline colors), `font-family`, `font-size`, `letter-spacing`, `padding`, `gap`, `border-radius`, `border-width`, `box-shadow`, `opacity`, `z-index`, `transition-duration`, `background-image`, or `selector` for a recipe's representative selector.

Permission requests (`chrome.permissions.request` for `debugger` and site access) and `showDirectoryPicker` run directly in the panel through `src/platform/` and `src/project/`, not as messages, because they must happen inside the user's click.

The `onMessage` listener is a plain function that starts the async work, calls `sendResponse` when it finishes, and returns `true` synchronously. Never pass an async function as the listener.

### Panel and analysis worker

| Message | Direction | Payload | Reply |
| --- | --- | --- | --- |
| ANALYZE | Panel to worker | `{ type, requestId, captures, edits, options: { useSiteVariableNames, advanced, deepScan, partial } }` | PROGRESS (0 or more), then `RESULT { requestId, extracted, edited, staleEdits }` or `ERROR { requestId, code: 'ANALYSIS_FAILED', detail }` |
| MAP | Panel to worker | `{ type, requestId, design, fileText, fileName }` | `MAP_RESULT { requestId, mapping }` or `ERROR` with `MAPPING_PARSE_FAILED` |
| DIFF | Panel to worker | `{ type, requestId, a, b }` (two DesignSystemV2) | `DIFF_RESULT { requestId, diff }` |
| PROGRESS | Worker to panel | `{ type, requestId, stage }` | Panel updates the progress list |

Analysis stages, in order (`ANALYZE_STAGES`): `normalize`, `translucency`, `variables`, `cluster`, `roles`, `typography`, `layout`, `motion`, `components`, `detect`, `contrast`, `confidence`, `audit`, `naming`, then the worker reports `replay`.

The panel ignores worker and port messages whose `requestId` is not the current run, which handles cancelled and duplicate runs. The worker is terminated after every request.

### Timeouts and limits

| Constant | Value |
| --- | --- |
| `EXTRACT_TIMEOUT_MS` | 10 s for the basic capture, plus 6 s with auto-scroll |
| `STAGE_TIMEOUT_MS` | 8 s per Advanced stage |
| `ADVANCED_TIMEOUT_MS` | 20 s for the whole Advanced plan |
| `ANALYZE_TIMEOUT_MS` | 10 s |
| `PENDING_EXTRACT_MAX_AGE_MS` | 10 s |
| `MIN_ELEMENTS` | 30 (1 for a component capture) |

## Module APIs

```ts
// src/collect/index.js: runs in the page, bundled into extractor.js
export const DEFAULT_LIMITS: { elementCap: 4000; sliceSize: 200; timeBudgetMs: 1500; scrollScreens: 3 };
export const FRAME_ELEMENT_CAP = 1000;
export const COMPONENT_ELEMENT_CAP = 1500;
export function collect(options?: {
  autoScroll?: boolean; rootSelector?: string | null; sheetTexts?: string[]; // deep-scan texts
}): Promise<RawSnapshotV2>;
// entrypoints/extractor.js installs self.__webstyle = { collect, readRecipe(selector) } once per frame.

// src/advanced/plan.js
export function planWidths(widths: number[], currentWidth: number): number[];
export function planStages(options: AdvancedOptions, baseRaw: RawSnapshotV2): string[];
export function canEmulateTheme(raw: RawSnapshotV2): boolean; // media mechanism with no theme selector
export function runAdvancedPlan(input: {
  cdp: CdpClient; baseRaw: RawSnapshotV2; options: AdvancedOptions;
  collect: (opts) => Promise<RawSnapshotV2>; readRecipe: (selector: string) => Promise<object | null>;
  onStage?: (stage: string) => void; signal?: AbortSignal; onThemeCaptured?: (mode) => Promise<unknown>;
}): Promise<{ base: RawSnapshotV2; extra: Array<{ mode; kind; method; viewportWidth; raw }>; failed: string[] }>;

// src/advanced/cdp-client.js
export function chromeDebuggerClient(chromeApi, tabId): CdpClient & { attach(): Promise<void>; attached: boolean };

// src/analyze/index.js: pure, runs in the worker and the CLI
export const ANALYZE_STAGES: string[];
export function analyze(captures: Capture[], options?: { useSiteVariableNames?: boolean; advanced?: boolean;
  deepScan?: boolean; partial?: string[] }, onStage?: (stage: string) => void): DesignSystemV2;

// src/analyze/assemble.js: shared by the panel and the CLI
export function withOverrideCapture(captures: Capture[], newId: () => string): Capture[]; // adds Path A
export function toCapture(raw: RawSnapshotV2, newId: () => string, extra?: Partial<Capture>): Capture;

// src/edit/apply-edit.js: pure
export const NAME_PATTERN: RegExp; // lowercase letters, digits, hyphens; optional '/<alpha>' suffix
export type EditResult =
  | { ok: true; design: DesignSystemV2 }
  | { ok: false; error: 'INVALID_NAME' | 'NAME_TAKEN' | 'NOT_FOUND' | 'SAME_TOKEN' };
export function applyEdit(design: DesignSystemV2, edit: Edit): EditResult;
export function replay(extracted: DesignSystemV2, edits: Edit[]): { design: DesignSystemV2; staleEdits: number };

// src/export/index.js: pure; version is the extension version for every generated-by header
export function renderFormat(format: ExportFormat, design, version, ctx?): Array<{ path: string; text: string }>;
export function exportFile(format: ExportFormat, design, version, ctx?): string; // the preview and Copy text
export function exportFiles(design, version, opts?: { formats?: ExportFormat[]; ctx?; includeScreenshots?: boolean }):
  Array<{ path: string; text?: string; bytes?: Uint8Array }>;
export function exportZip(design, version, opts?): Uint8Array;
export function downloadName(design, format): string; // '<hostname>-<file>'
export function zipName(design): string;              // '<hostname>-webstyle.zip'
// ctx: { shadcnFormat?: 'oklch' | 'hsl'; mapping?: TokenMapping; screenshots?: [...] }
// Per format: exportDesignMd, exportPrompt, exportDtcg, exportTailwindV4, exportTailwindV3,
// exportCssVars, exportShadcn, exportStyleguide, exportAgentsMd, exportCursorRules,
// exportClaudeMd, exportAuditMd; dtcg.js exportDtcgFiles; figma.js exportFigmaFiles.

// src/export/files.js
export const FILE_MAP: Record<ExportFormat, string[]>;
export const EXPORT_LABELS: Record<ExportFormat, string>;
export const SCREENSHOTS_DIR = 'design/screenshots/';
export function screenshotPath(recipe, mode): string;
export function isValidRelativePath(path: string): boolean; // relative, no '..', no leading '/'

// src/export/agents.js
export function mergeMarkedBlock(existing: string | null, block: string): string; // F32

// src/diff/index.js, src/diff/diff-md.js: pure
export function diffDesigns(a: DesignSystemV2, b: DesignSystemV2): Diff;
export function exportDiffMd(diff: Diff): string;

// src/mapping/index.js, apply.js, mapping-md.js: pure
export const COLOR_EXACT = 0.005; export const COLOR_CLOSE = 0.02;
export function parseTokenFile(text: string, fileName?: string): UserToken[]; // DTCG, CSS vars, @theme
export function mapTokens(design, fileText: string, fileName: string, now?: number): TokenMapping;
export function mappingCounts(mapping: TokenMapping): { exact: number; close: number; none: number };
export function applyMapping(design, mapping: TokenMapping): DesignSystemV2;
export function exportMappingMd(design, mapping: TokenMapping): string;

// src/contrast/index.js, src/audit/index.js, src/detect/*.js: pure
export function contrastRatio(a: Hex, b: Hex): number;
export function contrastResults(samplesByMode, colorTokens): ContrastResult[];
export function buildAudit(input): AuditReport;
export function detectFrameworks(hits: SignalHit[]): Detection[];
export function detectIcons(hits: SignalHit[]): Detection[];

// src/io/index.js: pure, zod schemas
export const FORMAT = 'webstyle-snapshots'; export const VERSION = 2;
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export function exportFileName(records, now?): string;
export function exportSnapshots(records, opts?: { screenshots?; now? }): string;
export function importSnapshots(text: string, opts?: { existingIds?: Set<string>; newId?: () => string }):
  { snapshots; screenshots; migrated: number; copies: number }; // throws ImportError { code, problem }

// src/project/index.js
export function defaultFileMap(): Record<string, string>;
export function fileMapErrors(fileMap): string[]; // formats whose path is invalid
export function mapFiles(files, fileMap): Array<{ path; text?; bytes? }>;
export function planWrites(files, existing): Array<{ path; status: 'new' | 'updated' | 'unchanged'; next }>;
export function writeToProject(root: FileSystemDirectoryHandle, files):
  Promise<Array<{ path: string; status: 'new' | 'updated' | 'unchanged' | 'failed'; code?: string; error?: string }>>;
export function ensurePermission(handle): Promise<boolean>; // queryPermission, then requestPermission
export function fileSystemSupported(): boolean;

// src/storage/snapshots.js
export function saveSnapshot(record: SnapshotRecordV2): Promise<void>;
export function getSnapshot(id: string): Promise<SnapshotRecordV2 | undefined>;
export function listSnapshots(): Promise<SnapshotSummaryV2[]>; // newest first
export function deleteSnapshot(id: string): Promise<void>;      // also deletes its screenshots
export function deleteAllSnapshots(): Promise<number>;
export function saveScreenshots(items): Promise<void>;
export function getScreenshots(snapshotId: string): Promise<object[]>;
export function listProjects(): Promise<ProjectLink[]>;
export function saveProject(project: ProjectLink): Promise<void>;
export function deleteProject(id: string): Promise<void>;
export function takeMigrationNotice(): Promise<{ snapshots: number; droppedEdits: number } | null>;
export function makeRecord(input): SnapshotRecordV2;

// src/storage/settings.js
export const DEFAULT_SETTINGS: Settings;
export function normalizeSettings(stored: unknown): Settings;
export function getSettings(): Promise<Settings>;
export function setSettings(patch: Partial<Settings>): Promise<Settings>;

// src/model/site.js
export function sameSite(a: string, b: string): boolean; // same host, or same last two labels

// src/i18n.js
export function t(key: string, ...subs: Array<string | number>): string;
```

## Error codes

The service worker returns the codes in `EXTRACT_ERROR_CODES`; the others are raised in the panel. Messages are the exact UI text from `public/_locales/en/messages.json`.

| Code | Raised when | UI | Message shown |
| --- | --- | --- | --- |
| RESTRICTED\_PAGE | Chrome refuses injection on chrome://, about:, view-source:, the Web Store, the PDF viewer or extension pages | Restricted | Chrome doesn't allow extensions to read this page. Open a regular website and try again. |
| FILE\_ACCESS | A file:// page and injection is refused | Restricted | To read local files, turn on "Allow access to file URLs" for this extension in chrome://extensions. |
| NO\_ACCESS | Injection refused for missing permission on a normal page | No access | Click the WebStyle icon in the toolbar, or press Alt+Shift+D, to give access to this tab. |
| TIMEOUT | No basic result within 10 s (16 s with auto-scroll), or the Advanced plan passed 20 s | Error | This page took too long to read. Wait for it to finish loading, then retry. |
| EMPTY\_PAGE | Fewer than 30 elements sampled | Thin | Found too little to read. Scroll to load the content, then re-run. Pages drawn on a canvas can't be read. |
| PAGE\_CHANGED | The tab navigated, the frame was removed or the debugger detached during the run | Error | The page changed while it was being read. Try again. |
| INJECTION\_FAILED | Any other injection error | Error | Couldn't read this page. (with Copy details) |
| ANALYSIS\_FAILED | The worker threw or did not answer within 10 s | Error | Something went wrong while analyzing. (with Copy details) |
| STORAGE\_FAILED | An IndexedDB write failed | Toast; results stay visible | Couldn't save to history. Your results stay here until you close the panel. |
| CLIPBOARD\_FAILED | `navigator.clipboard.writeText` rejected | Toast | Copy failed. Use Download instead. |
| DEBUGGER\_DENIED | The user declines the `debugger` permission, or it is missing at capture time | Toast; Advanced switch off | Advanced capture needs permission to use Chrome's debugger. Basic extraction still works. |
| DEBUGGER\_ATTACH\_FAILED | Attach fails, for example another debugger is attached | Error state with "Run basic extraction" | Couldn't start Advanced capture on this tab. Close other debugging tools and retry, or run a basic extraction. |
| CAPTURE\_PARTIAL | One Advanced stage fails but others succeed | Results with a warning banner | Some details couldn't be captured: {stages}. |
| SITE\_ACCESS\_DENIED | The user declines access to a site | Toast | Without access to this site, click the toolbar icon on each page instead. |
| CROSS\_SITE\_PAGE | "Add this page" on a different site | Confirmation dialog | This page is on {host}, not {snapshotHost}. Add it anyway? |
| TOO\_MANY\_PAGES | A 21st page is added | Toast | A snapshot holds at most 20 pages. |
| PICK\_CANCELLED | Escape, navigation or panel close during picking | Back to the previous screen | None |
| PICK\_FAILED | The picker cannot be injected | Toast | Couldn't start the element picker on this page. |
| HIGHLIGHT\_EMPTY | No visible element matches | Toast | No matching elements are visible on this page. |
| SCREENSHOT\_FAILED | `captureVisibleTab` rejects or cropping fails | Results kept, note in Export | Screenshots couldn't be taken on this page. |
| FS\_UNSUPPORTED | File System Access is not available (Firefox) | Write to project hidden | None |
| FS\_PERMISSION\_DENIED | The browser denies folder access | Toast | Folder access was not allowed. Choose the folder again in Settings. |
| FS\_WRITE\_FAILED | A file write fails | Dialog listing failed files | Some files couldn't be written: {files}. |
| IMPORT\_INVALID | An imported file fails validation, is not JSON or is over 50 MB | Dialog with the first problem | This file isn't a valid WebStyle snapshot: {problem}. |
| IMPORT\_TOO\_NEW | Imported version or schemaVersion is higher than supported | Dialog | This file was made with a newer version of WebStyle Extractor. Update the extension to open it. |
| MAPPING\_PARSE\_FAILED | A user token file cannot be read | Dialog | Couldn't read tokens from {file}. Supported: DTCG JSON, CSS custom properties, Tailwind v4 @theme. |

The service worker classifies injection errors by matching Chrome's error text in `src/platform/errors.js`, for example "Cannot access a chrome:// URL", "The extensions gallery cannot be scripted" and "Frame with ID 0 was removed". The patterns are in one table with unit tests. Copy details copies the error code, Chrome's message, the extension version and the page URL, never page content.

## Export formats

### Rules for all formats

- Excluded tokens and empty sections are omitted. Order is deterministic: semantic roles in SemanticRole order, then scales with gray first and the other families in hue order, steps ascending; sizes ascending.
- Hex is lowercase. Files use LF line endings, 2-space indents and a trailing newline. Dates are the capture date in UTC as YYYY-MM-DD. Every file starts with a generated-by line naming the version, source URL and date (a `$description` in JSON files).
- Names follow the edit log, then site variable names (F10), then the user's names when "Use my token names" is on (F38).
- Translucent colors are written as 8-digit hex. In CSS variable names `/` becomes `-a` (`blue-600/20` becomes `--color-blue-600-a20`).
- Paired themes follow the table below. Low-confidence items are marked "(verify)" in Markdown outputs.
- DESIGN.md stays under 450 lines: over that, the lowest-usage scale tokens go first, then low-confidence tokens, never semantic roles or rules. `prompt.md` is 40 lines or fewer.
- Exports are always English, whatever the UI language.

### File map

The zip (`<hostname>-webstyle.zip`), project writes (F37) and the CLI all use these paths (`FILE_MAP` in `src/export/files.js`). Single-file downloads are named `<hostname>-<file name>`, for example `example.com-DESIGN.md`. The labels are the Export tab's picker names (`EXPORT_LABELS`). This replaces v1's flat zip, and v1's `tailwind.config.js` is now `tailwind.webstyle.js`.

| Format id | Label | Default path |
| --- | --- | --- |
| `design-md` | DESIGN.md | `DESIGN.md` |
| `prompt` | prompt.md (compact prompt) | `design/prompt.md` |
| `dtcg` | tokens.json (DTCG) | `design/tokens.json`, plus `design/tokens.dark.json` when a dark theme exists |
| `tailwind-v4` | theme.css (Tailwind v4) | `design/theme.css` |
| `tailwind-v3` | tailwind.webstyle.js (Tailwind v3) | `design/tailwind.webstyle.js` |
| `css-vars` | variables.css | `design/variables.css` |
| `shadcn` | shadcn-theme.css (shadcn/ui) | `design/shadcn-theme.css` |
| `styleguide` | styleguide.html (style guide) | `design/styleguide.html` |
| `agents-md` | AGENTS.md block | `AGENTS.md` |
| `cursor-rules` | Cursor rules (.mdc) | `.cursor/rules/design-system.mdc` |
| `claude-md` | CLAUDE.md block | `CLAUDE.md` |
| `figma` | Figma variables | `design/figma/Primitives.tokens.json`, `design/figma/Semantic.Light.tokens.json`, `design/figma/Semantic.Dark.tokens.json` (each Semantic file only when that theme exists) |
| `audit` | audit.md (consistency report) | `design/audit.md` |
| Screenshots | PNG files | `design/screenshots/<kind>-<variant>[-dark].png` |
| From the Diff screen | diff.md | Download only |
| From the Map screen | mapping.md | Download only |
| Snapshot export | `<hostname>-<YYYY-MM-DD>.webstyle.json` or `webstyle-history-<YYYY-MM-DD>.webstyle.json` | Download only; the CLI writes `snapshot.webstyle.json` |

The default selection for the zip and project writes (`DEFAULT_EXPORT_SELECTION`, and the CLI's default `--formats`) is `design-md`, `prompt`, `dtcg`, `tailwind-v4`, `css-vars`, `shadcn`, `agents-md`, `cursor-rules` and `claude-md`.

### Paired themes in each format

| Format | Light and dark output |
| --- | --- |
| DESIGN.md | Semantic table with Light and Dark columns, plus a "Theme switching" line naming the mechanism and selector |
| tokens.json / tokens.dark.json | tokens.json holds primitives plus light semantic tokens; tokens.dark.json holds only the semantic group with dark aliases to the same primitives, and its `$description` says to load it with tokens.json |
| theme.css (Tailwind v4) | Primitives in `@theme`; semantic variables in `:root` (light) and the dark block; `@theme inline` maps `--color-<role>` to them; a `@custom-variant dark` with the site's selector for class or attribute mechanisms |
| tailwind.webstyle.js (v3) | `darkMode: 'media'` or `['selector', '<site selector>']`; semantic colors as `var(--<role>)`; a header comment says to import variables.css |
| variables.css | Primitives and light semantic variables in `:root`; dark semantic variables in `@media (prefers-color-scheme: dark) { :root { } }` or the site's selector |
| shadcn-theme.css | Always `:root` and `.dark` |
| styleguide.html | Light / Dark toggle |
| Figma | Semantic.Light and Semantic.Dark files (Figma modes Light and Dark) aliasing Primitives |
| prompt.md | Each semantic color as "light / dark" on one line |

### New token categories in each format

Tailwind v4 has theme namespaces for colors, fonts, text sizes, tracking, breakpoints, containers, spacing, radius, shadows and easing, but not for z-index, opacity, durations, border widths or gradients; those are plain variables in `:root`, used with the `utility-(--var)` syntax.

| Category | DESIGN.md | DTCG | Tailwind v4 | Tailwind v3 | variables.css |
| --- | --- | --- | --- | --- | --- |
| Translucent colors | Colors, Translucent | `color` | Semantic aliases as hex8 in `:root`; others `--color-<base>-a<alpha>` | `colors` (hex8) | `--color-<base>-a<alpha>` |
| Gradients | Colors, Gradients | `gradient` (type, direction in `$extensions`) | `:root` `--gradient-*` | `backgroundImage` | `--gradient-*` |
| Text styles | Typography, Text styles | `typography` (letterSpacing as px) | `@utility text-<name>` | `fontSize` tuples | `--text-<name>-*` |
| Letter spacing | Typography, Letter spacing | `number` in em with `$extensions.com.webstyle.unit: 'em'` | `--tracking-*` | `letterSpacing` | `--tracking-*` |
| Containers | Layout | `dimension` | `--container-*` | `maxWidth` | `--container-*` |
| Grid columns | Layout | `number` | DESIGN.md only | DESIGN.md only | DESIGN.md only |
| Gaps | Layout | `dimension` | Spacing references; others `:root` `--gap-*` | `gap` | `--gap-*` |
| Border widths | Borders | `dimension` | `:root` `--border-*` | `borderWidth` | `--border-*` |
| Opacity | Opacity | `number` | `:root` `--opacity-*` | `opacity` | `--opacity-*` |
| Z-index | Z-index | `number` | `:root` `--z-*`, used as `z-(--z-dialog)` | `zIndex` | `--z-*` |
| Durations | Motion | `duration` | `:root` `--duration-*` | `transitionDuration` | `--duration-*` |
| Easings | Motion | `cubicBezier` | `--ease-*` | `transitionTimingFunction` | `--ease-*` |
| Focus ring | Components, Focus ring | Color role plus ring spec | `--color-focus-ring` and the ring spec in DESIGN.md | `ringColor`, `ringWidth`, `ringOffsetWidth` | `--focus-ring-*` |
| Web fonts | Stack | `fontFamily` (provider in `$extensions`) | `--font-*` with a provider comment | `fontFamily` | `--font-*` |
| Recipe states | Components | `$extensions.com.webstyle.recipes` | DESIGN.md only | DESIGN.md only | DESIGN.md only |

### DESIGN.md

Section order: title and source line (pages, themes, capture mode); Rules for the agent; Stack (framework, icons, web fonts); Colors (Semantic with Light and Dark, Scales, Translucent, Gradients); Typography (Families, Text styles, Scale, Letter spacing); Spacing; Layout; Radius; Borders; Shadows; Opacity; Z-index; Motion; Breakpoints; Responsive; Components (focus ring first, then each recipe with its states, and screenshots when exported); Accessibility; Values not in your system (with a mapping); Notes.

The rules for the agent have fixed wording, and a rule is left out when its data is missing:

1. Use only the tokens in this file. Do not add new colors, font sizes, spacing, radii, shadows, durations or z-index values.
2. In components, prefer semantic tokens (background, text, primary, border) over scale tokens.
3. Spacing uses a {base}px base unit. Use the spacing scale, never arbitrary values.
4. Body text is `text` on `background`; secondary text is `text-muted`. Use only the safe text pairs in Accessibility.
5. Match the component recipes below, including their hover, focus and active states.
6. Every interactive element shows the focus ring on `:focus-visible`: {ring}.
7. Support light and dark themes with the paired semantic tokens. The site switches themes with {mechanism}.
8. Use {framework} and the {icon library} icons at {size}px. Load {fonts} rather than substituting.
9. Animate with the motion tokens below and honor `prefers-reduced-motion`.
10. If a needed value is missing, use the nearest existing token and leave a TODO comment.
11. (Only with a token mapping) Prefer the existing tokens from {file}. Values under "Values not in your system" need a decision.

A full example is in [docs/v2-spec.md](v2-spec.md) section 9.5.

### Other formats

- **prompt.md:** title, the rules condensed, a stack line, semantic colors light / dark, the type scale, the top 3 text styles, spacing, radius, shadow, the primary button with its states, the focus ring and one motion line. Low-confidence tokens without a role are left out. Example in v2 spec 9.8.
- **tokens.json:** groups are categories, plus `line-height` and `font-weight` groups keyed like `text`; keys drop the category prefix (`space-4` becomes `space.4`). Colors use the DTCG object form `{ colorSpace: 'srgb', components, hex }` (with `alpha` when translucent). Semantic colors are aliases such as `{color.gray-900}`. Gradients and web fonts carry `$extensions.com.webstyle`, and recipes go in the root `$extensions.com.webstyle.recipes`.
- **theme.css (Tailwind v4), tailwind.webstyle.js (v3), variables.css:** as in the tables above; with a base unit, theme.css emits only `--spacing`. v3 uses `theme.extend`. variables.css writes each token's original site variable name verbatim when it has one. Example in v2 spec 9.3.
- **shadcn-theme.css:** the mapping in v2 spec 9.6. Foregrounds come from recipe text colors or the highest-contrast extracted color; when nothing reaches 4.5:1 the variable gets a `/* TODO */` comment instead of a value. `oklch` format adds `@theme inline` and the radius steps; `hsl` writes bare `H S% L%` triplets only.
- **AGENTS.md and CLAUDE.md blocks:** text between `<!-- webstyle:start -->` and `<!-- webstyle:end -->`. Project writes replace only the text between existing markers, or append the block. The CLAUDE.md block holds `@DESIGN.md`.
- **design-system.mdc:** YAML front matter (`description`, `globs`, `alwaysApply: false`), the rules, a key-token line and `@DESIGN.md`.
- **styleguide.html:** one self-contained page with inline CSS and inline JavaScript only for the Light / Dark toggle and click-to-copy. Fonts are named, never loaded; screenshots are embedded as data URIs only when included.
- **Figma:** `Primitives.tokens.json` (mode "Value": colors, spacing, radius, border width and font size as px dimensions, families as strings) and `Semantic.Light.tokens.json` / `Semantic.Dark.tokens.json` (color roles and the focus ring as aliases into Primitives through `com.figma.aliasData`, with the resolved value kept). Names use slash groups (`color/gray/900`, `space/4`, `radius/md`). Import: open Variables, drag Primitives into a collection named Primitives, then the Semantic files into a collection named Semantic, one file per mode.
- **audit.md:** summary counts; near-duplicate colors; off-scale spacing; distinct counts; contrast failures; focus style; variable conflicts across pages; low-confidence items.
- **diff.md:** "A vs B" with both sources and dates, counts per category, then Added, Removed, Changed (old, new, distance), Renamed, role changes per theme, recipe changes and stack changes.
- **mapping.md:** source token file and date, counts (exact, close, none), then a table of extracted token, value, your token, status and distance, unmatched rows last.
- **Snapshot JSON (F40):** `{ format: 'webstyle-snapshots', version: 2, exportedAt, snapshots, screenshots? }`. Project links are never included; screenshots only when chosen, as base64.
