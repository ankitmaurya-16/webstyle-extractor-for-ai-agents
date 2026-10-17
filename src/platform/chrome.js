// Thin wrappers around chrome.* so the rest of the code never touches the global and tests can
// replace it. Only entrypoints/ and src/platform/ may call chrome.*.

const api = () => globalThis.chrome;

export async function getActiveTab() {
  // End-to-end builds open the panel as a normal tab, so the test names the target tab in the
  // URL. The check is compiled out of the store build.
  if (import.meta.env?.WXT_E2E === '1') {
    const target = new URLSearchParams(globalThis.location?.search ?? '').get('tab');
    if (target) return api().tabs.get(Number(target));
  }
  const [tab] = await api().tabs.query({ active: true, currentWindow: true });
  return tab;
}

export function getTab(tabId) {
  return api().tabs.get(tabId);
}

/** Sends EXTRACT to the service worker and resolves with its reply. */
export function sendToBackground(message) {
  return api().runtime.sendMessage(message);
}

export function executeExtractor(tabId) {
  return api().scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ['/extractor.js'],
  });
}

/**
 * Resolves when the tab navigates or closes, and returns an unsubscribe function.
 * @param {number} tabId
 * @param {() => void} onChange
 */
export function watchTabChange(tabId, onChange) {
  const tabs = api().tabs;
  const onUpdated = (id, info) => {
    if (id === tabId && (info.url !== undefined || info.status === 'loading')) onChange();
  };
  const onRemoved = (id) => {
    if (id === tabId) onChange();
  };
  tabs.onUpdated.addListener(onUpdated);
  tabs.onRemoved.addListener(onRemoved);
  return () => {
    tabs.onUpdated.removeListener(onUpdated);
    tabs.onRemoved.removeListener(onRemoved);
  };
}

export async function sessionGet(key) {
  const result = await api().storage.session.get(key);
  return result[key];
}

export function sessionSet(key, value) {
  return api().storage.session.set({ [key]: value });
}

export function sessionRemove(key) {
  return api().storage.session.remove(key);
}

/** Calls back with the new value whenever `key` changes in storage.session. */
export function onSessionChange(key, callback) {
  const listener = (changes, area) => {
    if (area === 'session' && key in changes) callback(changes[key].newValue);
  };
  api().storage.onChanged.addListener(listener);
  return () => api().storage.onChanged.removeListener(listener);
}

export async function localGet(key) {
  const result = await api().storage.local.get(key);
  return result[key];
}

export function localSet(key, value) {
  return api().storage.local.set({ [key]: value });
}

export function extensionVersion() {
  return api().runtime.getManifest().version;
}

export function openTab(url) {
  return api().tabs.create({ url });
}

/** Calls back when the user switches tabs or the active tab navigates. */
export function onActiveTabChange(callback) {
  const tabs = api().tabs;
  const onActivated = () => callback();
  const onUpdated = (_id, info, tab) => {
    if (tab?.active && (info.url !== undefined || info.status === 'complete')) callback();
  };
  tabs.onActivated.addListener(onActivated);
  tabs.onUpdated.addListener(onUpdated);
  return () => {
    tabs.onActivated.removeListener(onActivated);
    tabs.onUpdated.removeListener(onUpdated);
  };
}

/** True in the Firefox build, where the debugger and File System Access are missing (F43). */
export const isFirefox = () => import.meta.env?.BROWSER === 'firefox';

/**
 * Opens the panel's long-lived port (v2 spec 7.1). Reconnects are the caller's job.
 * @param {(message: object) => void} onMessage
 * @param {() => void} onDisconnect
 */
export function connectPanelPort(name, onMessage, onDisconnect) {
  const port = api().runtime.connect({ name });
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(onDisconnect);
  return {
    post: (message) => port.postMessage(message),
    disconnect: () => port.disconnect(),
  };
}

/** Messages sent with runtime.sendMessage by injected scripts (the picker). */
export function onRuntimeMessage(callback) {
  const listener = (message) => {
    callback(message);
    return false;
  };
  api().runtime.onMessage.addListener(listener);
  return () => api().runtime.onMessage.removeListener(listener);
}

// Permission prompts must run inside the user's click, so these are called from click handlers
// with no await before them (v2 spec 7.2).
export const requestPermissions = (permissions) => api().permissions.request(permissions);
export const removePermissions = (permissions) => api().permissions.remove(permissions);
export const hasPermissions = (permissions) => api().permissions.contains(permissions);
export const getAllPermissions = () => api().permissions.getAll();

/** Origin pattern for one site, for optional host access (F25). */
export function originPattern(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}
