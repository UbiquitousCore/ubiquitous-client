/** Who the hero turns to while casting: the spell's target, through the cast and a beat past its release. */

/** Own choice: long enough for a release clip to play out toward the target. */
export const CAST_FACE_HOLD_MS = 800;

export class CastFacing {
  /** The network id the last spell was aimed at, or null. */
  private aim: number | null = null;
  /** Until when the aim holds with no bar filling, in `performance.now()` ms. */
  private until = 0;

  /** A spell was sent at `networkId`; an instant has no bar, so the hold covers it until the release. */
  aimed(networkId: number, now: number): void {
    this.aim = networkId;
    this.until = now + CAST_FACE_HOLD_MS;
  }

  released(now: number): void {
    if (this.aim !== null) this.until = now + CAST_FACE_HOLD_MS;
  }

  /** Refused or interrupted. */
  dropped(): void {
    this.aim = null;
  }

  /** Whom to face now, or null; `casting` is whether a cast bar is filling. */
  target(casting: boolean, now: number): number | null {
    if (this.aim === null) return null;
    if (casting || now < this.until) return this.aim;
    this.aim = null;
    return null;
  }
}
