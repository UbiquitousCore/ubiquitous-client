/** Where the guide arrow points: the tracked quest's finish zone when its
 * objectives are met, else its nearest unfinished guide zone (same map only).
 */

import type { QuestRecord, QuestArea } from '../net/GameConnection';

/**
 * Whether a requirement slot still wants something.
 *
 * A slot whose count is met stops being
 * somewhere worth going, so its zone drops out of the running.
 */
function objectiveDone(quest: QuestRecord, index: number): boolean {
  const objective = (quest.objectives ?? []).find(o => o.index === index);
  if (!objective) return false;
  const wanted = objective.goalCount || objective.objectiveItemCount;
  if (wanted <= 0) return true;
  return Math.max(objective.killed, objective.held, objective.triggered) >= wanted;
}

function distanceSquared(zone: QuestArea, from: readonly [number, number, number]): number {
  // Flat: the arrow lies on the ground and only ever turns about Y, so height
  // between the player and the zone must not decide which zone is nearest.
  const dx = zone.x - from[0];
  const dz = zone.z - from[2];
  return dx * dx + dz * dz;
}

/**
 * The zone the arrow should point at, or nothing when it should not be drawn.
 *
 * `tracked` is the tracked quest; pass null when none is tracked, which is the
 * common case and correctly draws no arrow.
 */
export function guideTarget(
  tracked: QuestRecord | null,
  mapId: number,
  position: readonly [number, number, number],
): QuestArea | null {
  if (!tracked) return null;

  if (tracked.readyToHandIn === true || tracked.status === 'finished') {
    const finish = tracked.handInZone;
    return finish && finish.mapId === mapId ? finish : null;
  }

  let nearest: QuestArea | null = null;
  let nearestDistance = Infinity;
  for (const [index, zone] of (tracked.guideZones ?? []).entries()) {
    if (zone.mapId !== mapId) continue;
    // The zones arrive in requirement order, so a zone's index is the
    // objective it belongs to — and a finished objective is not a destination.
    if (objectiveDone(tracked, index)) continue;
    const distance = distanceSquared(zone, position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = zone;
    }
  }
  return nearest;
}

/**
 * How the arrow is placed on the player, observed in play by the owner: a
 * model, not a ground decal, floating a little above the player and a little
 * ahead of them towards the target, drawn larger than the model's own size.
 */
const GUIDE_LOOK = {
  /** Units along the ground from the player towards the target. */
  ahead: 0.8,
  /** Units above the player's own height. */
  lift: 0.2,
  /** Times the model's own size. */
  scale: 2.5,
} as const;

/** The arrowhead's scale once loaded. */
export const GUIDE_SCALE = GUIDE_LOOK.scale;

/** `model/scene/sky/arrowhead/arrowhead.bdae` — the arrow itself. */
export const GUIDE_MODEL = 'model/scene/sky/arrowhead/arrowhead.bdae';

/**
 * Where the arrow sits and which way it faces: ahead of the player, so it
 * leads rather than being stood on. Null when the player is already standing
 * on the target, where a direction cannot be normalised and the arrow would
 * spin.
 */
export function guidePlacement(
  target: QuestArea,
  position: readonly [number, number, number],
): { position: [number, number, number]; yaw: number } | null {
  const dx = target.x - position[0];
  const dz = target.z - position[2];
  const length = Math.hypot(dx, dz);
  if (length < 1e-4) return null;

  const nx = dx / length;
  const nz = dz / length;
  return {
    position: [
      position[0] + nx * GUIDE_LOOK.ahead,
      position[1] + GUIDE_LOOK.lift,
      position[2] + nz * GUIDE_LOOK.ahead,
    ],
    /*
     * The arrowhead's nose is its **-Z**, so the yaw is the direction to the
     * target plus half a turn. Aiming +Z at the target would point the arrow
     * back at the player: lining the model's +Z up with `player - target` —
     * the direction *away* — is what leaves its nose facing the target.
     */
    yaw: Math.atan2(-nx, -nz),
  };
}
