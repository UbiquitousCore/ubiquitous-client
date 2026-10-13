/** How visible an effect is at a distance, and where that distance is measured from. */

import * as THREE from 'three';

/** How far into the effect distance the fade starts. Own choice. */
export const EFFECT_FADE_FRACTION = 0.75;

/** Visibility from squared distance: 1, fading linearly over the last quarter, then 0. */
export function effectFade(distanceSquared: number, effectDistance: number): number {
  if (effectDistance <= 0) return 0;
  const limit = effectDistance * effectDistance;
  if (distanceSquared > limit) return 0;
  const fadeStart = effectDistance * EFFECT_FADE_FRACTION;
  if (distanceSquared <= fadeStart * fadeStart) return 1;
  const band = effectDistance - fadeStart;
  return Math.max(0, (effectDistance - Math.sqrt(distanceSquared)) / band);
}

/**
 * An effect's world position: its own position when free-standing, the
 * host bone's world matrix when attached (its own is the origin, which would
 * cull everything).
 * @param host the parent bone, with a current world matrix.
 */
export function effectWorldPosition(
  object: THREE.Object3D,
  attached: boolean,
  host: THREE.Object3D | null,
): [number, number, number] {
  if (attached && host) {
    const m = host.matrixWorld.elements;
    return [m[12]!, m[13]!, m[14]!];
  }
  const p = object.position;
  return [p.x, p.y, p.z];
}
