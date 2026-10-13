/** Hero's dead flag + pending death clip (client-owned body, not a
 * `NetworkBodies` actor). A repeat `unit.died` while already down is dropped;
 * death is edge-triggered, so a repeat is duplicate delivery, never a second
 * death. */

export class HeroDeath {
  private down = false;
  private pendingClip: string | null = null;

  /** True from the hero's own `unit.died` until the matching `player.revived`. */
  get isDown(): boolean {
    return this.down;
  }

  /**
   * Take a `unit.died` for the hero.
   *
   * Returns whether this is a *new* death — false for one that arrives with
   * the hero already down, which the caller drops whole.
   */
  markDown(): boolean {
    if (this.down) return false;
    this.down = true;
    return true;
  }

  /** `player.revived`: back on their feet, and nothing owed to the renderer. */
  revive(): void {
    this.down = false;
    this.pendingClip = null;
  }

  /**
   * Hold a resolved death clip until the renderer is asked for it.
   *
   * Ignored once the hero is back up: the clip is resolved asynchronously, so
   * a revive can land between the death and the answer, and a corpse's pose
   * has no business being played over a living body.
   */
  holdClip(clip: string): void {
    if (!this.down) return;
    this.pendingClip = clip;
  }

  /** The clip owed, consumed once. Null when nothing is owed. */
  takeClip(): string | null {
    const clip = this.pendingClip;
    this.pendingClip = null;
    return clip;
  }
}
