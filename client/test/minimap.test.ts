import { describe, expect, it } from 'vitest';

import {
  MINIMAP_DEFAULT_ZOOM,
  MINIMAP_ZOOMS,
  THUMB_SIZE,
  minimapHalfWorld,
  minimapPatch,
  minimapPatchCells,
  minimapPatchTiles,
  minimapTextureSize,
  minimapTileOf,
  minimapWindow,
} from '../src/world/minimap';

const TILE = 64;

/** Positions that sit on and around tile edges on both sides of zero. */
const PLACES: Array<[number, number]> = [
  [0, 0],
  [1, 1],
  [TILE - 1, TILE - 1],
  [TILE / 2, TILE / 2],
  [-1, -1],
  [-TILE / 2, TILE * 3.9],
  [500.5, -300.25],
  [37.5, -212.25],
];

describe('the window', () => {
  it('shows less than a tile across in the default view', () => {
    expect(MINIMAP_ZOOMS[MINIMAP_DEFAULT_ZOOM]).toBe(1);
    expect(2 * minimapHalfWorld(1)).toBeLessThan(TILE);
  });

  it('widens with each zoom step', () => {
    for (let i = 1; i < MINIMAP_ZOOMS.length; i++) {
      expect(minimapHalfWorld(MINIMAP_ZOOMS[i])).toBeGreaterThan(
        minimapHalfWorld(MINIMAP_ZOOMS[i - 1]),
      );
    }
  });
});

describe('minimapTileOf', () => {
  it('floors, so a negative position is not pulled toward zero', () => {
    expect(minimapTileOf(0, 0)).toEqual([0, 0]);
    expect(minimapTileOf(63.9, 63.9)).toEqual([0, 0]);
    expect(minimapTileOf(64, 64)).toEqual([1, 1]);
    expect(minimapTileOf(-0.1, -0.1)).toEqual([-1, -1]);
    expect(minimapTileOf(-64, -64)).toEqual([-1, -1]);
    expect(minimapTileOf(-64.1, -64.1)).toEqual([-2, -2]);
  });
});

describe('the patch', () => {
  it('starts at the tile under the window’s lowest corner', () => {
    const half = minimapHalfWorld(1);
    // Just inside a tile's low edge, the window hangs over the tile before it.
    expect(minimapPatch(1, 1, 1)).toMatchObject({ tileX: -1, tileZ: -1 });
    // Far enough in, it does not.
    expect(minimapPatch(half + 1, half + 1, 1)).toMatchObject({ tileX: 0, tileZ: 0 });
  });

  it('holds the whole window wherever the player stands, at every zoom', () => {
    for (const zoom of MINIMAP_ZOOMS) {
      for (const [x, z] of PLACES) {
        const w = minimapWindow(x, z, zoom, minimapPatch(x, z, zoom));
        expect(w.u - w.radius).toBeGreaterThanOrEqual(0);
        expect(w.v - w.radius).toBeGreaterThanOrEqual(0);
        expect(w.u + w.radius).toBeLessThanOrEqual(1);
        expect(w.v + w.radius).toBeLessThanOrEqual(1);
      }
    }
  });

  it('lists each of its tiles once, at its own column and row', () => {
    const patch = minimapPatch(-40, 10, 2.25);
    const tiles = minimapPatchTiles(patch);
    expect(tiles).toHaveLength(patch.cells ** 2);
    for (const { tx, tz, column, row } of tiles) {
      expect(tx - patch.tileX).toBe(column);
      expect(tz - patch.tileZ).toBe(row);
    }
  });

  it('is two tiles a side in the default view, and pictures them at full size', () => {
    expect(minimapPatchCells(1)).toBe(2);
    expect(minimapTextureSize(minimapPatch(0, 0, 1))).toBe(2 * THUMB_SIZE);
  });

  it('stays the same while the player walks inside one tile’s reach', () => {
    const a = minimapPatch(40, 40, 1);
    const b = minimapPatch(80, 80, 1);
    expect(b).toEqual(a);
  });
});

describe('minimapWindow', () => {
  it('centres the window on the player’s place in the picture', () => {
    const patch = { tileX: 0, tileZ: 0, cells: 2 };
    const w = minimapWindow(64, 32, 1, patch);
    expect(w.u).toBeCloseTo(0.5, 6);
    expect(w.v).toBeCloseTo(0.25, 6);
    expect(w.radius).toBeCloseTo(minimapHalfWorld(1) / (2 * TILE), 6);
    expect(w.halfWorld).toBe(minimapHalfWorld(1));
  });

  it('works on the far side of zero', () => {
    const patch = { tileX: -2, tileZ: -2, cells: 2 };
    expect(minimapWindow(-64, -96, 1, patch).u).toBeCloseTo(0.5, 6);
    expect(minimapWindow(-64, -96, 1, patch).v).toBeCloseTo(0.25, 6);
  });
});
