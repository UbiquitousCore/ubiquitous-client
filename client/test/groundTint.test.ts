import { describe, expect, it } from 'vitest';
import type { TerrainTileData } from '../src/assets/types';
import { neutraliseTint } from '../src/world/groundTint';

const rgb565 = (r: number, g: number, b: number): number =>
  ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
const channels = (c: number): [number, number, number] => [
  ((c >> 11) & 31) << 3,
  ((c >> 5) & 63) << 2,
  (c & 31) << 3,
];

/** A 5x5 tile one unit per vertex, every vertex the same warm colour. */
function warmTile(): TerrainTileData {
  return {
    tile: [0, 0],
    origin: [0, 0],
    side: 5,
    tileSize: 4,
    heights: new Float32Array(25),
    colours: new Uint16Array(25).fill(rgb565(248, 188, 160)),
    visible: [],
    water: [],
    baseTexture: null,
    maskTexture: null,
    chunkTextures: [],
  } as TerrainTileData;
}

describe('neutraliseTint', () => {
  it('removes the cast beside a hidden object and keeps the brightness', () => {
    const out = neutraliseTint(warmTile(), [[2, 0, 2]]);
    const [r, g, b] = channels(out.colours![12]!);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    expect((r + g + b) / 3).toBeGreaterThan(190);
    expect((r + g + b) / 3).toBeLessThan(215);
  });

  it('leaves ground far from anything hidden as it was', () => {
    const tile = warmTile();
    expect(neutraliseTint(tile, [[500, 0, 500]])).toBe(tile);
  });

  it('fades out rather than ending at an edge', () => {
    const tile = { ...warmTile(), origin: [0, 0] as [number, number], tileSize: 64, side: 65 };
    tile.colours = new Uint16Array(65 * 65).fill(rgb565(248, 188, 160));
    tile.heights = new Float32Array(65 * 65);
    const out = neutraliseTint(tile, [[0, 0, 0]]);
    const cast = (i: number): number => {
      const [r, , b] = channels(out.colours![i]!);
      return r - b;
    };
    expect(cast(0)).toBeLessThan(cast(18));
    expect(cast(18)).toBeLessThan(cast(30));
    expect(cast(40)).toBe(88);
  });

  it('does not change the tile it was given', () => {
    const tile = warmTile();
    const before = Array.from(tile.colours!);
    neutraliseTint(tile, [[2, 0, 2]]);
    expect(Array.from(tile.colours!)).toEqual(before);
  });

  it('passes a tile with no colours through', () => {
    const tile = { ...warmTile(), colours: null };
    expect(neutraliseTint(tile, [[2, 0, 2]])).toBe(tile);
  });
});
