/** What aura states do to a body: stealth makes it translucent, stun plays its loop, and the speed share slows the player. */
import { FIELD_IDS } from '../net/unitFields';
import type { MealState } from '../world/World';

/**
 * Whether a body is drawn translucent after this batch of values, or
 * undefined when the batch says nothing about it and the body keeps what it
 * had.
 */
export function isGhosted(values: Record<string, number>): boolean | undefined {
  const stealthed = values[FIELD_IDS.stealthed];
  return stealthed === undefined ? undefined : stealthed !== 0;
}

/**
 * Whether a body is stunned after this batch of values, or undefined when
 * the batch says nothing about it and the body keeps what it had.
 */
export function isStunned(values: Record<string, number>): boolean | undefined {
  const stunned = values[FIELD_IDS.stunned];
  return stunned === undefined ? undefined : stunned !== 0;
}

/** Where a body is in a meal after this batch of values; undefined when the batch says nothing. */
export function mealAfter(
  had: MealState | undefined,
  values: Record<string, number>,
): MealState | undefined {
  const eating = values[FIELD_IDS.eating];
  if (eating === undefined) return undefined;
  if (eating !== 0) return 'eating';
  return had === 'eating' ? 'rising' : null;
}

/**
 * The posture a meal puts a body in, or null for none. A body that moves has
 * left the table with no getting up; `rising` is asked for once, as its take
 * runs on by itself.
 */
export function mealPosture(
  body: { networkMeal?: MealState },
  standing: boolean,
): 'eating' | 'rising' | null {
  const meal = body.networkMeal ?? null;
  if (!standing || meal === 'rising') body.networkMeal = null;
  return standing ? meal : null;
}

/**
 * How a stealthed body shows on this screen: faded for the hero and their
 * team, and not at all for anyone else — not drawn, and not to be selected.
 * The server keeps such a body off every screen outside its team; this is
 * the same rule for a body this client already holds when stealth begins.
 */
export function stealthSight(
  stealthed: boolean | undefined,
  ownSide: boolean,
): 'shown' | 'faded' | 'hidden' {
  if (!stealthed) return 'shown';
  return ownSide ? 'faded' : 'hidden';
}

/**
 * The share of its normal speed the player may move at after this batch of
 * values — 0.5 while slowed by half, 0 while stunned — or undefined when the
 * batch says nothing about it and the speed stays as it was.
 */
export function speedShare(values: Record<string, number>): number | undefined {
  const percent = values[FIELD_IDS.moveSpeed];
  return percent === undefined ? undefined : Math.max(0, percent) / 100;
}
