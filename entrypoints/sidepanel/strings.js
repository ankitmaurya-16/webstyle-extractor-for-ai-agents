// Every UI string lives here so the panel can be translated later.

export const S = {
  appName: 'WebStyle',
  currentTab: 'Current tab',
  extract: 'Extract design system',
  orPress: 'or press',
  shortcut: 'Alt+Shift+D',
  recent: 'Recent',
  firstRun: ['Extract a page', 'Review the tokens', 'Export to your agent'],
  history: 'History',
  menu: 'Menu',
  back: 'Back',
  changeShortcut: 'Change shortcut',
  sourceCode: 'Source code on GitHub',
  deleteAllHistory: 'Delete all history',
  deleteAll: 'Delete all',

  progress: { reading: 'Reading page', analyzing: 'Analyzing', saving: 'Saving' },
  progressDone: (label) => `${label} done`,
  progressNow: (label) => `${label}…`,
  cancel: 'Cancel',

  tabs: {
    colors: 'Colors',
    type: 'Type',
    layout: 'Layout',
    components: 'Components',
    export: 'Export',
  },
  rerun: 'Re-run',
  resetToExtracted: 'Reset to extracted',
  delete: 'Delete',
  open: 'Open',

  semantic: 'Semantic',
  scales: 'Scales',
  other: 'Other colors',
  noPrimary: 'No primary color detected',
  excludedCount: (n) => `${n} excluded`,
  excluded: 'Excluded',
  mergedFrom: 'Merged from',
  copyHex: (hex) => `Copy ${hex}`,
  emptyStep: (step) => `No color at step ${step}`,
  showToken: (name) => `Show ${name}`,

  families: 'Families',
  scale: 'Scale',
  headingSample: 'Aa Heading sample',
  bodySample: 'Aa Body sample',
  fontsNote: 'Previews use fonts installed on this computer',

  spacing: 'Spacing',
  baseUnit: (px) => `base ${px}px`,
  noBase: 'no base unit',
  radius: 'Radius',
  shadows: 'Shadows',
  breakpoints: 'Breakpoints',
  notReadable: 'Not readable on this site',
  partial: (unreadable) =>
    `Partial: ${unreadable} ${unreadable === 1 ? "stylesheet couldn't" : "stylesheets couldn't"} be read`,
  partialNone: 'Partial: no stylesheet on this page could be read',
  nothingFound: 'Nothing found on this page.',

  previewButton: 'Button',
  previewPlaceholder: 'Placeholder',
  previewLink: 'Link text',
  previewHeading: (level) => `Heading ${level}`,
  recipeKeys: {
    background: 'background',
    text: 'text',
    border: 'border',
    padding: 'padding',
    radius: 'radius',
    font: 'font',
    shadow: 'shadow',
  },
  noComponents: 'No buttons, inputs, links or headings were found.',

  format: 'Format',
  copy: 'Copy',
  download: 'Download',
  downloadAll: 'Download all (.zip)',
  linesAndSize: (lines, size) => `${lines} lines · ${size}`,

  tokenMenu: (name) => `Actions for ${name}`,
  rename: 'Rename',
  setRole: 'Set role',
  clearRole: (role) => `Clear ${role}`,
  mergeInto: 'Merge into',
  exclude: 'Exclude',
  include: 'Include',
  renameLabel: 'New name',
  save: 'Save',
  editErrors: {
    INVALID_NAME: 'Use lowercase letters, digits and hyphens, starting with a letter.',
    NAME_TAKEN: 'That name is already used in this category.',
    NOT_FOUND: 'That token no longer exists.',
    SAME_TOKEN: "A token can't merge into itself.",
  },

  copied: 'Copied',
  toasts: {
    STORAGE_FAILED: "Couldn't save to history. Your results stay here until you close the panel.",
    CLIPBOARD_FAILED: 'Copy failed. Use Download instead.',
  },

  states: {
    RESTRICTED_PAGE: {
      title: "Can't read this page",
      body: "Chrome doesn't allow extensions to read this page. Open a regular website and try again.",
    },
    FILE_ACCESS: {
      title: "Can't read this page",
      body: 'To read local files, turn on "Allow access to file URLs" for this extension in chrome://extensions.',
    },
    NO_ACCESS: {
      title: 'Give access to this tab',
      body: 'Click the WebStyle icon in the toolbar, or press Alt+Shift+D, to give access to this tab.',
    },
    TIMEOUT: {
      title: 'Something went wrong',
      body: 'This page took too long to read. Wait for it to finish loading, then retry.',
    },
    EMPTY_PAGE: {
      title: 'Too little to read',
      body: "Found too little to read. Scroll to load the content, then re-run. Pages drawn on a canvas can't be read.",
    },
    PAGE_CHANGED: {
      title: 'Something went wrong',
      body: 'The page changed while it was being read. Try again.',
    },
    INJECTION_FAILED: { title: 'Something went wrong', body: "Couldn't read this page." },
    ANALYSIS_FAILED: {
      title: 'Something went wrong',
      body: 'Something went wrong while analyzing.',
    },
  },
  retry: 'Retry',
  copyDetails: 'Copy details',
  historyEmpty: { title: 'No snapshots yet', body: 'Extract a page and it appears here.' },

  confirmReset: {
    title: 'Reset to extracted?',
    body: 'Your edits to this snapshot are replaced by the original analysis.',
    confirm: 'Reset',
  },
  confirmDelete: {
    title: 'Delete this snapshot?',
    body: 'It is removed from history on this computer.',
    confirm: 'Delete',
  },
  confirmDeleteAll: {
    title: 'Delete all history?',
    body: (n) => `This removes ${n} ${n === 1 ? 'snapshot' : 'snapshots'} from this computer.`,
    confirm: 'Delete all',
  },
  justNow: 'just now',
  minutesAgo: (n) => `${n} min ago`,
  hoursAgo: (n) => `${n} h ago`,
  today: (time) => `Today ${time}`,
};

export const SOURCE_URL = 'https://github.com/ankitmaurya-16/webstyle-extractor-for-ai-agents';
export const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

const MONTH = { month: 'short', day: 'numeric' };

/** "2 h ago" style date for Recent on Home. */
export function relativeDate(ts, now = Date.now()) {
  const minutes = Math.floor((now - ts) / 60000);
  if (minutes < 1) return S.justNow;
  if (minutes < 60) return S.minutesAgo(minutes);
  if (minutes < 24 * 60) return S.hoursAgo(Math.floor(minutes / 60));
  return new Date(ts).toLocaleDateString('en-US', MONTH);
}

/** "Today 14:02" or "Oct 12" for History. */
export function historyDate(ts, now = Date.now()) {
  const date = new Date(ts);
  if (date.toDateString() === new Date(now).toDateString()) {
    return S.today(date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  }
  return date.toLocaleDateString('en-US', MONTH);
}

export const shortDate = (ts) => new Date(ts).toLocaleDateString('en-US', MONTH);

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
