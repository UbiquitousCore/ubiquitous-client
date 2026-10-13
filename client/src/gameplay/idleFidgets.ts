/** Own choice: when an idle creature plays `idle01`/`idle02`, timed per body so a crowd does not fidget in step. */

/** The idle variations, in the order a draw picks them. */
export const FIDGET_CLIPS = ['idle01', 'idle02'] as const;

/** Seconds of unbroken idling before a fidget. Own choice. */
export const FIDGET_WAIT = { min: 8, max: 20 } as const;

export class IdleFidgets {
  private waited = 0;
  private wait: number;

  /** `random` returns a number in [0, 1), as `Math.random` does. */
  constructor(private readonly random: () => number = Math.random) {
    this.wait = this.draw();
  }

  /**
   * Advance one frame. `idling` is whether the body is standing on its plain
   * idle with nothing else playing; any other frame starts the wait again.
   * Returns the clip to play once, or null.
   */
  update(dt: number, idling: boolean): string | null {
    if (!idling) {
      this.waited = 0;
      return null;
    }
    this.waited += dt;
    if (this.waited < this.wait) return null;
    this.waited = 0;
    this.wait = this.draw();
    const at = Math.min(FIDGET_CLIPS.length - 1, Math.floor(this.random() * FIDGET_CLIPS.length));
    return FIDGET_CLIPS[at];
  }

  private draw(): number {
    return FIDGET_WAIT.min + this.random() * (FIDGET_WAIT.max - FIDGET_WAIT.min);
  }
}
