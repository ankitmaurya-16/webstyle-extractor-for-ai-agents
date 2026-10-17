# Message sequences

Seven flows cover every message in the extension, failures included. Solid arrows are requests, dashed arrows are replies, and a cross means the call failed.

## 1. Extract (happy path)

The page is touched once, through a single `executeScript`; everything after that happens inside the extension.

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
  P->>SW: runtime.sendMessage EXTRACT tabId
  SW->>E: scripting.executeScript extractor.js
  E->>E: Walk DOM in slices, read computed styles, aggregate
  E-->>SW: RawSnapshot as the injection result
  SW-->>P: SNAPSHOT raw
  P->>W: ANALYZE requestId, raw
  W-->>P: PROGRESS normalize, cluster, roles, naming
  W-->>P: RESULT design
  P->>DB: put SnapshotRecord with extracted and edited copies
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
  SW->>SW: Start 10 s timer and call executeScript
  alt Chrome refuses the URL, such as the Web Store or PDF viewer
    SW-->>P: EXTRACT_ERROR RESTRICTED_PAGE
    P-->>U: Restricted state
  else Local file without file access
    SW-->>P: EXTRACT_ERROR FILE_ACCESS
    P-->>U: Restricted state with steps to allow file URLs
  else activeTab not granted for this tab
    SW-->>P: EXTRACT_ERROR NO_ACCESS
    P-->>U: No access state with toolbar and shortcut hint
  else Tab navigates during the run
    E--xSW: Frame removed
    SW-->>P: EXTRACT_ERROR PAGE_CHANGED
    P-->>U: Error state with Retry
  else No result within 10 s
    SW-->>P: EXTRACT_ERROR TIMEOUT
    P-->>U: Error state with Retry
  else Fewer than 30 elements sampled
    E-->>SW: RawSnapshot with elementsSampled under 30
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
  P->>W: ANALYZE requestId, raw
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
    P-->>U: Lists and export preview update
    P->>DB: put SnapshotRecord after a 500 ms debounce
    opt Write fails
      DB--xP: Error
      P-->>U: Toast STORAGE_FAILED
    end
  end
```

## 6. Export

```mermaid
sequenceDiagram
  actor U as User
  participant P as Side panel
  participant X as Exporters
  participant ST as storage.local
  U->>P: Open Export tab and choose DESIGN.md
  P->>ST: set lastExportFormat
  P->>X: exportDesignMd with the edited copy and version
  X-->>P: File text
  P-->>U: Preview
  alt Copy
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
    P->>X: exportZip with the edited copy and version
    X-->>P: Uint8Array
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
    P-->>U: List with color strips
    U->>P: Open a snapshot
    P->>DB: getSnapshot id
    DB-->>P: SnapshotRecord
    P-->>U: Results with the edited copy
  end
  opt Delete
    U->>P: Delete, then confirm
    P->>DB: deleteSnapshot id
  end
```
