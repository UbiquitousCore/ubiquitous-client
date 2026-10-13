/**
 * A patch of a screen's own art to fill gaps the movie leaves (the menu
 * bar's middle). The patch is searched for, and quilted with its own
 * reflection so tiling shows no joins.
 */

import { useEffect, useState } from 'preact/hooks';

import type { PieceBox } from './piecePlan';
import type { Worn } from './useWorn';

/** How opaque a row must be to count as material rather than a gap. */
const SOLID = 0.98;
/** The smallest patch worth having, in movie units. */
const LEAST = 2;
/** How much of a region to try, narrowest first — the material runs deeper at one end. */
const WIDTHS = [1, 1 / 2, 1 / 4, 1 / 8];
/** How many places across a region each width is tried in. */
const TRIES = 8;

export interface WornTile {
  /** The quilt itself. */
  url: string;
  /** How wide it is, in the screen's own units. */
  w: number;
  /** How tall it is, in the same. */
  h: number;
}

/** The longest solid run in `x..x+w`: a one-row seam under the rivets stops a top-down search early. */
function runIn(
  pixels: Uint8ClampedArray,
  wide: number,
  x: number,
  w: number,
  tall: number,
): { y: number; h: number } {
  let best = { y: 0, h: 0 };
  let from = 0;
  for (let y = 0; y <= tall; y++) {
    let opaque = 0;
    if (y < tall) {
      for (let step = 0; step < w; step++) {
        if (pixels[(y * wide + x + step) * 4 + 3]! > 200) opaque++;
      }
    }
    if (y === tall || opaque / w < SOLID) {
      if (y - from > best.h) best = { y: from, h: y - from };
      from = y + 1;
    }
  }
  return best;
}

/** A solid patch inside `within`, quilted with its reflection to tile seamlessly; null if none or not drawn. */
export function useWornTile(worn: Worn, within: PieceBox): WornTile | null {
  const [tile, setTile] = useState<WornTile | null>(null);
  const url = worn.image?.url;
  const frame = worn.frame;
  const where = `${within.x},${within.y},${within.w},${within.h}`;

  useEffect(() => {
    if (!url || !frame) {
      setTile(null);
      return;
    }
    let live = true;
    const picture = new Image();
    picture.onload = () => {
      if (!live) return;
      // The picture is drawn at so many pixels to the unit; the region
      // asked for is in units, so it is scaled the same way.
      const unit = picture.width / frame.w;
      const read = document.createElement('canvas');
      read.width = picture.width;
      read.height = picture.height;
      const from = read.getContext('2d', { willReadFrequently: true });
      if (!from) return;
      from.drawImage(picture, 0, 0);
      const x0 = Math.max(0, Math.round(within.x * unit));
      const y0 = Math.max(0, Math.round(within.y * unit));
      const wide = Math.max(1, Math.min(picture.width - x0, Math.round(within.w * unit)));
      const asked = within.h > 0 ? Math.round(within.h * unit) : picture.height;
      const deep = Math.max(1, Math.min(picture.height - y0, asked));
      const pixels = from.getImageData(x0, y0, wide, deep).data;

      // Deepest patch wins (rhythm shows down a tall bar), then widest; every
      // width is tried across the region, since material depth varies.
      let best = { x: 0, w: 0, y: 0, h: 0 };
      for (const part of WIDTHS) {
        const w = Math.max(1, Math.floor(wide * part));
        const step = Math.max(1, Math.floor((wide - w) / TRIES));
        for (let x = 0; x + w <= wide; x += step) {
          const found = runIn(pixels, wide, x, w, deep);
          if (found.h > best.h || (found.h === best.h && w > best.w)) {
            best = { x, w, y: found.y, h: found.h };
          }
        }
      }
      if (best.h < LEAST * unit || best.w < LEAST * unit) {
        setTile(null);
        return;
      }

      // Quilted with its own reflection: head to tail a patch shows a
      // line at the join, and reflected there is nothing to see.
      const quilt = document.createElement('canvas');
      quilt.width = best.w * 2;
      quilt.height = best.h * 2;
      const onto = quilt.getContext('2d');
      if (!onto) return;
      for (const [flipX, flipY] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const) {
        onto.save();
        onto.translate(flipX < 0 ? best.w * 2 : 0, flipY < 0 ? best.h * 2 : 0);
        onto.scale(flipX, flipY);
        onto.drawImage(picture, x0 + best.x, y0 + best.y, best.w, best.h, 0, 0, best.w, best.h);
        onto.restore();
      }
      setTile({ url: quilt.toDataURL(), w: (best.w * 2) / unit, h: (best.h * 2) / unit });
    };
    picture.src = url;
    return () => {
      live = false;
    };
  }, [url, where, frame?.w, frame?.h]);

  return tile;
}

/** How much of a column has to be solid for it to be an edge of the screen. */
const TALL = 0.9;

export interface WornEdge {
  /** Where the line begins, in the screen's own units. */
  from: number;
  /** Where it ends. */
  to: number;
}

/** The screen's edge line right of `from`: the first column drawn nearly all the way down; null if none. */
export function useWornEdge(worn: Worn, from: number): WornEdge | null {
  const [edge, setEdge] = useState<WornEdge | null>(null);
  const url = worn.image?.url;
  const frame = worn.frame;

  useEffect(() => {
    if (!url || !frame) {
      setEdge(null);
      return;
    }
    let live = true;
    const picture = new Image();
    picture.onload = () => {
      if (!live) return;
      const unit = picture.width / frame.w;
      const read = document.createElement('canvas');
      read.width = picture.width;
      read.height = picture.height;
      const onto = read.getContext('2d', { willReadFrequently: true });
      if (!onto) return;
      onto.drawImage(picture, 0, 0);
      const wide = picture.width;
      const tall = picture.height;
      const pixels = onto.getImageData(0, 0, wide, tall).data;
      const drawnDown = (x: number): boolean => {
        let solid = 0;
        for (let y = 0; y < tall; y++) if (pixels[(y * wide + x) * 4 + 3]! > 200) solid++;
        return solid / tall >= TALL;
      };
      for (let x = Math.max(0, Math.round(from * unit)); x < wide; x++) {
        if (!drawnDown(x)) continue;
        let past = x;
        while (past + 1 < wide && drawnDown(past + 1)) past++;
        setEdge({ from: x / unit, to: (past + 1) / unit });
        return;
      }
      setEdge(null);
    };
    picture.src = url;
    return () => {
      live = false;
    };
  }, [url, from, frame?.w, frame?.h]);

  return edge;
}

/** How bright art has to be, on average, for dark words to read on it. */
const BRIGHT = 0.45;

/**
 * Whether the drawn pixels are light or dark, by their average brightness.
 * Pixels that are nearly see-through say nothing about the art and are
 * passed over; with none left there is no answer.
 */
export function shadeOf(pixels: Uint8ClampedArray): 'light' | 'dark' | null {
  let sum = 0;
  let seen = 0;
  for (let at = 0; at + 3 < pixels.length; at += 4) {
    if (pixels[at + 3]! < 128) continue;
    sum += (0.2126 * pixels[at]! + 0.7152 * pixels[at + 1]! + 0.0722 * pixels[at + 2]!) / 255;
    seen += 1;
  }
  if (!seen) return null;
  return sum / seen >= BRIGHT ? 'light' : 'dark';
}

/**
 * Whether `worn`'s picture is light or dark inside `within`: what a word
 * written there has to stand against. Null while the screen has not
 * been drawn.
 */
export function useWornShade(worn: Worn, within: PieceBox | undefined): 'light' | 'dark' | null {
  const [shade, setShade] = useState<'light' | 'dark' | null>(null);
  const url = worn.image?.url;
  const frame = worn.frame;
  const where = within ? `${within.x},${within.y},${within.w},${within.h}` : '';

  useEffect(() => {
    if (!url || !frame || !within) {
      setShade(null);
      return;
    }
    let live = true;
    const picture = new Image();
    picture.onload = () => {
      if (!live) return;
      const unit = picture.width / frame.w;
      const read = document.createElement('canvas');
      read.width = picture.width;
      read.height = picture.height;
      const from = read.getContext('2d', { willReadFrequently: true });
      if (!from) return;
      from.drawImage(picture, 0, 0);
      const x0 = Math.max(0, Math.round(within.x * unit));
      const y0 = Math.max(0, Math.round(within.y * unit));
      const wide = Math.max(1, Math.min(picture.width - x0, Math.round(within.w * unit)));
      const deep = Math.max(1, Math.min(picture.height - y0, Math.round(within.h * unit)));
      setShade(shadeOf(from.getImageData(x0, y0, wide, deep).data));
    };
    picture.src = url;
    return () => {
      live = false;
    };
  }, [url, where, frame?.w, frame?.h]);

  return shade;
}
