/**
 * Drawn screens kept across opens. Painting and encoding one window costs
 * 50–125 ms on a laptop (measured on 1.1.4's movie) and several times that
 * on a phone: paid once per look, not on every open. Encoded at once, not
 * by `toBlob`: a window waiting on its encode opened later than one that
 * paid for it in the frame (observed by the owner on a phone).
 */

import type { PieceImage } from './pieceCanvas';

export interface PieceImageCacheOptions {
  revoke(url: string): void;
  /** Encoded bytes kept before the least recently used screens are let go. */
  budgetBytes: number;
}

type Drawn = PieceImage | null;

export class PieceImageCache {
  /** In use order, oldest first: a `Map` iterates in insertion order and a hit re-inserts. */
  private readonly kept = new Map<string, Drawn>();
  /** Screens showing each look now: its URL is never revoked while one is, or the picture goes blank. */
  private readonly holders = new Map<string, number>();

  constructor(private readonly opts: PieceImageCacheOptions) {}

  /** The finished image, null for one that draws nothing, undefined when not drawn yet. */
  peek(key: string): Drawn | undefined {
    if (!this.kept.has(key)) return undefined;
    const hit = this.kept.get(key)!;
    this.kept.delete(key);
    this.kept.set(key, hit);
    return hit;
  }

  /** The image for `key`, drawn once however many ask. */
  draw(key: string, draw: () => Drawn): Drawn {
    const hit = this.peek(key);
    if (hit !== undefined) return hit;
    const made = draw();
    this.keep(key, made);
    return made;
  }

  /** A screen starts showing `key`; pair with `release`. */
  hold(key: string): void {
    this.holders.set(key, (this.holders.get(key) ?? 0) + 1);
  }

  release(key: string): void {
    const count = this.holders.get(key) ?? 0;
    if (count > 1) {
      this.holders.set(key, count - 1);
      return;
    }
    this.holders.delete(key);
    this.trim(null);
  }

  private keep(key: string, image: Drawn): void {
    this.kept.set(key, image);
    this.trim(key);
  }

  /**
   * Let the least recently used go until what no screen shows is under
   * budget. What is on screen is not counted: the HUD is always up and never
   * opened again, so it would only push out the windows that are.
   */
  private trim(newest: string | null): void {
    let idle = 0;
    for (const [key, image] of this.kept) if (!this.holders.has(key)) idle += image?.bytes ?? 0;
    for (const [oldKey, old] of this.kept) {
      if (idle <= this.opts.budgetBytes) break;
      // The newest stays even alone over budget, or it could never be shown twice.
      if (oldKey === newest || this.holders.has(oldKey)) continue;
      this.kept.delete(oldKey);
      idle -= old?.bytes ?? 0;
      if (old) this.opts.revoke(old.url);
    }
  }
}

/** Own choice: a dozen closed windows at the default scale, small next to a phone's texture memory. */
const BUDGET_BYTES = 48 * 1024 * 1024;

export const pieceImages = new PieceImageCache({
  revoke: url => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  },
  budgetBytes: BUDGET_BYTES,
});

const skinIds = new WeakMap<object, number>();
let nextSkinId = 1;

/** A number per loaded movie, so a key never matches a drawing from another build. */
export function skinId(skin: object): number {
  let id = skinIds.get(skin);
  if (id === undefined) {
    id = nextSkinId++;
    skinIds.set(skin, id);
  }
  return id;
}
