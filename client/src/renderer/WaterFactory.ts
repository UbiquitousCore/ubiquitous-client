/** Tile water surface: one quad per chunk at its flat level (stepped edges
 * are the data, not an artefact); merged to one mesh per tile. */

import * as THREE from 'three';
import type { TerrainTileData } from '../assets/types';
import type { MaterialCache } from './MaterialCache';
import {
  RIPPLE_REPEATS_PER_TILE,
  WaterMaterial,
  createWaterMaterial,
  depthCoord,
  shoreAlpha,
} from './waterShader';
import { logger } from '../core/log';

const log = logger('water');

export { createWaterMaterial };

/** The ripple normal map and the sky the surface reflects. */
const WATER_BUMP_TEXTURE = 'texture/tiles/Waterbump.tga';
export const WATER_REFLECTION_TEXTURE = 'texture/tiles/water_ref.tga';

function clampIndex(v: number, side: number): number {
  return v < 0 ? 0 : v > side - 1 ? side - 1 : v;
}

export interface BuiltWater {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: WaterMaterial;
}

/**
 * Build one tile's water, or null when the tile carries none.
 *
 * Adjacent chunks at the same level are still emitted as separate quads. They
 * are coplanar and share edges exactly, so there is no seam, and merging them
 * would cost more than the four vertices it saves.
 */
export function buildWaterTile(
  tile: TerrainTileData,
  materials?: MaterialCache,
): BuiltWater | null {
  const levels = tile.water;
  if (!levels || levels.length === 0) return null;

  const chunks = Math.round(Math.sqrt(levels.length));
  if (chunks < 1) return null;
  const chunkSize = tile.tileSize / chunks;

  const positions: number[] = [];
  const uvs: number[] = [];
  const depthUvs: number[] = [];
  const shores: number[] = [];
  const repeat = RIPPLE_REPEATS_PER_TILE / tile.tileSize;
  const indices: number[] = [];
  let quads = 0;

  // How deep the water is at a corner: surface minus bed. It drives the
  // shore fade, so shallows read lighter than open water.
  const bedAt = (x: number, z: number): number => {
    const side = tile.side;
    if (side < 2 || tile.heights.length < side * side) return 0;
    const step = tile.tileSize / (side - 1);
    const gx = clampIndex(Math.round((x - tile.origin[0]) / step), side);
    const gz = clampIndex(Math.round((z - tile.origin[1]) / step), side);
    return tile.heights[gz * side + gx];
  };

  for (let cz = 0; cz < chunks; cz++) {
    for (let cx = 0; cx < chunks; cx++) {
      const level = levels[cz * chunks + cx];
      if (level === null || level === undefined) continue;

      const x0 = tile.origin[0] + cx * chunkSize;
      const z0 = tile.origin[1] + cz * chunkSize;
      const x1 = x0 + chunkSize;
      const z1 = z0 + chunkSize;

      positions.push(x0, level, z0, x1, level, z0, x1, level, z1, x0, level, z1);
      for (const [cxp, czp] of [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ] as const) {
        const alpha = shoreAlpha(level - bedAt(cxp, czp));
        shores.push(alpha);
        depthUvs.push(...depthCoord(alpha));
        // Tile-local, so the coordinates stay small enough for low-precision
        // varyings; whole repeats per tile keep neighbouring tiles seamless.
        uvs.push((cxp - tile.origin[0]) * repeat, (czp - tile.origin[1]) * repeat);
      }
      const b = quads * 4;
      indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
      quads++;
    }
  }

  if (quads === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uvs), 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(Float32Array.from(depthUvs), 2));
  geometry.setAttribute('shore', new THREE.BufferAttribute(Float32Array.from(shores), 1));
  geometry.setIndex(
    positions.length / 3 > 65535
      ? new THREE.BufferAttribute(Uint32Array.from(indices), 1)
      : new THREE.BufferAttribute(Uint16Array.from(indices), 1),
  );
  geometry.computeBoundingSphere();

  const material = createWaterMaterial();
  // Our own surface, on our own program: the build's water programs are read
  // nowhere in the game, only on the shader bench. See docs/PROVENANCE.md.
  if (materials) void attachWaterTextures(material, materials);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `water ${tile.tile[0]},${tile.tile[1]}`;
  // Sorted with the other transparent things by distance, not forced after
  // them: forced last, it would paint over blended foliage standing in front
  // of it, because blended foliage writes no depth. The ground it sits over is
  // opaque and already drawn whatever the order.
  mesh.renderOrder = 0;
  return { mesh, geometry, material };
}

/**
 * Fetch the water textures (undecoded) without blocking; the surface draws
 * our own program throughout. The build's own water programs are never
 * fetched here — only the shader bench reads them, and it does so directly.
 */
export async function attachWaterTextures(
  material: WaterMaterial,
  materials: Pick<MaterialCache, 'rawTexture'>,
): Promise<void> {
  const [bump, reflection] = await Promise.all([
    materials.rawTexture(WATER_BUMP_TEXTURE, 'repeat', 'data'),
    materials.rawTexture(WATER_REFLECTION_TEXTURE, 'repeat', 'data'),
  ]);
  if (bump) material.bindBump(bump);
  else
    log.once(
      'warn',
      'water:bump',
      `${WATER_BUMP_TEXTURE} did not resolve; water is drawing its fallback`,
    );
  if (reflection) material.bindReflection(reflection);
  else
    log.once(
      'warn',
      'water:reflection',
      `${WATER_REFLECTION_TEXTURE} did not resolve; water is drawing its fallback`,
    );
}
