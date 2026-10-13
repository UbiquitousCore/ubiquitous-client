/**
 * The hero's movement sounds, by pack name. On foot, footsteps follow the
 * clip's footfalls (`renderer/footfalls.ts`); otherwise a timer (own choice).
 * Only the hero is heard moving (own choice). Pure; the caller plays.
 */

import type { Locomotion } from './PlayerMovement';

/** One frame of the hero's movement, as far as sound cares. */
export interface MoveFacts {
  locomotion: Locomotion;
  moving: boolean;
  /** Stepping backwards, which is a walk rather than a run. */
  backward: boolean;
  /** Pushed off the ground this frame. */
  jumped: boolean;
  /** Touched down this frame. */
  landed: boolean;
  /** Standing in water shallow enough to walk through. */
  wading: boolean;
  /** What is underfoot, out of the water. */
  surface: 'ground' | 'wood';
  /** Swimming under the surface. */
  underwater: boolean;
  /** The mount's footstep prefix (`sfx_hoof_`), or null on foot. */
  mount: string | null;
  /**
   * Where the clip the hero plays is in its cycle, 0..1, and where its feet
   * come down in it; null while that is not known.
   */
  stride?: { phase: number; footfalls: readonly number[] } | null;
}

/** One sound to play: the first of these names the catalogue has. */
export type SoundChoice = readonly string[];

export interface MoveHeard {
  sounds: SoundChoice[];
  /** Whether the hero voices the jump. */
  jumpVoice: boolean;
}

/**
 * Seconds between footfalls where the clip's own are not known: running,
 * stepping backwards, and between swimming strokes. **Own choice**, set by
 * ear against the run, walk and swim clips.
 */
export const STRIDE_S = { run: 0.32, walk: 0.48, swim: 1.1 } as const;

export class MoveSounds {
  /** Seconds since the last footfall; Infinity when the next one is due at once. */
  private sinceS = Infinity;
  private was: Locomotion = 'ground';
  /** Where the clip was in its cycle last frame, while footfalls follow it. */
  private phase: number | null = null;

  step(facts: MoveFacts, dt: number): MoveHeard {
    const sounds: SoundChoice[] = [];
    const fell = facts.locomotion === 'swim' && this.was === 'air';
    if (facts.landed || fell) sounds.push(this.touchdown(facts, fell));

    const pace = paceOf(facts);
    const stride = pace !== null && pace !== 'swim' && facts.mount === null ? facts.stride : null;
    if (pace !== null && stride) {
      // A foot came down in the clip since last frame.
      if (this.phase !== null && passes(this.phase, stride.phase, stride.footfalls)) {
        sounds.push(this.footfall(facts, pace));
      }
      this.phase = stride.phase;
      // Should the clip stop being known, the timer picks up a stride from here.
      this.sinceS = 0;
    } else if (pace === null) {
      this.phase = null;
      // Standing, or in the air: the first footfall of the next stride is at once.
      this.sinceS = Infinity;
    } else {
      this.phase = null;
      this.sinceS += dt;
      if (this.sinceS >= STRIDE_S[pace]) {
        sounds.push(this.footfall(facts, pace));
        // One footfall per stride, however long the frame; a stall does not
        // bank up a burst of them.
        this.sinceS = this.sinceS === Infinity ? 0 : this.sinceS - STRIDE_S[pace];
        if (this.sinceS >= STRIDE_S[pace]) this.sinceS = 0;
      }
    }

    this.was = facts.locomotion;
    return { sounds, jumpVoice: facts.jumped && facts.mount === null };
  }

  private footfall(facts: MoveFacts, pace: keyof typeof STRIDE_S): SoundChoice {
    if (pace === 'swim') return [facts.underwater ? 'sfx_mc_swim_underwater_1' : 'sfx_mc_swim_1'];
    const underfoot = facts.wading ? 'water' : facts.surface;
    if (facts.mount === null) return [`sfx_mc_footstep_${underfoot}_1`];
    const gait = pace === 'walk' ? 'footsteps_slow_' : 'footstep_';
    return [`${facts.mount}${gait}${underfoot}_1`, `${facts.mount}footstep_${underfoot}_1`];
  }

  /** Landing, or dropping into deep water. */
  private touchdown(facts: MoveFacts, intoDeepWater: boolean): SoundChoice {
    const wet = intoDeepWater || facts.wading;
    if (facts.mount === null) {
      return [wet ? 'sfx_mc_enter_water' : `sfx_mc_jump_land_${facts.surface}_1`];
    }
    // Mounts ship their water landing under one of two names.
    return wet
      ? [`${facts.mount}jump_land_water_1`, `${facts.mount}jump_land_swamp_1`]
      : [`${facts.mount}jump_land_${facts.surface}_1`];
  }
}

/** Whether a clip going from `from` to `to` in its cycle passes a footfall, wrapping at the end. */
export function passes(from: number, to: number, footfalls: readonly number[]): boolean {
  if (to >= from) return footfalls.some(at => at > from && at <= to);
  return footfalls.some(at => at > from || at <= to);
}

/** Which stride the hero is taking, or null when no footfalls are due. */
function paceOf(facts: MoveFacts): keyof typeof STRIDE_S | null {
  if (!facts.moving) return null;
  if (facts.locomotion === 'swim') return 'swim';
  if (facts.locomotion !== 'ground') return null;
  return facts.backward ? 'walk' : 'run';
}
