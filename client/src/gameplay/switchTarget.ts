/** Switch Target: a spell every class starts with, which the client carries out by picking a target. */

/** `spell_new` row 111 in 1.1.4, named "Switch Target" in the strings. */
export const SWITCH_TARGET_SPELL = 111;

export interface SwitchCandidate {
  id: number;
  position: readonly [number, number, number];
  attackable: boolean;
}

/**
 * The enemy a press of Switch Target picks: the nearest one in reach, or,
 * while one of them is already the target, the next one out from it, back
 * round to the nearest after the farthest. Null when none is in reach.
 */
export function switchTargetPick(
  candidates: readonly SwitchCandidate[],
  from: readonly [number, number, number],
  reach: number,
  current: number | null,
): number | null {
  const distance = (at: readonly [number, number, number]): number =>
    Math.hypot(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
  const inReach = candidates
    .filter(one => one.attackable && distance(one.position) <= reach)
    .map(one => ({ id: one.id, distance: distance(one.position) }))
    .sort((a, b) => a.distance - b.distance || a.id - b.id);
  if (inReach.length === 0) return null;
  const at = inReach.findIndex(one => one.id === current);
  return inReach[(at + 1) % inReach.length]!.id;
}
