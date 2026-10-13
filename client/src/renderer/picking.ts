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
