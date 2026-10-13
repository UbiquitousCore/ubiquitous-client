/** Fading and ghosting bodies through pooled material clones, so shared originals are untouched. */

import * as THREE from 'three';

import {
  acquireFadeClone,
  clearGhostAlpha,
  releaseFadeClone,
  setFade,
  setGhostAlpha,
} from './fadeMaterial';
import type { MaterialCache } from './MaterialCache';
import type { EntityView } from './Renderer';

/** Give an object its own materials for a fade; unpatchable ones (the waterfall) do not dissolve. Idempotent. */
export function beginObjectFade(view: EntityView): void {
  if (view.fadeMaterials) return;
  const swaps: NonNullable<EntityView['fadeMaterials']> = [];
  view.object.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const shared = mesh.material;
    const own = Array.isArray(shared)
      ? shared.map(m => acquireFadeClone(m) ?? m)
      : acquireFadeClone(shared);
    if (own === null) return;
    if (Array.isArray(own) && own.every((m, i) => m === (shared as THREE.Material[])[i])) return;
    mesh.material = own;
    swaps.push({ mesh, shared, own });
  });
  if (swaps.length > 0) view.fadeMaterials = swaps;
}

export function applyObjectFade(view: EntityView, fade: number): void {
  for (const { own } of view.fadeMaterials ?? []) {
    if (Array.isArray(own)) own.forEach(m => setFade(m, fade));
    else setFade(own, fade);
  }
}

/** Draw a body's materials translucent, without depth writes, or it punches holes in itself. */
export function applyObjectGhost(view: EntityView, alpha: number): void {
  for (const { own } of view.fadeMaterials ?? []) {
    const all = Array.isArray(own) ? own : [own];
    for (const material of all) setGhostAlpha(material, alpha);
  }
}

/** Put a ghosted body back to opaque, leaving its materials as it found them. */
export function clearObjectGhost(view: EntityView): void {
  for (const { own, shared } of view.fadeMaterials ?? []) {
    const all = Array.isArray(own) ? own : [own];
    const originals = Array.isArray(shared) ? shared : [shared];
    all.forEach((material, index) => {
      clearGhostAlpha(material, originals[index] ?? originals[0]);
    });
  }
}

/** Put the shared materials back and release the clones. */
export function endObjectFade(view: EntityView): void {
  for (const { mesh, shared, own } of view.fadeMaterials ?? []) {
    // Only if nothing else has changed the mesh's material since — a foliage
    // swap mid-fade wins, and its material is not ours to replace.
    if (mesh.material === own) mesh.material = shared;
    if (Array.isArray(own))
      own.forEach((m, i) => releaseFadeClone((shared as THREE.Material[])[i]!, m));
    else releaseFadeClone(shared as THREE.Material, own);
  }
  view.fadeMaterials = undefined;
}

/** Swap a model's blended foliage materials for cut-outs, or back. */
export function swapFoliage(root: THREE.Object3D, materials: MaterialCache, cutout: boolean): void {
  root.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(m => materials.foliageVariant(m, cutout));
    } else {
      mesh.material = materials.foliageVariant(mesh.material, cutout);
    }
  });
}
