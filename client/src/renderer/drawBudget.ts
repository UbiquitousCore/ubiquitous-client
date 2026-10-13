/**
 * Draw and animation budgets from the player: draws counted in distance bands
 * so the radius shrinks nearest-first; animation a nearer distance.
 * `hashPhase` spreads rechecks over frames.
 */
import * as THREE from 'three';

import { DEFAULT_GRAPHICS } from '../core/graphics';
import { ANIMATION_ALWAYS_DISTANCE, ANIMATION_BOUND_RADIUS } from './Renderer';

/**
 * Distance bands the draw budget sorts entities into (histogram, one pass, no
 * sort). Budgets draws, not entities (a placement costs one draw per mesh per
 * material group).
 */
export const HIDE_BANDS = 96;

/** Recheck distance visibility after the player has moved this far. */
export const VISIBILITY_RECHECK_DISTANCE = 2;

/** Padding radius for `isFoliageVisible`'s frustum test — keeps a blade from popping right at the edge of view on a small camera turn. */
export const FOLIAGE_FRUSTUM_PAD = 2;

/** Never culled by view direction inside this radius — directly underfoot, where "is it in view" is the wrong question. */
export const FOLIAGE_ALWAYS_VISIBLE_DISTANCE = 6;

/** Draw-call cost of one subtree: one per sprite and per mesh, or one per
 * group for a mesh with an array of materials. */
export function countDraws(object: THREE.Object3D): number {
  let draws = 0;
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if ((child as THREE.Sprite).isSprite) {
      draws++;
      return;
    }
    if (!mesh.isMesh) return;
    const groups = mesh.geometry?.groups;
    draws += Array.isArray(mesh.material) && groups && groups.length > 0 ? groups.length : 1;
  });
  return draws;
}

/** Draw-budget radius: walk bands outward, stop at the inner edge of the
 * band that breaks the budget (never over budget). */
export function budgetRadius(
  bandDraws: ArrayLike<number>,
  bandWidth: number,
  budget: number,
  max: number,
): number {
  let cumulative = 0;
  for (let i = 0; i < bandDraws.length; i++) {
    cumulative += bandDraws[i];
    if (cumulative > budget) return i * bandWidth;
  }
  return max;
}

/** Scratch for `shouldPose`, which runs once per animated character per frame.
 * Radius is a placeholder — set from `ANIMATION_BOUND_RADIUS` below every use. */
export const poseSphere = new THREE.Sphere(new THREE.Vector3(), 1);

/** Pose this body? Too far, then off screen; within `ANIMATION_ALWAYS_DISTANCE` the frustum is skipped. */
export function shouldPose(
  frustum: THREE.Frustum,
  x: number,
  y: number,
  z: number,
  d2: number,
  animationDistance = DEFAULT_GRAPHICS.animationDistance,
  boundRadius = ANIMATION_BOUND_RADIUS,
): boolean {
  if (d2 > animationDistance * animationDistance) return false;
  if (d2 <= ANIMATION_ALWAYS_DISTANCE * ANIMATION_ALWAYS_DISTANCE) return true;
  poseSphere.center.set(x, y, z);
  // A windmill is posed by its sails, not its footing: the sphere covers
  // the whole model, so a centre barely off screen does not freeze it.
  poseSphere.radius = boundRadius;
  return frustum.intersectsSphere(poseSphere);
}

/** An animated entry's own cull radius, measured once: tall models keep posing while any part shows. */
export function animatedRadius(entry: { object: THREE.Object3D; boundRadius?: number }): number {
  if (entry.boundRadius === undefined) {
    const sphere = new THREE.Box3().setFromObject(entry.object).getBoundingSphere(new THREE.Sphere());
    entry.boundRadius = Number.isFinite(sphere.radius)
      ? Math.max(ANIMATION_BOUND_RADIUS, sphere.radius)
      : ANIMATION_BOUND_RADIUS;
  }
  return entry.boundRadius;
}

export const foliageSphere = new THREE.Sphere(new THREE.Vector3(), FOLIAGE_FRUSTUM_PAD);

/** Whether a foliage placement is on screen; directly underfoot skips the frustum, as `shouldPose` does. */
export function isFoliageVisible(
  frustum: THREE.Frustum,
  x: number,
  y: number,
  z: number,
  d2: number,
): boolean {
  if (d2 <= FOLIAGE_ALWAYS_VISIBLE_DISTANCE * FOLIAGE_ALWAYS_VISIBLE_DISTANCE) return true;
  foliageSphere.center.set(x, y, z);
  foliageSphere.radius = FOLIAGE_FRUSTUM_PAD;
  return frustum.intersectsSphere(foliageSphere);
}

/** Deterministic 0..1 from an entity id, for scattering animation phase. */
export function hashPhase(id: number): number {
  const x = Math.sin(id * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Which animation tier a squared distance falls in, as the stride to pose
 * it this frame or 0 to leave it: near every frame, then every 2nd, 4th
 * and 8th, so distant motion slows in steps instead of freezing at one
 * visible line. Squared bounds, since the caller already holds `d2`.
 */
export function animationStride(
  d2: number,
  frame: number,
  index: number,
  near: number,
  midA: number,
  midB: number,
  far: number,
): number {
  const stride = d2 <= near ? 1 : d2 <= midA ? 2 : d2 <= midB ? 4 : d2 <= far ? 8 : 0;
  return stride === 0 || (frame + index) % stride === 0 ? stride : 0;
}
