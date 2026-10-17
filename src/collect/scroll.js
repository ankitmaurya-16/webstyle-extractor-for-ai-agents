// Opt-in auto-scroll (F22): scrolls down to trigger lazy content, then restores the position.

const STEP_MS = 250;
const MAX_SCREENS = 10;
const MAX_MS = 5000;
const STABLE_STEPS = 2;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scrolls one viewport per step until the page stops growing for 2 steps, 10 screens or 5 s,
 * then scrolls back. The original position is restored even when something throws (AC-F22.5).
 * @param {Window} win
 * @param {{onStep?: () => void}} [hooks]
 * @returns {Promise<boolean>} whether scrolling ran
 */
export async function autoScroll(win, hooks = {}) {
  const doc = win.document;
  const startX = win.scrollX;
  const startY = win.scrollY;
  const started = Date.now();
  let stable = 0;
  let lastHeight = doc.documentElement.scrollHeight;
  try {
    for (let screen = 0; screen < MAX_SCREENS; screen += 1) {
      if (Date.now() - started > MAX_MS) break;
      win.scrollBy(0, win.innerHeight);
      hooks.onStep?.();
      await wait(STEP_MS);
      const height = doc.documentElement.scrollHeight;
      const atBottom = win.scrollY + win.innerHeight >= height - 2;
      stable = height === lastHeight ? stable + 1 : 0;
      lastHeight = height;
      if (stable >= STABLE_STEPS && atBottom) break;
    }
  } finally {
    win.scrollTo(startX, startY);
  }
  return true;
}
