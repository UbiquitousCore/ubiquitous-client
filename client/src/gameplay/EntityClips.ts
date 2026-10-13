/** One body's clip state over a `ClipMachine`; the player and every server body use it alike. */

import { ClipMachine } from './ClipMachine';
import type { ClipRequest, DurationOf, Movement, Posture } from './ClipMachine';

export class EntityClips {
  private readonly machine = new ClipMachine();
  /** Held one frame past release, so the settle row can be reached. */
  private lastMovement: Movement = 'stop';
  /**
   * The posture held on the previous frame, so the settle can be limited to
   * the gait that actually has one.
   */
  private lastPosture: Posture = 'stand';
  /** Last clip actually issued, so an unchanged frame costs nothing. */
  private lastClip = '';
  private mounted = false;

  /** True while a one-shot is playing over the loop. */
  get busy(): boolean {
    return this.machine.playingOneShot;
  }

  /** Mounting swaps the clip set, so the sequencer starts fresh. */
  setMounted(mounted: boolean): void {
    if (mounted === this.mounted) return;
    this.mounted = mounted;
    this.reset();
  }

  /** Forget everything. For a teleport, a zone change, a mount swap. */
  reset(): void {
    this.machine.reset();
    this.lastMovement = 'stop';
    this.lastPosture = 'stand';
    this.lastClip = '';
  }

  /** Forget what is playing: `setEntityClip` before a mixer exists is a no-op, so re-issue later. */
  invalidate(): void {
    this.lastClip = '';
  }

  /**
   * Advance one frame. Returns the clip to switch to, or null when what is
   * already playing is still right.
   */
  update(
    posture: Posture,
    movement: Movement,
    dt: number,
    durationOf: DurationOf,
  ): ClipRequest | null {
    // Out of a run only: no model ships a walking settle clip, so a walk
    // just stops.
    const settling =
      posture === 'stand' &&
      movement === 'stop' &&
      this.lastMovement !== 'stop' &&
      this.lastPosture === 'run';
    const effective = settling ? this.lastMovement : movement;
    this.lastMovement = movement;
    this.lastPosture = posture;

    const want = this.machine.update(
      posture,
      effective,
      this.mounted ? 'mount' : 'foot',
      dt,
      durationOf,
    );
    if (want.clip === this.lastClip) return null;
    this.lastClip = want.clip;
    return want;
  }

  /** A one-shot no state asked for (emote, gesture, fidget); moving cancels it. */
  playOnce(clip: string, durationOf: DurationOf): void {
    this.machine.playOnce(clip, durationOf);
    this.lastClip = '';
  }
}
