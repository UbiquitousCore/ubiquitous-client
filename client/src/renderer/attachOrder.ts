/** Which queued entity gets built next: farthest-first, popped from the near
 * end (`pop()` takes from the array end — nearest-first would serve nearest
 * last). Pinned by test; flipping either half silently inverts the order. */

/** Anything with a world position. Entities, in practice. */
export interface Positioned {
  readonly position: readonly [number, number, number];
}

/** Where the ordering is measured from — the renderer's `rig.target`. */
export interface Eye {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function distanceSquared(item: Positioned, eye: Eye): number {
  const dx = item.position[0] - eye.x;
  const dy = item.position[1] - eye.y;
  const dz = item.position[2] - eye.z;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Sort `queue` in place so that `queue.pop()` returns the nearest item.
 *
 * Farthest first, nearest last: `pop()` takes the cheap end of the array, and
 * the cheap end is where what should be built first belongs.
 */
export function orderForPop<T extends Positioned>(queue: T[], eye: Eye): void {
  queue.sort((a, b) => distanceSquared(b, eye) - distanceSquared(a, eye));
}

/**
 * Refill `out` with everything not yet built within `reach` of the eye,
 * ordered for `pop()`. Measured in three dimensions, like the draw distance.
 */
export function fillCandidates<T extends Positioned>(
  out: T[],
  items: Iterable<T>,
  isBuilt: (item: T) => boolean,
  eye: Eye,
  reach: number,
): void {
  out.length = 0;
  const reach2 = reach * reach;
  for (const item of items) {
    if (isBuilt(item)) continue;
    if (distanceSquared(item, eye) <= reach2) out.push(item);
  }
  orderForPop(out, eye);
}
