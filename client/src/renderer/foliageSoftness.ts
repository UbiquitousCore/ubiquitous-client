/**
 * Foliage drawn soft: its image sampled a little blurrier than the screen
 * asks for.
 */

import type * as THREE from 'three';

/**
 * How many mip levels blurrier foliage's image is sampled. Own choice, by
 * eye against the owner's screenshots of the game, where grass and bushes
 * read soft; sampled as the screen asks, their leaves came out crisp and
 * busy. Edges soften with it, since the edge is the image's alpha.
 */
export const FOLIAGE_SOFTNESS = 1;

/** The image lookup for foliage: the stock one, `FOLIAGE_SOFTNESS` levels blurrier. */
const SOFT_MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  diffuseColor *= texture2D( map, vMapUv, ${FOLIAGE_SOFTNESS.toFixed(1)} );
#endif
`;

/**
 * Sample a material's image blurrier, after whatever patch it already
 * carries, compiling to a program of its own.
 */
export function softenMap(material: THREE.Material): void {
  // Carried by a copy, which `fadeClone` softens again after re-patching.
  material.userData.soft = true;
  const before = material.onBeforeCompile.bind(material);
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      SOFT_MAP_FRAGMENT,
    );
  };
  material.customProgramCacheKey = () => `${key()}|soft`;
}
