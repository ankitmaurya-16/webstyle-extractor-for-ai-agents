// Picker (F26) and highlighter (F30) injection from the service worker.

import { MSG, extractError } from '../messaging.js';
import { classifyInjectionError, errorMessage } from './errors.js';

const api = () => globalThis.chrome;

async function call(tabId, file, func, args = []) {
  await api().scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [file] });
  const [r] = await api().scripting.executeScript({ target: { tabId, frameIds: [0] }, func, args });
  return r?.result;
}

export async function startPicker(tabId) {
  try {
    await call(tabId, '/picker.js', () => self.__webstylePicker.start());
    return { type: MSG.PICK_READY, tabId };
  } catch (error) {
    const code = classifyInjectionError(error);
    return extractError(code === 'INJECTION_FAILED' ? 'PICK_FAILED' : code, errorMessage(error));
  }
}

export async function stopPicker(tabId) {
  try {
    await api().scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => self.__webstylePicker?.stop(),
    });
  } catch {
    // Gone with the page.
  }
}

export async function pickerKey(tabId, key) {
  try {
    await api().scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: (k) => self.__webstylePicker?.key(k),
      args: [key],
    });
  } catch {
    // Gone with the page.
  }
}

export async function showHighlight(tabId, match) {
  try {
    const result = await call(tabId, '/highlighter.js', (m) => self.__webstyleHighlighter.show(m), [
      match,
    ]);
    return { type: MSG.HIGHLIGHT_COUNT, count: result?.count ?? 0 };
  } catch (error) {
    return { type: MSG.HIGHLIGHT_COUNT, count: 0, error: classifyInjectionError(error) };
  }
}

export async function clearHighlight(tabId) {
  try {
    await api().scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => self.__webstyleHighlighter?.clear(),
    });
  } catch {
    // Gone with the page.
  }
}
