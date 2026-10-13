/**
 * The light a body is shown in on its own: on the character sheet's stage
 * and in its portrait. An even fill, and the world's sun from above, to the
 * front and to the body's left, at the same strength as the fill. The skin
 * art is already shaded, so this lights it without adding shading of its
 * own. Own choice.
 */

import * as THREE from 'three';

import { SUN_DIRECTION } from './skyMaterials';

/** How strong the fill and the sun each are. */
const STRENGTH = 1.6;

/** Add the stage's lights to `scene`. */
export function lightAsStage(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, STRENGTH));
  const sun = new THREE.DirectionalLight(0xffffff, STRENGTH);
  sun.position.copy(SUN_DIRECTION);
  scene.add(sun);
}
