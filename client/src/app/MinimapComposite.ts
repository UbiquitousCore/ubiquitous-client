import { logger } from '../core/log';
import { MINIMAP_ZOOMS, minimapPatch, minimapPatchTiles } from '../world/minimap';
import type { MinimapPatch } from '../world/minimap';

const log = logger('minimap');

/** One loaded thumbnail and the cell of the patch it is drawn in. */
export interface MinimapTile<T> {
  column: number;
  row: number;
  tile: T;
}

export interface MinimapCompositeDeps<T> {
  /** The build's thumbnail for one tile, or null where it ships none. */
  load(mapId: number, tx: number, tz: number): Promise<T | null>;
  /** Draw these tiles into one picture for the patch and hand back a URL for it. */
  encode(tiles: ReadonlyArray<MinimapTile<T>>, patch: MinimapPatch): Promise<string | null>;
  /** Release a URL `encode` handed out. */
  revoke(url: string): void;
}

/**
 * The minimap's stitched picture, rebuilt only when the patch under the
 * window changes. The picture on show stays up until its replacement exists;
 * a build overtaken by a newer one is dropped; missing tiles stay
 * transparent.
 */
export class MinimapComposite<T> {
  /** The picture to show, or null for an empty socket. */
  url: string | null = null;
  /** The patch `url` pictures; a window is only meaningful against it. */
  patch: MinimapPatch | null = null;
  /** The patch `url` was built for (or decided blank for). */
  private shown = '';
  /** The patch a build is under way for; '' when none is. */
  private wanted = '';

  constructor(private readonly deps: MinimapCompositeDeps<T>) {}

  /** Bring the picture up to date for this position. True when `url` changed. */
  async ensure(mapId: number, x: number, z: number, zoomStep: number): Promise<boolean> {
    const zoom = MINIMAP_ZOOMS[zoomStep] ?? 1;
    const patch = minimapPatch(x, z, zoom);
    const key = `${mapId}:${patch.tileX},${patch.tileZ}x${patch.cells}`;
    if (key === this.shown || key === this.wanted) return false;
    this.wanted = key;

    let next: string | null = null;
    try {
      const cells = minimapPatchTiles(patch);
      const loaded = await Promise.all(cells.map(cell => this.deps.load(mapId, cell.tx, cell.tz)));
      if (this.wanted !== key) return false;
      const drawn: MinimapTile<T>[] = [];
      loaded.forEach((tile, i) => {
        if (tile !== null) drawn.push({ column: cells[i]!.column, row: cells[i]!.row, tile });
      });
      if (drawn.length) {
        next = await this.deps.encode(drawn, patch);
        if (this.wanted !== key) {
          if (next) this.deps.revoke(next);
          return false;
        }
      } else {
        log.debug(`no minimap thumbnails for ${key}`);
      }
    } catch (error) {
      if (this.wanted !== key) return false;
      log.debug(`no minimap tiles at ${key}: ${String(error)}`);
      next = null;
    }

    const previous = this.url;
    this.url = next;
    this.patch = next ? patch : null;
    this.shown = key;
    this.wanted = '';
    if (previous) this.deps.revoke(previous);
    return previous !== next;
  }

  dispose(): void {
    if (this.url) this.deps.revoke(this.url);
    this.url = null;
    this.patch = null;
    this.shown = '';
    this.wanted = '';
  }
}
