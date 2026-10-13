import { describe, expect, it } from 'vitest';

import { TILE_SIZE, Terrain } from '../src/world/Terrain';
import type { TerrainTileData } from '../src/assets/types';

/** A 3x3 sample grid over a 64-unit tile, so step = 32. */
function tile(tx: number, tz: number, heights: number[]): TerrainTileData {
  return {
    tile: [tx, tz],
    origin: [tx * 64, tz * 64],
    side: 3,
    tileSize: 64,
    heights: Float32Array.from(heights),
    colours: null,
    visible: [],
    // Empty rather than absent: the type says an empty list is a tile that
    // carries none, which is what these fixtures are.
    water: [],
    chunkTextures: [],
    baseTexture: null,
    maskTexture: null,
  };
}

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0];
const RAMP = [0, 0, 0, 10, 10, 10, 20, 20, 20]; // rises along +Z

describe('Terrain', () => {
  it('returns null where no tile covers the position', () => {
    const terrain = new Terrain([tile(0, 0, FLAT)]);
    expect(terrain.heightAt(1000, 1000)).toBeNull();
  });

  it('reads an exact grid sample at a vertex', () => {
    const terrain = new Terrain([tile(0, 0, RAMP)]);
    expect(terrain.heightAt(0, 0)).toBeCloseTo(0, 5);
    expect(terrain.heightAt(0, 32)).toBeCloseTo(10, 5);
    expect(terrain.heightAt(0, 64 - 1e-6)).toBeCloseTo(20, 4);
  });

  it('interpolates between samples rather than stepping', () => {
    const terrain = new Terrain([tile(0, 0, RAMP)]);
    expect(terrain.heightAt(0, 16)).toBeCloseTo(5, 5);
    expect(terrain.heightAt(0, 48)).toBeCloseTo(15, 5);
  });

  it('locates the right tile when several are loaded', () => {
    const terrain = new Terrain([
      tile(0, 0, FLAT),
      tile(
        1,
        0,
        RAMP.map(h => h + 100),
      ),
    ]);
    expect(terrain.heightAt(10, 10)).toBeCloseTo(0, 5);
    expect(terrain.heightAt(64 + 10, 32)).toBeCloseTo(110, 5);
  });

  it('handles negative tile coordinates', () => {
    const terrain = new Terrain([
      tile(
        -1,
        -1,
        FLAT.map(() => 7),
      ),
    ]);
    expect(terrain.heightAt(-32, -32)).toBeCloseTo(7, 5);
  });

  it('is empty, not broken, with no tiles', () => {
    const terrain = new Terrain([]);
    expect(terrain.isEmpty).toBe(true);
    expect(terrain.heightAt(0, 0)).toBeNull();
  });

  describe('normalAt', () => {
    it('points straight up on flat ground', () => {
      const terrain = new Terrain([tile(0, 0, FLAT)]);
      const n = terrain.normalAt(17, 23)!;
      expect(n[0]).toBeCloseTo(0, 6);
      expect(n[1]).toBeCloseTo(1, 6);
      expect(n[2]).toBeCloseTo(0, 6);
    });

    it('tips downhill on a slope, matching the bilinear surface exactly', () => {
      // RAMP rises 10 units per 32-unit cell row, so dh/dz = 10/32 and the
      // exact normal of the interpolated surface is known in closed form.
      const terrain = new Terrain([tile(0, 0, RAMP)]);
      const step = 32;
      const dz = 10 / step;
      const len = Math.hypot(dz, 1);
      for (const [x, z] of [
        [16, 16],
        [40, 33],
        [63, 60],
      ] as const) {
        const n = terrain.normalAt(x, z)!;
        expect(n[1]).toBeCloseTo(1 / len, 4);
        expect(n[2]).toBeCloseTo(-dz / len, 4);
        expect(n[0]).toBeCloseTo(0, 6);
      }
    });

    it('is unit length everywhere', () => {
      const terrain = new Terrain([tile(0, 0, RAMP)]);
      const n = terrain.normalAt(50.3, 12.7)!;
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6);
    });

    it('returns null where no tile covers the position', () => {
      const terrain = new Terrain([tile(0, 0, FLAT)]);
      expect(terrain.normalAt(1000, 1000)).toBeNull();
    });
  });
});

/**
 * Tiles arrive and leave under the player's feet.
 *
 * The set is mutable because the ground streams: a frozen snapshot of a whole
 * zone would make walking out of one end the edge of the world.
 */
describe('Terrain streaming', () => {
  it('agrees with the format layer about how big a tile is', () => {
    // Two constants, one grid. `assets/formats/tables` has the format's copy
    // and this is the world's; a divergence would put the ground and the
    // placements on it half a tile apart.
    expect(TILE_SIZE).toBe(64);
    expect(tile(0, 0, FLAT).tileSize).toBe(TILE_SIZE);
  });

  it('starts empty and answers null everywhere', () => {
    const terrain = new Terrain();
    expect(terrain.isEmpty).toBe(true);
    expect(terrain.tileCount).toBe(0);
    expect(terrain.heightAt(0, 0)).toBeNull();
  });

  it('reads a tile added after construction', () => {
    const terrain = new Terrain();
    terrain.add(tile(1, 0, RAMP));
    expect(terrain.has(1, 0)).toBe(true);
    expect(terrain.heightAt(64, 32)).toBeCloseTo(10, 5);
  });

  it('forgets a tile that has been evicted', () => {
    const terrain = new Terrain([tile(0, 0, FLAT), tile(1, 0, FLAT)]);
    terrain.remove(0, 0);
    expect(terrain.tileCount).toBe(1);
    expect(terrain.heightAt(32, 32)).toBeNull();
    expect(terrain.heightAt(96, 32)).toBeCloseTo(0, 5);
  });

  it('replaces a tile added twice rather than keeping both', () => {
    const terrain = new Terrain([tile(0, 0, FLAT)]);
    terrain.add(tile(0, 0, RAMP));
    expect(terrain.tileCount).toBe(1);
    expect(terrain.heightAt(0, 32)).toBeCloseTo(10, 5);
  });

  it('keeps its grid when the tile that defined it is evicted', () => {
    // The grid must not be read off any one tile: with streaming, the tile
    // that implied it can be dropped while the grid is still in use.
    const terrain = new Terrain([tile(0, 0, FLAT)]);
    terrain.remove(0, 0);
    terrain.add(tile(5, 5, FLAT));
    expect(terrain.tileSize).toBe(TILE_SIZE);
    expect(terrain.heightAt(5 * 64 + 32, 5 * 64 + 32)).toBeCloseTo(0, 5);
  });
});
