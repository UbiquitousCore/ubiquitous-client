/** What a blow's outcome means for attacker and defender; decisions only, no drawing. */

import type { Hand, Outcome } from '../net/wireCodes';
import { OFF_HAND_SWING, swingsOffHand, type EquippedWeapons } from './weaponClips';

/** The outcomes a blow can be turned aside by, which float a word of their own. */
export type TurnedAside = 'miss' | 'dodge' | 'parry' | 'block';

/** The word a turned blow floats: miss, dodge and parry alone, block beside what got through; else null. */
export function turnedAside(outcome: Outcome | null): TurnedAside | null {
  return outcome === 'miss' || outcome === 'dodge' || outcome === 'parry' || outcome === 'block'
    ? outcome
    : null;
}

/** Whether the outcome restored health rather than taking it. */
export function restoresHealth(outcome: Outcome | null): boolean {
  return outcome === 'heal' || outcome === 'periodicHeal';
}

/** A health change gets a number; so does a fully absorbed blow, reading 0. */
export function showsANumber(damage: number, absorbed: number): boolean {
  return damage !== 0 || absorbed > 0;
}

/** Whether the blow reached the defender: a hit or a critical, from a weapon or a spell. */
export function lands(outcome: Outcome | null): boolean {
  return outcome === 'hit' || outcome === 'critical';
}

/** Whether the outcome was a critical. */
export function isCritical(outcome: Outcome | null): boolean {
  return outcome === 'critical';
}

/**
 * The attacker's clips, by the names the animation table gives them. Which
 * outcome plays which is what the names imply; the random pick between the
 * two ordinary swings is own choice.
 */
export const ATTACK_CLIPS = {
  /** Two swings, picked at random, so a long fight does not repeat one move. */
  swings: ['combat01', 'combat02'],
  critical: 'combat_critical',
  shoot: 'combat_fire',
} as const;

/** Ms into a swing when it lands: the median fastest frame is 12 at 30 fps (`realPacks.test.ts`). */
export const SWING_LANDS_AFTER_MS = 400;

/** Which swing a melee blow shows. `roll` is a number in [0, 1). */
export function swingFor(outcome: Outcome | null, roll: number): string {
  if (isCritical(outcome)) return ATTACK_CLIPS.critical;
  return ATTACK_CLIPS.swings[roll < 0.5 ? 0 : 1];
}

/** The off hand swings its own clip where it has one, else nothing: two daggers struck twice per swing seen. */
export function attackerClipFor(
  outcome: Outcome | null,
  hand: Hand,
  roll: number,
  offHandSwings = false,
): string | null {
  if (hand === 'off') return offHandSwings ? OFF_HAND_SWING : null;
  return swingFor(outcome, roll);
}

/** How long a swing whose clip has not loaded yet is taken to last. Own choice. */
export const SWING_UNKNOWN_MS = 900;

/**
 * A blow's attacker clip and the queue wait (`SWING_UNKNOWN_MS` while the
 * clip loads); asking books the swing, so call once per blow.
 * @param clipSeconds the clip's length, or null if not loaded.
 */
export function planSwing(args: {
  outcome: Outcome | null;
  hand: Hand;
  roll: number;
  weapons: EquippedWeapons | null;
  clipSeconds: (clip: string) => number | null;
  queue: SwingQueue;
  attacker: number;
  now: number;
}): { clip: string; waitMs: number } | null {
  const clip = attackerClipFor(args.outcome, args.hand, args.roll, swingsOffHand(args.weapons));
  if (!clip) return null;
  const seconds = args.clipSeconds(clip);
  const waitMs = args.queue.wait(
    args.attacker,
    args.hand,
    args.now,
    seconds === null ? SWING_UNKNOWN_MS : seconds * 1000,
  );
  return { clip, waitMs };
}

/** Own choice: an off-hand swing arriving during another waits for it; main-hand swings start at once. */
export class SwingQueue {
  private readonly busyUntil = new Map<number, number>();

  /**
   * How long to wait, in milliseconds, before starting `attacker`'s swing
   * with `hand`, asked for at `now` and lasting `lasts`.
   */
  wait(attacker: number, hand: Hand, now: number, lasts: number): number {
    const busy = this.busyUntil.get(attacker) ?? 0;
    const wait = hand === 'off' ? Math.max(0, busy - now) : 0;
    this.busyUntil.set(attacker, now + wait + lasts);
    return wait;
  }

  /** `attacker` stopped fighting; nothing of theirs is still swinging. */
  stopped(attacker: number): void {
    this.busyUntil.delete(attacker);
  }
}

/** Shots still owed to their shooter: other screens see only the landing, so it plays the shot then. */
export class ShotsInFlight {
  private readonly leaving = new Map<number, number>();

  /** A shot seen leaving `shooter`, whose clip has played. */
  left(shooter: number): void {
    this.leaving.set(shooter, (this.leaving.get(shooter) ?? 0) + 1);
  }

  /** The shooter's clip for a shot of theirs that landed, or null for none. */
  landed(shooter: number): string | null {
    const seen = this.leaving.get(shooter) ?? 0;
    if (seen === 0) return ATTACK_CLIPS.shoot;
    if (seen === 1) this.leaving.delete(shooter);
    else this.leaving.set(shooter, seen - 1);
    return null;
  }

  /** `shooter` stopped attacking; a shot of theirs that never lands is forgotten. */
  stopped(shooter: number): void {
    this.leaving.delete(shooter);
  }
}

/**
 * The defender's clips, by the names the animation table gives them, each
 * played for the outcome its name implies. A body mid-melee flinches from its
 * battle stance; one standing idle flinches from where it stands.
 */
export const REACTION_CLIPS = {
  flinchIdle: 'hurt_idle',
  flinchFighting: 'hurt_battle',
  dodge: 'dodge',
  parry: 'combat_block',
  shieldBlock: 'combat_block_shield',
} as const;

/**
 * The particle files a blow throws off the defender. Each is found in the
 * user's spell visual table as the visual that plays that file alone.
 */
export const SPARK_FILES = {
  landed: 'Character_Debuff_HitSparkle.beff',
  parried: 'character_debuff_parry.beff',
} as const;

/** What the defender shows for one blow. */
export interface DefendReaction {
  /** A clip name, looked up in the animation table before it plays. */
  clip: string;
  /** The particle file to spark on the defender, if any. */
  spark?: string;
}

/**
 * The defender's reaction to a blow, or null when the body does not react.
 *
 * @param fighting Whether the defender is itself in a melee stance.
 */
export function defendReaction(outcome: Outcome | null, fighting: boolean): DefendReaction | null {
  switch (outcome) {
    case 'hit':
    case 'critical':
      return {
        clip: fighting ? REACTION_CLIPS.flinchFighting : REACTION_CLIPS.flinchIdle,
        spark: SPARK_FILES.landed,
      };
    case 'dodge':
      return { clip: REACTION_CLIPS.dodge };
    case 'parry':
      return { clip: REACTION_CLIPS.parry, spark: SPARK_FILES.parried };
    case 'block':
      return { clip: REACTION_CLIPS.shieldBlock };
    default:
      return null;
  }
}
