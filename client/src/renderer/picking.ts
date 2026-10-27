/** What a tap selects: a hit walked up to its entity, skipping nameplates and effects. */

import * as THREE from 'three';

import type { Entity, EntityId } from '../world/World';

export function markNotPickable(object: THREE.Object3D): void {
  object.userData.pickIgnore = true;
}

/** Entity owning a raycast hit, or null (`pickIgnore` disowns the subtree). */
export function ownerOfPick(hit: THREE.Object3D, root: THREE.Object3D | null): EntityId | null {
  let object: THREE.Object3D | null = hit;
  let owner: EntityId | null = null;
  while (object && object !== root) {
    if (object.userData.pickIgnore === true) return null;
    if (owner === null && typeof object.userData.entityId === 'number') {
      owner = object.userData.entityId as EntityId;
    }
    object = object.parent;
  }
  return owner;
}

/** Raycast-pickable: creatures/players always; statics only with an
 * interactionIcon, or that can be gathered from (exported for the picking test). */
export function isPickableEntity(entity: Entity | undefined): boolean {
  if (!entity) return false;
  if (entity.kind === 'creature' || entity.kind === 'player') return true;
  return (
    entity.kind === 'static' && (entity.interactionIcon !== undefined || entity.gatherable === true)
  );
}

/** Placements still not actually there: queued + in-flight (exported for test). */
export function pendingAttachmentCount(queued: number, inFlight: number): number {
  return queued + inFlight;
}

/**
 * Re-measure every skinned mesh under `root` in its current pose. Three.js
 * measures a skinned mesh once and keeps it, and a raycast tests those bounds
 * first, so a body that has since lain down cannot be clicked where it lies.
 */
export function refreshSkinnedBounds(root: THREE.Object3D): void {
  root.traverse(child => {
    const mesh = child as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    mesh.computeBoundingSphere();
    if (mesh.boundingBox !== null) mesh.computeBoundingBox();
  });
}

/** A body's footprint on the screen, in CSS pixels, and how far from the camera it is. */
export interface ScreenFootprint {
  id: EntityId;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  depth: number;
}

/**
 * The body a tap near, but not exactly on, meant. A fingertip covers far more
 * than the pixel a ray goes through, and a thin or distant body is easily
 * missed by it: every footprint grown by `pad` pixels that holds the point is
 * a candidate, and the one the point sits closest to wins, the nearer to the
 * camera on a tie.
 */
export function nearestFootprint(
  footprints: readonly ScreenFootprint[],
  x: number,
  y: number,
  pad: number,
): EntityId | null {
  let best: { id: EntityId; gap: number; depth: number } | null = null;
  for (const f of footprints) {
    const gapX = Math.max(f.minX - x, 0, x - f.maxX);
    const gapY = Math.max(f.minY - y, 0, y - f.maxY);
    const gap = Math.hypot(gapX, gapY);
    if (gap > pad) continue;
    if (best === null || gap < best.gap || (gap === best.gap && f.depth < best.depth)) {
      best = { id: f.id, gap, depth: f.depth };
    }
  }
  return best?.id ?? null;
}
