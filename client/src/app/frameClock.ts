/**
 * What drives the frame loop: rAF while visible; a worker timer while hidden
 * (page timers drop to once a second), simulating without drawing.
 */

/** One tick. `drawn` is false while the tab is hidden: nobody sees a draw. */
export type FrameTick = (now: number, drawn: boolean) => void;

/** Calls `tick` until stopped. The background half of the clock. */
export interface Ticker {
  start(tick: () => void): void;
  stop(): void;
}

/** Everything the clock needs from the page, so a test can stand in for it. */
export interface FramePage {
  hidden(): boolean;
  onVisibilityChange(listener: () => void): () => void;
  requestFrame(callback: (now: number) => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}

/** Drives `tick` from animation frames while visible and from `background` while hidden. */
export class FrameClock {
  private frameHandle = 0;
  private running = false;
  private unlisten: (() => void) | null = null;
  /** Bumped on every switch, so a callback from the source just left does nothing. */
  private generation = 0;

  constructor(
    private readonly page: FramePage,
    private readonly background: Ticker,
  ) {}

  start(tick: FrameTick): void {
    if (this.running) return;
    this.running = true;
    this.unlisten = this.page.onVisibilityChange(() => this.follow(tick));
    this.follow(tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    this.page.cancelFrame(this.frameHandle);
    this.background.stop();
    this.unlisten?.();
    this.unlisten = null;
  }

  /** Put the tick on whichever source suits the page as it is now. */
  private follow(tick: FrameTick): void {
    if (!this.running) return;
    const generation = ++this.generation;
    this.page.cancelFrame(this.frameHandle);
    this.background.stop();
    if (this.page.hidden()) {
      this.background.start(() => {
        if (generation === this.generation) tick(this.page.now(), false);
      });
      return;
    }
    const frame = (now: number): void => {
      if (generation !== this.generation) return;
      tick(now, true);
      if (generation === this.generation) this.frameHandle = this.page.requestFrame(frame);
    };
    this.frameHandle = this.page.requestFrame(frame);
  }
}

/** How often a hidden tab is ticked. Often enough to steer a follow; nothing is drawn. */
export const BACKGROUND_TICK_MS = 50;

/** The page this runs in. */
export function browserPage(): FramePage {
  return {
    hidden: () => document.visibilityState === 'hidden',
    onVisibilityChange(listener) {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
    requestFrame: callback => requestAnimationFrame(callback),
    cancelFrame: handle => cancelAnimationFrame(handle),
    now: () => performance.now(),
  };
}

/**
 * A ticker whose timer runs in a worker, which a hidden page does not slow.
 * Falls back to the page's own timer, slowed or not, if no worker starts.
 */
export function workerTicker(intervalMs = BACKGROUND_TICK_MS): Ticker {
  let worker: Worker | null = null;
  let fallback = 0;
  return {
    start(tick) {
      try {
        worker ??= new Worker(new URL('./tickWorker.ts', import.meta.url), {
          type: 'module',
          name: 'ubiquitous-ticks',
        });
        worker.onmessage = () => tick();
        worker.postMessage(intervalMs);
      } catch {
        fallback = window.setInterval(tick, intervalMs);
      }
    },
    stop() {
      worker?.postMessage(0);
      if (worker) worker.onmessage = null;
      window.clearInterval(fallback);
      fallback = 0;
    },
  };
}
