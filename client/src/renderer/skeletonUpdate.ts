/**
 * Skip a skeleton's per-frame upload when no bone's world matrix changed
 * since the last real update; inverse binds are fixed, so the texture is
 * still right. Comparison needs no bookkeeping from whatever moves bones.
 */

import * as THREE from 'three';

/** Every bone's world matrix as of the last update that did the work. */
const lastWorlds = new WeakMap<THREE.Skeleton, Float32Array>();

/** Whether any bone's world matrix differs from `seen`; brings `seen` up to date either way. */
export function bonesMoved(
  bones: readonly (THREE.Bone | undefined)[],
  seen: Float32Array,
): boolean {
  let moved = false;
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i];
    if (!bone) continue;
    const e = bone.matrixWorld.elements;
    const at = i * 16;
    for (let j = 0; j < 16; j++) {
      // Float32 storage: compare what was stored, not the double it came from.
      const value = Math.fround(e[j]!);
      if (seen[at + j] !== value) {
        seen[at + j] = value;
        moved = true;
      }
    }
  }
  return moved;
}

let installed = false;

/** Patch `Skeleton.update` once for the whole page. Idempotent. */
export function installSkeletonUpdateSkip(): void {
  if (installed) return;
  installed = true;
  const update = THREE.Skeleton.prototype.update;
  THREE.Skeleton.prototype.update = function (this: THREE.Skeleton): void {
    let seen = lastWorlds.get(this);
    if (!seen || seen.length !== this.bones.length * 16) {
      seen = new Float32Array(this.bones.length * 16).fill(NaN);
      lastWorlds.set(this, seen);
    }
    if (!bonesMoved(this.bones, seen)) return;
    update.call(this);
  };
}
