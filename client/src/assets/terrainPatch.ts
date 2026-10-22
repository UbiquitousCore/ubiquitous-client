/** Data-only terrain edits, applied over the user's own game files at load.
 *
 * A patch carries no game bytes — only coordinates and new values — so it is
 * this project's own data and safe to share. Heights are world units; sample
 * `row * side + col` of the tile's height grid.
 */

import type { Placement, TileData } from './types';

export const TERRAIN_PATCH_VERSION = 1;

export const TERRAIN_PATCH_KEY = 'ubiquitous.terrainPatch';
export const TERRAIN_PATCH_ENABLED_KEY = 'ubiquitous.terrainPatch.enabled';

export interface TerrainPatchPlacement {
  tile: [number, number];
  model: string;
  position: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number, number] | [number, number, number];
  kind?: 'scenery' | 'static' | 'effect';
}

export interface TerrainPatchTile {
  heights?: Record<string, number>;
  /** Chunk index to the chunk's full texture triple, by resolved texture ref. */
  chunks?: Record<string, [string | null, string | null, string | null]>;
}

export interface TerrainPatchRemoval {
  tile: [number, number];
  model: string;
  position: [number, number, number];
}

export interface TerrainPatch {
  version: number;
  name: string;
  mapId: number;
  tiles: Record<string, TerrainPatchTile>;
  placements: TerrainPatchPlacement[];
  removed?: TerrainPatchRemoval[];
}

/** Tiles already patched with a given patch name, so a cached reload never doubles placements. */
const appliedTo = new WeakMap<TileData, string>();

export function patchTileKey(tx: number, tz: number): string {
  return `${tx},${tz}`;
}

function placementKey(p: TerrainPatchPlacement): string {
  return `${p.model}|${p.position[0]},${p.position[1]},${p.position[2]}`;
}

/** A removal names shipped scenery by where it stands; half a unit forgives float drift. */
function matchesRemoval(
  p: { model: string; position: readonly [number, number, number] },
  data: TileData,
  r: TerrainPatchRemoval,
): boolean {
  return (
    r.tile[0] === data.tile[0] &&
    r.tile[1] === data.tile[1] &&
    r.model === p.model &&
    Math.abs(r.position[0] - p.position[0]) < 0.5 &&
    Math.abs(r.position[1] - p.position[1]) < 0.5 &&
    Math.abs(r.position[2] - p.position[2]) < 0.5
  );
}

/** Absolute height sets, chunk texture swaps and new placements; safe to call twice with the same patch. */
export function applyTerrainPatchToTile(data: TileData, patch: TerrainPatch): boolean {
  if (patch.mapId !== data.mapId) return false;
  let touched = false;
  const entry = patch.tiles[patchTileKey(data.tile[0], data.tile[1])];
  if (entry?.heights && data.terrain) {
    for (const [index, height] of Object.entries(entry.heights)) {
      const i = Number(index);
      if (Number.isInteger(i) && i >= 0 && i < data.terrain.heights.length) {
        data.terrain.heights[i] = height;
        touched = true;
      }
    }
  }
  if (entry?.chunks && data.terrain) {
    for (const [index, triple] of Object.entries(entry.chunks)) {
      const i = Number(index);
      if (Number.isInteger(i) && i >= 0 && i < data.terrain.chunkTextures.length) {
        data.terrain.chunkTextures[i] = [...triple];
        touched = true;
      }
    }
  }
  if (patch.removed && patch.removed.length > 0) {
    const before = data.placements.length;
    data.placements = data.placements.filter(p => !patch.removed!.some(r => matchesRemoval(p, data, r)));
    if (data.placements.length !== before) touched = true;
  }
  if (appliedTo.get(data) !== patch.name) {
    const have = new Set(data.placements.map(q => `${q.model}|${q.position.join(',')}`));
    for (const p of patch.placements) {
      if (p.tile[0] !== data.tile[0] || p.tile[1] !== data.tile[1]) continue;
      if (have.has(placementKey(p))) continue;
      const scale = p.scale ?? [1, 1, 1];
      data.placements.push({
        model: p.model,
        position: [...p.position],
        rotation: [...(p.rotation ?? [0, 0, 0, 1])],
        scale: scale.length === 4 ? [scale[0], scale[1], scale[2]] : [...scale],
        entry: 0,
        kind: p.kind ?? 'scenery',
      } satisfies Placement);
      have.add(placementKey(p));
      touched = true;
    }
    if (touched) appliedTo.set(data, patch.name);
  }
  return touched;
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The patch the editor saved in this browser, if it parses. */
export function loadStoredTerrainPatch(): TerrainPatch | null {
  const raw = readStorage(TERRAIN_PATCH_KEY);
  if (!raw) return null;
  try {
    const patch = JSON.parse(raw) as TerrainPatch;
    if (patch?.version !== TERRAIN_PATCH_VERSION || typeof patch.mapId !== 'number') return null;
    return patch;
  } catch {
    return null;
  }
}

/** Explicit toggle wins; the `terrainPatch` query param is for a quick look without touching storage. */
export function terrainPatchEnabled(): boolean {
  const stored = readStorage(TERRAIN_PATCH_ENABLED_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  try {
    return new URLSearchParams(location.search).get('terrainPatch') === '1';
  } catch {
    return false;
  }
}

/** The game world's one hook: patch tiles as they arrive, before terrain and entities are built. */
export function applyStoredTerrainPatch(data: TileData): void {
  if (!terrainPatchEnabled()) return;
  const patch = loadStoredTerrainPatch();
  if (!patch) return;
  try {
    applyTerrainPatchToTile(data, patch);
  } catch {
    return;
  }
}
