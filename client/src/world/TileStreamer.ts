/**
 * A square window of tiles around an anchor that follows the player once
 * they stand more than `FOLLOW_SLACK` outside its tile, so pacing a seam
 * loads nothing; a teleport is just a long distance. No GPU, no fetching.
 */

import { DEFAULT_GRAPHICS, oddTileWindow } from '../core/graphics';
import { logger } from '../core/log';
import type { TileData } from '../assets/types';
import { TILE_SIZE } from './Terrain';

const log = logger('tiles');

/** Tiles across the window, odd and at least 3; 7 puts the edge at 224 units, inside the 240 fog. */
export const DEFAULT_TILE_WINDOW = DEFAULT_GRAPHICS.tileWindow;

/**
 * World units the player may stand outside the anchor tile before the window
 * follows. Under a fifth of a 64-unit tile: wide enough that pacing a
 * seam never reloads a row, small next to the window's reach. Own choice.
 */
export const FOLLOW_SLACK = 12;

/** Where tiles come from. Returns null for a tile the map does not have. */
export interface TileSource {
  tile(mapId: number, tx: number, tz: number, world?: string): Promise<TileData | null>;
}

/** What a loaded tile is given to, and told to forget. */
export interface TileSink {
  addTile(data: TileData): void;
  dropTile(tx: number, tz: number): void;
}

export interface TileStreamerOptions {
  /** Tiles across the resident window. Forced odd and at least 3. */
  blockSize?: number;
  /** World units outside the anchor tile before following. 0 follows on the seam. */
  slack?: number;
}

/** `'17,12'` — a tile's identity everywhere above the asset boundary. */
export function tileKey(tx: number, tz: number): string {
  return `${tx},${tz}`;
}

/** The tile a world position stands on. */
export function tileOf(x: number, z: number): [number, number] {
  return [Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE)];
}

export class TileStreamer {
  private _blockSize: number;
  private readonly slack: number;
  /** Tiles handed to the sink, or in flight toward it. */
  private readonly resident = new Set<string>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private mapId = -1;
  /** The pack the ground comes out of, where the tables name no map. */
  private world: string | undefined;
  private anchor: [number, number] | null = null;
  /** Bumped by every map change, so late arrivals from the old map are dropped. */
  private generation = 0;

  constructor(
    private readonly source: TileSource,
    private readonly sink: TileSink,
    opts: TileStreamerOptions = {},
  ) {
    this._blockSize = oddTileWindow(opts.blockSize ?? DEFAULT_TILE_WINDOW);
    this.slack = Math.max(0, opts.slack ?? FOLLOW_SLACK);
  }

  /** Tiles across the resident window. Odd and at least 3. */
  get blockSize(): number {
    return this._blockSize;
  }

  /**
   * Resize the window in place. Forced odd and at least 3, like the
   * constructor's. Growing it asks for the new outer ring at once; shrinking
   * drops the ring that no longer fits. A window that has not centred yet
   * simply remembers the size for when it does.
   */
  setBlockSize(blockSize: number): void {
    const next = oddTileWindow(blockSize);
    if (next === this._blockSize) return;
    this._blockSize = next;
    if (this.anchor !== null) this.anchorAt(this.anchor[0], this.anchor[1]);
  }

  /** Tiles currently resident or on their way. */
  get residentKeys(): ReadonlySet<string> {
    return this.resident;
  }

  get pending(): number {
    return this.inFlight.size;
  }

  /** The window's anchor tile, at its middle, or null before the first update. */
  get centreTile(): [number, number] | null {
    return this.anchor;
  }

  /** Switch maps, dropping everything: tile coordinates mean different places on each map. Renaming the same map restarts too. */
  setMap(mapId: number, world?: string): void {
    this.generation++;
    for (const key of this.resident) {
      const [tx, tz] = key.split(',').map(Number);
      this.sink.dropTile(tx, tz);
    }
    this.resident.clear();
    this.inFlight.clear();
    this.anchor = null;
    this.mapId = mapId;
    this.world = world;
  }

  /**
   * Bring the window in line with where the player is. Call every frame;
   * it is two comparisons when the player is inside the slack.
   */
  update(x: number, z: number): void {
    if (this.mapId < 0 && !this.world) return;
    if (this.anchor !== null && this.outside(x, z) <= this.slack) return;
    const [tx, tz] = tileOf(x, z);
    this.anchorAt(tx, tz);
  }

  /** How far (x, z) stands outside the anchor tile's square, on its worse axis. 0 inside. */
  private outside(x: number, z: number): number {
    const [ax, az] = this.anchor!;
    const beyond = (v: number, low: number): number => Math.max(low - v, v - (low + TILE_SIZE), 0);
    return Math.max(beyond(x, ax * TILE_SIZE), beyond(z, az * TILE_SIZE));
  }

  /** Resolves when nothing is in flight within a Chebyshev tile radius
   * (omitted = whole window; near-first ordering does not help a caller
   * waiting on far corners). */
  async whenSettled(within = Infinity): Promise<void> {
    // Re-checked after each wait: a tile inside the radius can be requested
    // while an earlier one is in flight.
    for (;;) {
      const waiting = this.pendingWithin(within);
      if (waiting.length === 0) return;
      await Promise.all(waiting);
    }
  }

  /** In-flight work for tiles no further than `within` from the anchor. */
  private pendingWithin(within: number): Array<Promise<void>> {
    if (this.anchor === null || within === Infinity) return [...this.inFlight.values()];
    const [cx, cz] = this.anchor;
    const out: Array<Promise<void>> = [];
    for (const [key, work] of this.inFlight) {
      const [tx, tz] = key.split(',').map(Number);
      if (Math.max(Math.abs(tx - cx), Math.abs(tz - cz)) <= within) out.push(work);
    }
    return out;
  }

  private anchorAt(tx: number, tz: number): void {
    this.anchor = [tx, tz];
    const rad = (this.blockSize - 1) / 2;

    const wanted: Array<[number, number, string]> = [];
    for (let dz = -rad; dz <= rad; dz++) {
      for (let dx = -rad; dx <= rad; dx++) {
        wanted.push([tx + dx, tz + dz, tileKey(tx + dx, tz + dz)]);
      }
    }
    const keep = new Set(wanted.map(w => w[2]));

    for (const key of [...this.resident]) {
      if (keep.has(key)) continue;
      this.resident.delete(key);
      const [ox, oz] = key.split(',').map(Number);
      this.sink.dropTile(ox, oz);
    }

    // Nearest first, so the ground under the player's feet arrives before the
    // corners of the window.
    wanted.sort(
      (a, b) => (a[0] - tx) ** 2 + (a[1] - tz) ** 2 - ((b[0] - tx) ** 2 + (b[1] - tz) ** 2),
    );

    for (const [wx, wz, key] of wanted) {
      if (this.resident.has(key)) continue;
      this.resident.add(key);
      this.load(wx, wz, key);
    }
  }

  private load(tx: number, tz: number, key: string): void {
    const generation = this.generation;
    const mapId = this.mapId;
    const work = this.source
      .tile(mapId, tx, tz, this.world)
      .then(data => {
        // The window may have moved on, or the map changed, while this was
        // in flight. Handing the sink a tile it no longer wants leaves the
        // previous zone on screen in the distance.
        if (generation !== this.generation || !this.resident.has(key)) return;
        if (data) this.sink.addTile(data);
      })
      .catch(err => {
        log.once('warn', `tile:${mapId}:${key}`, `tile ${key}: ${String(err)}`);
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, work);
  }
}
