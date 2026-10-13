import { describe, expect, it } from 'vitest';

import { FrameClock, type FramePage, type Ticker } from '../src/app/frameClock';

/** A page whose frames and visibility the test turns by hand. */
function fakePage() {
  let hidden = false;
  let listener: (() => void) | null = null;
  let frames = new Map<number, (now: number) => void>();
  let next = 1;
  let clock = 0;
  const page: FramePage = {
    hidden: () => hidden,
    onVisibilityChange(l) {
      listener = l;
      return () => (listener = null);
    },
    requestFrame(callback) {
      frames.set(next, callback);
      return next++;
    },
    cancelFrame(handle) {
      frames.delete(handle);
    },
    now: () => clock,
  };
  return {
    page,
    setHidden(value: boolean) {
      hidden = value;
      listener?.();
    },
    /** Run every frame that is waiting, as the browser does once a paint. */
    paint(now: number) {
      clock = now;
      const waiting = frames;
      frames = new Map();
      for (const callback of waiting.values()) callback(now);
    },
    waitingFrames: () => frames.size,
    listening: () => listener !== null,
  };
}

function fakeTicker() {
  let tick: (() => void) | null = null;
  const ticker: Ticker = {
    start: t => (tick = t),
    stop: () => (tick = null),
  };
  return { ticker, fire: () => tick?.(), running: () => tick !== null };
}

describe('FrameClock', () => {
  it('ticks on animation frames and draws while the tab is visible', () => {
    const p = fakePage();
    const t = fakeTicker();
    const ticks: Array<[number, boolean]> = [];
    new FrameClock(p.page, t.ticker).start((now, drawn) => ticks.push([now, drawn]));
    p.paint(16);
    p.paint(32);
    expect(ticks).toEqual([
      [16, true],
      [32, true],
    ]);
    expect(t.running()).toBe(false);
  });

  it('keeps ticking from the background ticker, without drawing, while the tab is hidden', () => {
    const p = fakePage();
    const t = fakeTicker();
    const ticks: boolean[] = [];
    new FrameClock(p.page, t.ticker).start((_, drawn) => ticks.push(drawn));
    p.setHidden(true);
    p.paint(16); // a stale frame the browser delivers anyway must not tick
    t.fire();
    t.fire();
    expect(ticks).toEqual([false, false]);
    expect(p.waitingFrames()).toBe(0);
  });

  it('goes back to animation frames when the tab is shown again', () => {
    const p = fakePage();
    const t = fakeTicker();
    const ticks: boolean[] = [];
    new FrameClock(p.page, t.ticker).start((_, drawn) => ticks.push(drawn));
    p.setHidden(true);
    t.fire();
    p.setHidden(false);
    expect(t.running()).toBe(false);
    p.paint(100);
    expect(ticks).toEqual([false, true]);
  });

  it('starts on the background ticker when the tab is already hidden', () => {
    const p = fakePage();
    const t = fakeTicker();
    p.setHidden(true);
    new FrameClock(p.page, t.ticker).start(() => {});
    expect(t.running()).toBe(true);
    expect(p.waitingFrames()).toBe(0);
  });

  it('stops every source and stops listening', () => {
    const p = fakePage();
    const t = fakeTicker();
    let ticks = 0;
    const clock = new FrameClock(p.page, t.ticker);
    clock.start(() => ticks++);
    clock.stop();
    p.paint(16);
    p.setHidden(true);
    t.fire();
    expect(ticks).toBe(0);
    expect(p.listening()).toBe(false);
    expect(t.running()).toBe(false);
  });
});
