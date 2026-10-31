/** Something a controller could point at, by where it stands on the ground. */
export interface SoftCandidate {
  id: number;
  x: number;
  z: number;
}

/** How far ahead the soft target looks, in world units. Own choice. */
export const SOFT_RANGE = 30;

/** Beyond this angle off the camera's heading nothing is a candidate, unless it is at your feet. Own choice. */
const SOFT_HALF_ANGLE = (75 * Math.PI) / 180;

/** Within this distance a body is a candidate whichever way the camera faces. Own choice. */
const SOFT_ARM_REACH = 4;

/**
 * How much clearly better a newcomer must score than the current soft target
 * to take its place; stops the highlight flickering between two bodies at a
 * similar distance as the camera swings. Own choice.
 */
const SOFT_HYSTERESIS = 1.25;

export interface PickSoftTargetArgs {
  from: readonly [number, number];
  /** Where the camera points on the ground; any length but zero. */
  heading: readonly [number, number];
  candidates: readonly SoftCandidate[];
  current: number | null;
}

/**
 * The body a controller would act on without a target chosen: near and in
 * front of the camera, nearest first with a lean towards whatever is dead
 * ahead. A body already highlighted keeps it until another is clearly better.
 */
export function pickSoftTarget(args: PickSoftTargetArgs): number | null {
  const { from, heading, candidates, current } = args;
  const length = Math.hypot(heading[0], heading[1]);
  if (length === 0) return null;
  const hx = heading[0] / length;
  const hz = heading[1] / length;

  const scores = new Map<number, number>();
  for (const c of candidates) {
    const dx = c.x - from[0];
    const dz = c.z - from[1];
    const distance = Math.hypot(dx, dz);
    if (distance > SOFT_RANGE) continue;
    const ahead = distance === 0 ? 1 : (dx * hx + dz * hz) / distance;
    if (distance > SOFT_ARM_REACH && Math.acos(Math.min(1, ahead)) > SOFT_HALF_ANGLE) continue;
    scores.set(c.id, distance * (2 - ahead));
  }

  let best: number | null = null;
  for (const [id, score] of scores) {
    const bestScore = best === null ? Infinity : (scores.get(best) ?? Infinity);
    if (score < bestScore || (score === bestScore && best !== null && id < best)) best = id;
  }
  if (best === null) return null;

  const held = current === null ? undefined : scores.get(current);
  if (held !== undefined && current !== best && held <= (scores.get(best) ?? 0) * SOFT_HYSTERESIS) {
    return current;
  }
  return best;
}
