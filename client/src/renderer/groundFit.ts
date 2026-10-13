/**
 * A square decal fitted to the ground at its corners, each following only
 * standable ground within `MAX_GRADE` of the centre, else staying level.
 */

import { WALKABLE_NORMAL_Y } from '../world/CollisionWorld';
import type { GroundPoint } from '../world/World';

/** What fitting a decal asks of the world. */
export interface GroundQuery {
  /** The physics ground under a point, searching down from `fromY`. */
  groundPoint(x: number, z: number, fromY?: number): GroundPoint;
}

/** Heights of the four corners above the centre, in `QUAD_CORNERS` order. */
export type CornerHeights = [number, number, number, number];

/**
 * The corners as (x sign, z sign), in the order the vertex shader blends
 * them: a `PlaneGeometry` laid flat keeps its UVs, so uv (0, 0) sits at
 * -x, +z, uv (1, 0) at +x, +z, uv (0, 1) at -x, -z and uv (1, 1) at +x, -z.
 */
export const QUAD_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
];

/**
 * The steepest rise or fall, per unit of horizontal distance from the
 * centre, that a corner will follow. About 40°: a hillside, not a wall.
 */
export const MAX_GRADE = 0.85;

/** Room for the small bumps in flat ground, in world units. */
const BUMP_ALLOWANCE = 0.04;

/** How far the decal floats above the ground, so it never flickers into it. */
export const DECAL_LIFT = 0.04;

const FLAT: CornerHeights = [0, 0, 0, 0];

/** Corner heights for a square; on unwalkable ground at the centre it lies flat. */
export function fitCorners(
  world: GroundQuery,
  x: number,
  z: number,
  centre: GroundPoint,
  half: number,
): CornerHeights {
  if (centre.normal[1] < WALKABLE_NORMAL_Y) return [...FLAT];
  const reach = half * Math.SQRT2 * MAX_GRADE + BUMP_ALLOWANCE;
  const heights: CornerHeights = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const [sx, sz] = QUAD_CORNERS[i]!;
    const below = world.groundPoint(x + sx * half, z + sz * half, centre.y + reach);
    const rise = below.y - centre.y;
    const standable = below.normal[1] >= WALKABLE_NORMAL_Y;
    heights[i] = standable && Math.abs(rise) <= reach ? rise : 0;
  }
  return heights;
}
