import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoScroll } from '../../../src/collect/scroll.js';

/** A window whose page grows by `grow(step)` px after each scroll step. */
function fakeWindow({ height = 2000, grow = () => 0, start = 120 } = {}) {
  let step = 0;
  const win = {
    innerHeight: 700,
    scrollX: 0,
    scrollY: start,
    document: { documentElement: { scrollHeight: height } },
    scrollBy: vi.fn((x, y) => {
      step += 1;
      win.document.documentElement.scrollHeight += grow(step);
      const max = win.document.documentElement.scrollHeight - win.innerHeight;
      win.scrollY = Math.min(max, win.scrollY + y);
    }),
    scrollTo: vi.fn((x, y) => {
      win.scrollX = x;
      win.scrollY = y;
    }),
  };
  return win;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function runToEnd(win, hooks) {
  const promise = autoScroll(win, hooks);
  await vi.runAllTimersAsync();
  return promise;
}

describe('autoScroll (F22)', () => {
  it('AC-F22.4 scrolls one viewport per step and stops after 2 steps without growth at the bottom', async () => {
    const win = fakeWindow({ height: 2000 });
    await expect(runToEnd(win)).resolves.toBe(true);
    // 120 -> 820 -> 1300: the height never changed and the second step reached the bottom.
    expect(win.scrollBy).toHaveBeenCalledTimes(2);
    expect(win.scrollBy).toHaveBeenCalledWith(0, 700);
  });

  it('AC-F22.4 keeps going while lazy content makes the page grow', async () => {
    const win = fakeWindow({ height: 1500, grow: (step) => (step <= 3 ? 700 : 0) });
    await runToEnd(win);
    expect(win.scrollBy.mock.calls.length).toBeGreaterThan(4);
  });

  it('AC-F22.4 stops at 10 screens on a page that never stops growing', async () => {
    const win = fakeWindow({ height: 1500, grow: () => 1000 });
    await runToEnd(win);
    expect(win.scrollBy).toHaveBeenCalledTimes(10);
  });

  it('AC-F22.4 stops after 5 s even when steps are slow', async () => {
    const win = fakeWindow({ height: 1500, grow: () => 1000 });
    // Each step takes 1 s of work on a slow page, on top of the 250 ms wait.
    const onStep = () => vi.setSystemTime(Date.now() + 1000);
    await runToEnd(win, { onStep });
    expect(win.scrollBy.mock.calls.length).toBeLessThanOrEqual(5);
    expect(win.scrollBy.mock.calls.length).toBeLessThan(10);
  });

  it('AC-F22.5 restores the original scroll position afterwards', async () => {
    const win = fakeWindow({ start: 340 });
    await runToEnd(win);
    expect(win.scrollTo).toHaveBeenLastCalledWith(0, 340);
    expect(win.scrollY).toBe(340);
  });

  it('AC-F22.5 restores the scroll position even when a step throws', async () => {
    const win = fakeWindow({ start: 50 });
    win.scrollBy.mockImplementationOnce(() => {
      win.scrollY = 900;
      throw new Error('scroll blocked');
    });
    await expect(autoScroll(win)).rejects.toThrow('scroll blocked');
    expect(win.scrollTo).toHaveBeenCalledWith(0, 50);
    expect(win.scrollY).toBe(50);
  });
});
