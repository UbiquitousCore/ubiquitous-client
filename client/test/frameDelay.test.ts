/**
 * How fast the loading screen is allowed to poll.
 *
 * On the first zone load this poll is the only thing calling `Renderer.sync()`
 * — the frame loop starts after `loadZoneWithScreen` returns — and the
 * profile's `attachesPerFrame` is a budget *per call*. So the poll interval is
 * the drain rate, and a flat 50 ms timeout held the first zone to 320
 * attachments a second for no reason but the timer.
 *
 * Two properties matter and they pull against each other: it must run at
 * display rate where there is a display, and it must still resolve where
 * there is not — a hidden tab gets no `requestAnimationFrame` callbacks, and
 * a poll that never resolves is a loading screen that never lifts.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { frameDelay } from '../src/app/Game';

const original = globalThis.requestAnimationFrame;

afterEach(() => {
  if (original === undefined)
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  else globalThis.requestAnimationFrame = original;
  vi.useRealTimers();
});

describe('frameDelay', () => {
  it('resolves on the animation frame, not on the fallback timer', async () => {
    vi.useFakeTimers();
    let frame: (() => void) | null = null;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frame = () => cb(0);
      return 1;
    }) as typeof requestAnimationFrame;

    const waited = frameDelay();
    let done = false;
    void waited.then(() => {
      done = true;
    });

    // Nothing has happened yet — neither clock has advanced.
    await Promise.resolve();
    expect(done).toBe(false);

    frame!();
    await waited;
    expect(done).toBe(true);
    // The point of the change: a display-rate frame settles it long before
    // the 50 ms fallback would have.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('still resolves with no animation frames at all', async () => {
    vi.useFakeTimers();
    delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;

    const waited = frameDelay();
    let done = false;
    void waited.then(() => {
      done = true;
    });

    await Promise.resolve();
    expect(done).toBe(false);

    // A hidden tab, or a headless environment: the fallback is the only way
    // out, and without it the loading screen would never lift.
    await vi.advanceTimersByTimeAsync(50);
    await waited;
    expect(done).toBe(true);
  });

  it('settles once, whichever arrives first', async () => {
    vi.useFakeTimers();
    let frame: (() => void) | null = null;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frame = () => cb(0);
      return 1;
    }) as typeof requestAnimationFrame;

    let resolutions = 0;
    const waited = frameDelay().then(() => {
      resolutions++;
    });

    frame!();
    await waited;
    // The loser still fires; it must not resolve a second time.
    await vi.advanceTimersByTimeAsync(100);
    expect(resolutions).toBe(1);
  });
});
