/** A concurrency cap, waiting in arrival order; callers already ask nearest-first, so the cap keeps that order meaningful. */
export class Limiter {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new RangeError(`limit must be >= 1, got ${limit}`);
  }

  /** Tasks running now. */
  get running(): number {
    return this.active;
  }

  /** Tasks waiting for a slot. */
  get pending(): number {
    return this.waiting.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>(resolve => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
