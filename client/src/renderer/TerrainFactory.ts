/** Tile mesh: height grid + tint + base texture; invisible chunks omitted;
 * texture triples grouped (handful of draws, not 64). Blend in terrainShader. */

import * as THREE from 'three';
import type { TerrainTileData } from '../assets/types';
import type { MaterialCache } from './MaterialCache';
import { createTerrainMaterial, shareTerrainAttributes } from './terrainShader';
import type { GroundSlot, TerrainMaterial, TerrainMaterialOptions } from './terrainShader';

/** The game divides each terrain tile into an 8x8 grid of chunks. */
const CHUNKS_PER_SIDE = 8;

export interface BuiltTerrainTile {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  /** Materials this tile owns and must dispose. Empty when using the bake. */
  materials: THREE.Material[];
  /** Raw textures this tile asked the cache for, to be released with it. */
  textures: RawTextureRequest[];
}

/** One `MaterialCache.rawTexture` call, so the matching release can be made. */
export interface RawTextureRequest {
  ref: string;
  wrap: 'repeat' | 'clamp';
  kind: 'colour' | 'data';
}

export function buildTerrainTile(
  tile: TerrainTileData,
  materials: MaterialCache,
  options: TerrainMaterialOptions = {},
): BuiltTerrainTile | null {
  const side = tile.side;
  if (side < 2 || tile.heights.length < side * side) return null;

  const step = tile.tileSize / (side - 1);
  const geometryGroups: Array<{ start: number; count: number; material: THREE.Material }> = [];
  const vertexCount = side * side;
  const positions = new Float32Array(vertexCount * 3);
  // uv tiles the ground textures once per chunk; uv2 spans the tile for the mask.
  const uvs = new Float32Array(vertexCount * 2);
  const maskUvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  // Blend live whenever the tile names its chunk textures — a missing mask is
  // not a reason to fall back. Half the tiles in 2.2.0 ship no `.msk`
  // (6,815 of 13,581), and those are 99.4% single-texture chunks, which need
  // no mask: the shader draws them correctly with `uHasMask = 0`, at full
  // resolution, where the bake would give them a 4x downsample. The bake is
  // only for a tile that names no textures at all.
  const blended = (tile.chunkTextures ?? []).some(c => c && c.some(Boolean));

  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const i = row * side + col;
      positions[i * 3] = tile.origin[0] + col * step;
      positions[i * 3 + 1] = tile.heights[i];
      positions[i * 3 + 2] = tile.origin[1] + row * step;

      // `uv` repeats ground textures per 8-unit chunk; `uv2` spans the tile
      // once, for the mask and the baked image.
      maskUvs[i * 2] = col / (side - 1);
      maskUvs[i * 2 + 1] = row / (side - 1);
      uvs[i * 2] = blended ? col / CHUNKS_PER_SIDE : col / (side - 1);
      uvs[i * 2 + 1] = blended ? row / CHUNKS_PER_SIDE : row / (side - 1);

      writeRgb565(colors, i, tile.colours ? tile.colours[i] : 0xffff);
    }
  }

  // Gather each chunk's quads under its texture triple, so chunks that share
  // one draw with one material. A tile has 64 chunks and typically only a
  // handful of distinct triples.
  const perChunk = (side - 1) / CHUNKS_PER_SIDE;
  const byTriple = new Map<string, { refs: (string | null)[]; indices: number[] }>();
  const single: number[] = [];

  for (let row = 0; row < side - 1; row++) {
    for (let col = 0; col < side - 1; col++) {
      const chunk = Math.floor(row / perChunk) * CHUNKS_PER_SIDE + Math.floor(col / perChunk);
      if (tile.visible.length > 0 && !tile.visible[chunk]) continue;

      const a = row * side + col;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // Wound so the surface faces up under Three.js' counter-clockwise front.
      const quad = [a, c, b, b, c, d];

      if (!blended) {
        single.push(...quad);
        continue;
      }
      const refs = (tile.chunkTextures ?? [])[chunk] ?? [];
      const key = refs.join('|');
      let group = byTriple.get(key);
      if (!group) {
        group = { refs, indices: [] };
        byTriple.set(key, group);
      }
      group.indices.push(...quad);
    }
  }

  const indices: number[] = blended ? [] : single;
  const built: THREE.Material[] = [];
  const requested: RawTextureRequest[] = [];
  if (blended) {
    for (const group of byTriple.values()) {
      if (group.indices.length === 0) continue;
      const start = indices.length;
      indices.push(...group.indices);
      const material = createTerrainMaterial(options);
      geometryGroups.push({ start, count: group.indices.length, material });
      requested.push(
        ...hydrateTerrainMaterial(material, group.refs, tile.maskTexture, materials),
      );
      built.push(material);
    }
  }
  if (indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('maskUv', new THREE.BufferAttribute(maskUvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(
    vertexCount > 65535
      ? new THREE.BufferAttribute(Uint32Array.from(indices), 1)
      : new THREE.BufferAttribute(Uint16Array.from(indices), 1),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (blended) shareTerrainAttributes(geometry);

  let mesh: THREE.Mesh;
  if (blended) {
    for (const g of geometryGroups) {
      geometry.addGroup(g.start, g.count, built.indexOf(g.material));
    }
    mesh = new THREE.Mesh(geometry, built);
  } else {
    // No chunk textures: fall back to the pre-baked image. Opaque,
    // single-sided, vertex-tinted, and it must not repeat — it covers the
    // tile exactly once. Unlike models it stays lit, as the blended ground is.
    mesh = new THREE.Mesh(
      geometry,
      materials.get({
        texture: tile.baseTexture,
        blend: 'opaque',
        doubleSided: false,
        unlit: false,
        vertexColors: true,
        clampTexture: true,
      }),
    );
  }
  // The ground is what real-time shadows fall on, and a hill is tall enough
  // to cast one of its own onto the terrain below it or a body standing in
  // its lee — without this a slope only ever received a shadow, never cast
  // one. Inert either way until the renderer draws a shadow map.
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = `terrain ${tile.tile[0]},${tile.tile[1]}`;
  return { mesh, geometry, materials: built, textures: requested };
}

/**
 * Feed a terrain material as textures arrive. Slots are positional (4.4% of
 * chunks skip slot 1). A texture that will not arrive is reported, not
 * awaited, or the chunk draws its base alone. Textures load undecoded.
 */
function hydrateTerrainMaterial(
  material: TerrainMaterial,
  refs: (string | null)[],
  maskRef: string | null,
  materials: MaterialCache,
): RawTextureRequest[] {
  const requested: RawTextureRequest[] = [];
  const slots: GroundSlot[] = [];
  refs.slice(0, 3).forEach((ref, index) => {
    if (ref) slots.push(index as GroundSlot);
  });
  material.expect(slots, Boolean(maskRef));
  for (const slot of slots) {
    const ref = refs[slot]!;
    requested.push({ ref, wrap: 'repeat', kind: 'data' });
    void materials
      .rawTexture(ref, 'repeat', 'data')
      .then(t => {
        if (t) material.bindLayer(slot, t);
        else material.unavailable(slot);
      })
      .catch(() => material.unavailable(slot));
  }
  if (maskRef) {
    // The mask is read at exact texel positions for the shadow, so it must not
    // wrap or the edges bleed.
    requested.push({ ref: maskRef, wrap: 'clamp', kind: 'data' });
    void materials
      .rawTexture(maskRef, 'clamp', 'data')
      .then(t => {
        if (t) material.bindMask(t);
        else material.unavailable('mask');
      })
      .catch(() => material.unavailable('mask'));
  }
  return requested;
}

/** Expand a packed RGB565 tint into linear-ish 0..1 floats. */
function writeRgb565(out: Float32Array, i: number, packed: number): void {
  out[i * 3] = (((packed & 0xf800) >> 8) | ((packed & 0xf800) >> 13)) / 255;
  out[i * 3 + 1] = (((packed & 0x07e0) >> 3) | ((packed & 0x07e0) >> 9)) / 255;
  out[i * 3 + 2] = (((packed & 0x001f) << 3) | ((packed & 0x001f) >> 2)) / 255;
}
