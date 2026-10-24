/** Spell visuals that sit on a body for a while (a bleed, a buff's glow): part of the moment, not of the body. */
import type * as THREE from 'three';

const KEY = 'transientEffect';

/** Mark an effect's root so a copy of the body can leave it out. */
export function markTransientEffect(object: THREE.Object3D): void {
  object.userData[KEY] = true;
}

/**
 * Take every marked effect out of a copied body, whatever node it hangs on.
 * A portrait and the character sheet show the body as it is dressed, not as it
 * is afflicted this second.
 */
export function stripTransientEffects(root: THREE.Object3D): number {
  const found: THREE.Object3D[] = [];
  root.traverse(node => {
    if (node.userData[KEY] === true) found.push(node);
  });
  for (const node of found) node.removeFromParent();
  return found.length;
}
