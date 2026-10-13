/** Height queries over resident tiles; no GPU. The renderer meshes the same data separately. */

import type { TerrainTileData } from '../assets/types';
import { gridKey } from './gridKey';

/**
 * How deep water must be before a body swims rather than wades, in units:
 * chest deep on the 1.9-unit player, about two thirds of their height.
 * Shallower water leaves head and shoulders clear, which reads as wading.
 * Deeper, the body floats this far below the surface.
 */
export const SWIM_DEPTH = 1.25;

/** Where a body is, relative to the water it is in. */
export type WaterState = 'dry' | 'wading' | 'swimming';

export interface WaterAt {
  state: WaterState;
  /** Height of the water surface, or null when there is none here. */
  surface: number | null;
  /** The height a swimming body floats at: `surface - SWIM_DEPTH`. */
  swimLine: number | null;
}

const DRY: WaterAt = { state: 'dry', surface: null, swimLine: null };

/** Fixed at 64 (8 chunks of 8), never taken from a tile that may be evicted. */
export const TILE_SIZE = 64;

export class Terrain {
  private readonly byTile = new Map<number, TerrainTileData>();
  readonly tileSize: number;

  constructor(tiles: readonly TerrainTileData[] = [], tileSize = TILE_SIZE) {
    this.tileSize = tileSize;
    for (const t of tiles) this.byTile.set(gridKey(t.tile[0], t.tile[1]), t);
  }

  /** Every resident tile. A fresh array — the set changes as you walk. */
  get tiles(): TerrainTileData[] {
    return [...this.byTile.values()];
  }

  get tileCount(): number {
    return this.byTile.size;
  }

  get isEmpty(): boolean {
    return this.byTile.size === 0;
  }

  has(tx: number, tz: number): boolean {
    return this.byTile.has(gridKey(tx, tz));
  }

  add(tile: TerrainTileData): void {
    this.byTile.set(gridKey(tile.tile[0], tile.tile[1]), tile);
  }

  remove(tx: number, tz: number): void {
    this.byTile.delete(gridKey(tx, tz));
  }

  clear(): void {
    this.byTile.clear();
  }

  /**
   * Ground height, or null where no tile covers it. Interpolated on the
   * renderer's own triangle split (b-c diagonal), since bilinear left blob
   * shadows hovering.
   */
  heightAt(x: number, z: number): number | null {
    const size = this.tileSize;
    if (size <= 0) return null;
    const tile = this.byTile.get(gridKey(Math.floor(x / size), Math.floor(z / size)));
    if (!tile || tile.side < 2) return null;

    const step = tile.tileSize / (tile.side - 1);
    const lx = (x - tile.origin[0]) / step;
    const lz = (z - tile.origin[1]) / step;
    const ix = clamp(Math.floor(lx), 0, tile.side - 2);
    const iz = clamp(Math.floor(lz), 0, tile.side - 2);
    const fx = clamp(lx - ix, 0, 1);
    const fz = clamp(lz - iz, 0, 1);
    const s = tile.side;
    const h = tile.heights;

    // Corner order matches the renderer's a,b,c,d: a=(0,0), b=(1,0),
    // c=(0,1), d=(1,1); the shared diagonal is b-c (fx + fz = 1).
    const ha = h[iz * s + ix];
    const hb = h[iz * s + ix + 1];
    const hc = h[(iz + 1) * s + ix];
    const hd = h[(iz + 1) * s + ix + 1];

    if (fx + fz <= 1) {
      // Triangle a,b,c.
      return ha + (hb - ha) * fx + (hc - ha) * fz;
    }
    // Triangle b,c,d.
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  /** The surface normal of the same triangle `heightAt` uses, so decals lie on the drawn mesh. */
  normalAt(x: number, z: number): [number, number, number] | null {
    const size = this.tileSize;
    if (size <= 0) return null;
    const tile = this.byTile.get(gridKey(Math.floor(x / size), Math.floor(z / size)));
    if (!tile || tile.side < 2) return null;

    const step = tile.tileSize / (tile.side - 1);
    const lx = (x - tile.origin[0]) / step;
    const lz = (z - tile.origin[1]) / step;
    const ix = clamp(Math.floor(lx), 0, tile.side - 2);
    const iz = clamp(Math.floor(lz), 0, tile.side - 2);
    const fx = clamp(lx - ix, 0, 1);
    const fz = clamp(lz - iz, 0, 1);
    const s = tile.side;
    const h = tile.heights;

    // Corner order matches the renderer's a,b,c,d; see heightAt.
    const ha = h[iz * s + ix];
    const hb = h[iz * s + ix + 1];
    const hc = h[(iz + 1) * s + ix];
    const hd = h[(iz + 1) * s + ix + 1];

    let dhdx: number;
    let dhdz: number;
    if (fx + fz <= 1) {
      dhdx = (hb - ha) / step;
      dhdz = (hc - ha) / step;
    } else {
      dhdx = (hd - hc) / step;
      dhdz = (hd - hb) / step;
    }

    // Normal of the graph (x, h(x,z), z): (-dhdx, 1, -dhdz).
    const len = Math.hypot(dhdx, 1, dhdz);
    return [-dhdx / len, 1 / len, -dhdz / len];
  }

  /** Water height, or null; one flat level per chunk, as stored and drawn. */
  waterAt(x: number, z: number): number | null {
    const size = this.tileSize;
    if (size <= 0) return null;
    const tile = this.byTile.get(gridKey(Math.floor(x / size), Math.floor(z / size)));
    if (!tile || tile.water.length === 0) return null;

    const chunks = Math.round(Math.sqrt(tile.water.length));
    if (chunks < 1) return null;
    const chunkSize = size / chunks;
    const cx = clamp(Math.floor((x - tile.origin[0]) / chunkSize), 0, chunks - 1);
    const cz = clamp(Math.floor((z - tile.origin[1]) / chunkSize), 0, chunks - 1);
    return tile.water[cz * chunks + cx] ?? null;
  }

  /** Dry/wading/swimming from ground-vs-surface (groundY = resolved collision
   * height, not always the heightmap — else bridges swim). */
  waterStateAt(x: number, z: number, groundY?: number): WaterAt {
    const surface = this.waterAt(x, z);
    if (surface === null) return DRY;
    const ground = groundY ?? this.heightAt(x, z);
    if (ground === null || ground >= surface) return DRY;
    const swimLine = surface - SWIM_DEPTH;
    return {
      state: ground < swimLine ? 'swimming' : 'wading',
      surface,
      swimLine,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
