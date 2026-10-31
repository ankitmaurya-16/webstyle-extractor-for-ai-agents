# Message sequences

These flows cover every message in the extension, failures and cleanup included. Solid arrows are requests, dashed arrows are replies, and a cross means the call failed. Flows 1 to 7 are the v1 flows updated for v2; flows 8 to 13 are new.

## 1. Extract (happy path)

The page is touched through `executeScript` only: once to install `self.__webstyle`, then once to call `collect(options)`. Everything after that happens inside the extension.

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant SW as Service worker
  participant E as Extractor (page)
  participant W as Analysis worker
  participant DB as IndexedDB
  U->>P: Click Extract
  P->>P: tabs.query active tab, get tabId
  P->>SW: port EXTRACT requestId, tabId, intent new, autoScroll, advanced null
  SW->>SW: storage.session set activeCapture
  SW->>E: executeScript files extractor.js, allFrames
  SW->>E: executeScript func collect(options), allFrames
  SW-->>P: EXTRACT_PROGRESS reading
  E->>E: Walk DOM in slices, read computed styles and readable stylesheets
  E-->>SW: RawSnapshotV2 per frame
  SW->>SW: Merge same-origin frames, clear activeCapture
  SW-->>P: CAPTURES captures, warnings, screenshots
  P->>P: Add the Path A stylesheet-override capture if the base has other-theme overrides
  P->>W: ANALYZE requestId, captures, edits, options
  W-->>P: PROGRESS normalize ... naming, replay
  W-->>P: RESULT extracted, edited, staleEdits
  P->>DB: put SnapshotRecordV2
  P-->>U: Results screen on the Colors tab
```

## 2. Extraction failures

Every failure ends in a named UI state; none leaves the panel spinning.

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant SW as Service worker
  participant E as Extractor (page)
  U->>P: Click Extract
  P->>SW: EXTRACT tabId
  SW->>SW: Start 10 s timer (16 s with auto-scroll) and call executeScript
  alt Chrome refuses the URL, such as the Web Store or PDF viewer
    SW-->>P: EXTRACT_ERROR RESTRICTED_PAGE
    P-->>U: Restricted state
  else Local file without file access
    SW-->>P: EXTRACT_ERROR FILE_ACCESS
    P-->>U: Restricted state with steps to allow file URLs
  else No activeTab grant and no site permission
    SW-->>P: EXTRACT_ERROR NO_ACCESS
    P-->>U: No access state with toolbar, shortcut and Allow on this site hints
  else Tab navigates during the run
    E--xSW: Frame removed
    SW-->>P: EXTRACT_ERROR PAGE_CHANGED
    P-->>U: Error state with Retry
  else No result in time
    SW-->>P: EXTRACT_ERROR TIMEOUT
    P-->>U: Error state with Retry
  else Fewer than 30 elements sampled
    E-->>SW: RawSnapshotV2 with elementsSampled under 30
    SW-->>P: EXTRACT_ERROR EMPTY_PAGE
    P-->>U: Thin state with Re-run
  end
```

## 3. Analysis failure

A failed analysis saves nothing, so history never holds a broken snapshot.

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant W as Analysis worker
  P->>W: ANALYZE requestId, captures, edits
  P->>P: Start 10 s timer
  alt Worker throws
    W-->>P: ERROR ANALYSIS_FAILED
  else No answer within 10 s
    P->>W: terminate()
  end
  P-->>U: Error state with Copy details, nothing saved
```

## 4. Keyboard shortcut

`sidePanel.open` must be the first call in the command handler, with no `await` before it, or Chrome drops the user gesture. The panel ignores a `pendingExtract` older than 10 s.

```mermaid
sequenceDiagram
  actor U as User
  participant SW as Service worker
  participant S as storage.session
  participant P as Side panel
  U->>SW: Alt+Shift+D, commands.onCommand with the tab
  SW->>P: sidePanel.open windowId
  SW->>S: set pendingExtract tabId, windowId, at
  par Panel just opened
    P->>S: On load, read pendingExtract
  and Panel was already open
    S-->>P: storage.onChanged pendingExtract
  end
  P->>S: Remove pendingExtract
  P->>SW: EXTRACT tabId
  Note over P,SW: Continues as in flow 1
```

## 5. Edit and autosave

Edits go into the edit log, so they survive re-runs, merges and Advanced re-captures.

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel store
  participant DB as IndexedDB
  U->>P: Rename gray-900 to ink
  P->>P: applyEdit on the edited copy
  alt INVALID_NAME or NAME_TAKEN
    P-->>U: Inline error, nothing changes
  else ok
    P->>P: Append the edit to edits
    P-->>U: Lists and export preview update
    P->>DB: put SnapshotRecordV2 after a 500 ms debounce
    opt Write fails
      DB--xP: Error
      P-->>U: Toast STORAGE_FAILED
    end
  end
  Note over P: After any later analysis the worker replays the log, counts stale edits and the panel shows the stale-edits banner
```

## 6. Export

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant X as Exporters
  participant ST as storage.local
  U->>P: Open Export tab and choose a format
  P->>ST: set lastExportFormat
  P->>X: exportFile with the edited copy, version and ctx (mapping, shadcn format)
  X-->>P: File text
  P-->>U: Preview
  alt Copy or Copy prompt
    U->>P: Click Copy
    P->>P: navigator.clipboard.writeText
    alt Write succeeds
      P-->>U: Toast Copied
    else Write fails
      P-->>U: Toast CLIPBOARD_FAILED
    end
  else Download
    U->>P: Click Download
    P->>P: Blob, object URL, anchor click, revoke URL
  else Download all
    U->>P: Click Download all
    P->>X: exportZip with the export selection
    X-->>P: Uint8Array laid out by the file map
    P->>P: Save hostname-webstyle.zip
  end
```

## 7. History

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant DB as IndexedDB
  U->>P: Open History
  P->>DB: listSnapshots using the byCapturedAt index
  DB-->>P: Summaries, newest first
  alt No snapshots
    P-->>U: Empty state with Extract button
  else Has snapshots
    P-->>U: List with color strips, kind, page count and theme badges
    U->>P: Open a snapshot
    P->>DB: getSnapshot id
    DB-->>P: SnapshotRecordV2
    P-->>U: Results with the edited copy
  end
  opt Delete
    U->>P: Delete, then confirm
    P->>DB: deleteSnapshot id, with its screenshots
  end
```

## 8. Advanced capture

The debugger is attached only for the plan and always detached in a `finally` block. A failed stage keeps the others.

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant SW as Service worker
  participant S as storage.session
  participant T as Tab (CDP)
  participant E as Extractor (page)
  U->>P: Turn on Advanced capture (first time)
  P->>P: permissions.request debugger, inside the click
  alt Declined
    P-->>U: Toast DEBUGGER_DENIED, switch off
  end
  U->>P: Click Extract
  P->>SW: EXTRACT advanced deepScan, dark, states, widths
  SW->>E: Basic capture as in flow 1
  SW->>T: debugger.attach tabId 1.3
  alt Another debugger is attached
    SW-->>P: EXTRACT_ERROR DEBUGGER_ATTACH_FAILED
  end
  SW->>S: activeCapture debuggerAttached true
  SW-->>P: EXTRACT_PROGRESS attach
  opt Deep scan
    SW->>T: DOM.enable, CSS.enable, collect CSS.styleSheetAdded, CSS.getStyleSheetText (5 MB cap)
    SW->>E: collect with sheetTexts
    SW-->>P: EXTRACT_PROGRESS deep-scan
  end
  opt Other theme, media mechanism only
    SW->>T: Emulation.setEmulatedMedia prefers-color-scheme
    SW->>E: collect, then reset emulation in finally
    SW-->>P: EXTRACT_PROGRESS dark or light
  end
  opt States
    loop Each representative selector, each state
      SW->>T: DOM.querySelector, CSS.forcePseudoState
      SW->>E: readRecipe selector
      SW->>T: Clear the forced state
    end
    SW-->>P: EXTRACT_PROGRESS states
  end
  opt Widths
    loop Each width
      SW->>T: Emulation.setDeviceMetricsOverride
      SW->>E: collect
    end
    SW->>T: Emulation.clearDeviceMetricsOverride
  end
  SW->>T: debugger.detach (finally)
  SW->>S: Remove activeCapture
  SW-->>P: EXTRACT_PROGRESS detach
  SW-->>P: CAPTURES captures, warnings (failed stages)
  opt warnings not empty
    P-->>U: CAPTURE_PARTIAL banner naming the stages
  end
```

Each stage stops at 8 s and the plan at 20 s. A navigation, a tab close or `debugger.onDetach` during the plan ends it with PAGE_CHANGED and nothing from the plan is saved. Chrome shows its "started debugging this browser" bar while attached.

## 9. Panel disconnect cleanup

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant SW as Service worker
  participant T as Tab
  U->>P: Close or reload the panel
  P--xSW: panel port disconnects
  SW->>SW: Abort every run this port started
  SW->>T: debugger.detach in the run's finally block
  loop Every tab the port touched
    SW->>T: executeScript __webstylePicker.stop, __webstyleHighlighter.clear
  end
  SW->>SW: Remove activeCapture
  Note over P: A run that was in progress saves nothing (AC-F1.12)
```

## 10. Service worker restart recovery

The service worker keeps no state in variables. If Chrome stops it mid-capture, the next start cleans up from `activeCapture`.

```mermaid
sequenceDiagram
  participant SW as Service worker (new instance)
  participant S as storage.session
  participant T as Tab
  participant P as Side panel
  SW->>S: get activeCapture
  alt Record exists
    opt debuggerAttached
      SW->>T: debugger.detach, errors ignored
    end
    SW->>T: Remove picker and highlight overlays
    SW->>S: Remove activeCapture
  end
  P--xSW: Old port disconnected
  P->>P: Pending replies resolve empty; the run fails and can be retried
  P->>SW: Next message opens a new port
```

## 11. Element picker

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant SW as Service worker
  participant K as Picker (page)
  U->>P: Pick element
  P->>SW: port PICK_START tabId
  SW->>K: executeScript picker.js, then __webstylePicker.start()
  alt Injection fails
    SW-->>P: EXTRACT_ERROR PICK_FAILED or an access code
    P-->>U: Toast
  else Ready
    SW-->>P: PICK_READY
    P-->>U: Picking screen
    loop Hover, arrows
      K-->>P: PICK_HOVER tag, width, height
    end
    opt Parent, Child or Select button in the panel
      P->>SW: PICK_KEY ArrowUp, ArrowDown or Enter
      SW->>K: __webstylePicker.key
    end
    alt Click or Enter
      K->>K: Remove overlay
      K-->>P: PICK_RESULT selector, rect, tag, role
      P->>SW: EXTRACT intent component, rootSelector
      Note over P,SW: Continues as in flow 1; saved as a component snapshot
    else Escape or navigation
      K->>K: Remove overlay
      K-->>P: PICK_CANCELLED
      P-->>U: Previous screen
    else Back in the panel
      P->>SW: PICK_STOP
      SW->>K: __webstylePicker.stop()
    end
  end
```

## 12. Highlight ("Where is this used?")

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant SW as Service worker
  participant H as Highlighter (page)
  U->>P: Click the eye button on a token
  P->>P: highlightMatch design, tokenId
  P->>SW: port HIGHLIGHT_SHOW tabId, tokenId, match
  SW->>H: executeScript highlighter.js, then show(match)
  H->>H: Check up to 4,000 visible elements, draw up to 200 outlines
  SW-->>P: HIGHLIGHT_COUNT count, tokenId
  alt count is 0
    P-->>U: Toast HIGHLIGHT_EMPTY
  else No access
    P-->>U: Toolbar icon or Allow on this site hint
  else Matches
    P-->>U: "12 elements"
  end
  loop While active
    H->>H: Reposition on scroll and resize, recompute every 1 s
  end
  U->>P: Eye again, another token, navigation or panel close
  P->>SW: HIGHLIGHT_CLEAR tabId
  SW->>H: clear()
```

## 13. Write to project

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant DB as IndexedDB projects
  participant FS as Project folder
  U->>P: Write to my-app
  P->>DB: Get the ProjectLink handle and file map
  P->>FS: queryPermission readwrite
  opt Not granted
    P->>FS: requestPermission inside the click
    alt Denied
      P-->>U: Toast FS_PERMISSION_DENIED
    end
  end
  P->>P: exportFiles for the export selection, mapFiles to the project's paths
  P->>FS: Read existing files
  P->>P: planWrites: new, updated or unchanged; marked-block merge for AGENTS.md and CLAUDE.md
  P->>FS: Write new and updated files, creating folders; never delete
  alt Some writes fail
    P-->>U: Dialog FS_WRITE_FAILED listing the files
  else All written
    P-->>U: Summary dialog with new, updated and unchanged files
  end
  P->>DB: Save lastWrittenAt
```
