/** One drawn tile; freeing it frees what it owns, never the shared materials it borrows. */

import * as THREE from 'three';

import type { MaterialCache } from './MaterialCache';
import type { RawTextureRequest } from './TerrainFactory';

/** What one streamed terrain tile owns on the GPU. */
export interface BuiltTile {
  objects: THREE.Object3D[];
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  /** Water materials whose wave clock is advanced each frame. */
  water: THREE.ShaderMaterial[];
  /** Raw textures the tile holds — its ground layers and its mask — released with it. */
  textures: RawTextureRequest[];
}

export function disposeTile(built: BuiltTile, materials: MaterialCache): void {
  for (const o of built.objects) o.removeFromParent();
  for (const g of built.geometries) g.dispose();
  for (const m of built.materials) m.dispose();
  for (const m of built.water) m.dispose();
  for (const t of built.textures) materials.releaseRawTexture(t.ref, t.wrap, t.kind);
}
