/** Walking up to a body to act on it: how close, when arrived, and what ends the walk. Pure. */

import type { Interaction } from './npcInteraction';

/** What the hero walks up to a body to do: every interaction but none. */
export type Intent = Exclude<Interaction, 'none'>;

/**
 * The furthest the server accepts a conversation, a shop, a loot or a use
 * from, measured centre to centre in three dimensions.
 */
export const INTERACT_REACH = 10;

/** The furthest the server lets a swing start from. */
export const MELEE_REACH = 3;

/** The furthest the server lets a fight start from with a ranged weapon held. */
export const RANGED_REACH = 25;

/**
 * Where a walk to swing at a body stops: a unit inside melee reach, so a
 * creature that takes a step while the start is on its way is still in reach
 * when it arrives.
 */
const MELEE_STOP = MELEE_REACH - 1;

/**
 * Where a walk to shoot at a body stops: five units inside ranged reach, for
 * the same reason as the melee stop and for a target already walking away.
 */
const RANGED_STOP = RANGED_REACH - 5;

/**
 * How far inside the server's reach a walk that can get no closer has to be
 * for it to act anyway. The server measures from the last position it was
 * told, which can trail the hero by a step.
 */
const REACH_MARGIN = 0.5;

/** How much closer a walk has to get to count as getting anywhere. */
const PROGRESS_STEP = 0.25;

/**
 * How long a walk may go without getting closer before it counts as stuck:
 * long enough to round a corner or hop a kerb, short enough that running into
 * a counter does not look like the client has hung.
 */
const STALL_SECONDS = 1.5;

/**
 * How far past a body's edge the hero stops: a comfortable distance to talk
 * across, clear of the body so the two do not overlap.
 */
const TALKING_GAP = 1.5;

/** A creature's radius when the server has not sent one. */
const ASSUMED_CREATURE_RADIUS = 1;

/** A player's radius, which nothing reports. */
const PLAYER_RADIUS = 0.5;

/** How far off a static object is used from. */
const OBJECT_USE_DISTANCE = 2.5;

/**
 * The furthest an approach ever stops. The server accepts an interaction
 * from up to ten units; stopping two short of that means a body drifting a
 * step after the hero arrives does not turn the click into a refusal.
 */
const LONGEST_STOP = 8;

/**
 * Where an approach comes to rest: the body's edge plus a talking gap for a
 * creature or a player, and one use distance for every static object.
 */
export function approachStopDistance(target: {
  kind: 'creature' | 'player' | 'static';
  /** The creature's own radius, when the server has sent one. */
  boundingRadius?: number;
}): number {
  let range: number;
  if (target.kind === 'static') {
    range = OBJECT_USE_DISTANCE;
  } else if (target.kind === 'player') {
    range = PLAYER_RADIUS + TALKING_GAP;
  } else {
    const radius =
      target.boundingRadius && target.boundingRadius > 0
        ? target.boundingRadius
        : ASSUMED_CREATURE_RADIUS;
    range = radius + TALKING_GAP;
  }
  return Math.min(range, LONGEST_STOP);
}

/** Where a walk to do this comes to rest. */
export function stopDistanceFor(
  intent: Intent,
  target: Parameters<typeof approachStopDistance>[0],
  holdsRangedWeapon: boolean,
): number {
  if (intent === 'attack') {
    return holdsRangedWeapon ? RANGED_STOP : Math.min(approachStopDistance(target), MELEE_STOP);
  }
  return approachStopDistance(target);
}

/** The furthest the server accepts a request to do this from. */
export function serverReach(intent: Intent, holdsRangedWeapon: boolean): number {
  if (intent !== 'attack') return INTERACT_REACH;
  return holdsRangedWeapon ? RANGED_REACH : MELEE_REACH;
}

/** The closest a walk has come, and since when it has come no closer. */
export interface Progress {
  closest: number;
  /** Seconds, on whatever clock the caller keeps. */
  since: number;
}

/** Fold this frame's distance into how the walk is going. */
export function trackProgress(prev: Progress | null, distance: number, now: number): Progress {
  if (prev === null || distance < prev.closest - PROGRESS_STEP)
    return { closest: distance, since: now };
  return prev;
}

/** Whether a walk has gone too long without getting closer. */
export function isStalled(progress: Progress, now: number): boolean {
  return now - progress.since >= STALL_SECONDS;
}

/** Arrived: strictly inside the range, measured in 3D feet to feet, so a target on a ledge is further. */
export function approachArrived(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  stopDistance: number,
): boolean {
  return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) < stopDistance;
}

/** What an approach should do this frame. */
export type ApproachAction =
  /** Drop it without acting: the player took over, or the body went away. */
  | { kind: 'cancel' }
  /** Drop it without acting: the hero can get no closer, and is out of reach. */
  | { kind: 'giveUp' }
  /** Keep running, re-aimed at where the body is now. */
  | { kind: 'run'; to: readonly [number, number, number] }
  /** Arrived and still moving: stop this frame and act on the next. */
  | { kind: 'brake' }
  /** Arrived and stopped: act on the body. */
  | { kind: 'act' };

/** What the caller knows about an approach in flight. */
export interface ApproachState {
  /** A dead hero walks nowhere. */
  heroDead: boolean;
  /** Whether the player is holding a direction. Jumping and looking are not. */
  directionHeld: boolean;
  /** The hero's own position, or null when the world has none. */
  here: readonly [number, number, number] | null;
  /** Where the body is now, or null when it has gone. */
  there: readonly [number, number, number] | null;
  /** Whether the body being approached is still the one last tapped. */
  stillWanted: boolean;
  /** Whether the player has picked a different target since, by any means. */
  retargeted: boolean;
  /** What the walk was asked to do on arrival. */
  asked: Interaction;
  /** What acting on the body would do now. */
  now: Interaction;
  /** How close the hero has to get. */
  stopDistance: number;
  /** The furthest the server accepts the request from. */
  reach: number;
  /** Whether the walk has stopped getting closer. See `isStalled`. */
  stalled: boolean;
  /** Whether an auto-run is currently in progress. */
  running: boolean;
}

/**
 * One frame of an approach; the order is the behaviour:
 * 1. A dead hero walks nowhere.
 * 2. Held input cancels outright (jumping and camera drags do not count).
 * 3. A target gone, or no longer the one wanted, ends it.
 * 4. A target that changed (died, turned hostile) ends it.
 * 5. Stuck: act from here if the server accepts that range, else give up.
 * 6. Stop, then act on the next frame, or a shop opens mid-slide.
 */
export function approachStep(state: ApproachState): ApproachAction {
  if (state.heroDead) return { kind: 'cancel' };
  if (state.directionHeld) return { kind: 'cancel' };
  if (state.here === null || state.there === null) return { kind: 'cancel' };
  if (!state.stillWanted || state.retargeted) return { kind: 'cancel' };
  if (state.now !== state.asked) return { kind: 'cancel' };
  if (!approachArrived(state.here, state.there, state.stopDistance)) {
    if (!state.stalled) return { kind: 'run', to: state.there };
    if (!approachArrived(state.here, state.there, state.reach - REACH_MARGIN)) {
      return { kind: 'giveUp' };
    }
  }
  return state.running ? { kind: 'brake' } : { kind: 'act' };
}
