/** Minimap geometry: a window in texture coordinates onto stitched tile thumbnails, rebuilt when its corner tile changes. */
import { TILE_SIZE } from './Terrain';

/** One terrain thumbnail, in pixels. */
export const THUMB_SIZE = 128;

/**
 * How much of a terrain tile the window spans, edge to edge, at zoom 1.
 * Own choice: enough ground to read the nearby paths without the markers
 * crowding together.
 */
const TILES_ACROSS_AT_ZOOM_1 = 0.8;

/** The zoom steps the HUD's + and - buttons walk through, closest first. */
export const MINIMAP_ZOOMS = [0.6, 0.8, 1, 1.5, 2.25] as const;
/** Index into `MINIMAP_ZOOMS` for the default view, zoom 1. */
export const MINIMAP_DEFAULT_ZOOM = 2;

/** Half the window, in world units. */
export function minimapHalfWorld(zoom = 1): number {
  return (TILES_ACROSS_AT_ZOOM_1 * TILE_SIZE * zoom) / 2;
}

/** The terrain tile a world position stands on. Floors, so negatives work. */
export function minimapTileOf(x: number, z: number): [number, number] {
  return [Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE)];
}

/** A square of whole tiles stitched into one picture. */
export interface MinimapPatch {
  /** The tile in the picture's first column and row. */
  tileX: number;
  tileZ: number;
  /** Tiles per side. */
  cells: number;
}

/**
 * Tiles per side of a patch at a zoom: the most tiles a window that wide can
 * touch along one axis, wherever it stands.
 */
export function minimapPatchCells(zoom = 1): number {
  return Math.ceil((2 * minimapHalfWorld(zoom)) / TILE_SIZE) + 1;
}

/** The patch that holds the window around a position. */
export function minimapPatch(x: number, z: number, zoom = 1): MinimapPatch {
  const half = minimapHalfWorld(zoom);
  const [tileX, tileZ] = minimapTileOf(x - half, z - half);
  return { tileX, tileZ, cells: minimapPatchCells(zoom) };
}

/** Every tile in a patch, with the column and row it is drawn at. */
export function minimapPatchTiles(
  patch: MinimapPatch,
): Array<{ tx: number; tz: number; column: number; row: number }> {
  const out: Array<{ tx: number; tz: number; column: number; row: number }> = [];
  for (let row = 0; row < patch.cells; row++) {
    for (let column = 0; column < patch.cells; column++) {
      out.push({ tx: patch.tileX + column, tz: patch.tileZ + row, column, row });
    }
  }
  return out;
}

/** The patch's picture, in pixels per side. */
export function minimapTextureSize(patch: MinimapPatch): number {
  return patch.cells * THUMB_SIZE;
}

/** The window the HUD shows, in texture coordinates of a patch's picture. */
export interface MinimapWindow {
  /** Centre, 0..1 across the picture. The player stands here. */
  u: number;
  v: number;
  /** Half the window, in the same units. */
  radius: number;
  /** Half the window in world units, which is what places the markers. */
  halfWorld: number;
}

/**
 * The window around a position, inside a given patch's picture.
 *
 * The player never moves on screen: the window moves under them, which is why
 * this returns texture coordinates rather than a screen offset.
 */
export function minimapWindow(
  x: number,
  z: number,
  zoom: number,
  patch: MinimapPatch,
): MinimapWindow {
  const span = patch.cells * TILE_SIZE;
  const halfWorld = minimapHalfWorld(zoom);
  return {
    u: (x - patch.tileX * TILE_SIZE) / span,
    v: (z - patch.tileZ * TILE_SIZE) / span,
    radius: halfWorld / span,
    halfWorld,
  };
}
