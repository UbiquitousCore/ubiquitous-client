/** Drawing rectangle inside padded map textures (markers are percentages
 * of the picture — padding must be cropped first). */

/** One pixel of the texture. */
export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type PixelAt = (x: number, y: number) => Pixel;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Padding is near-white, or fully transparent. */
function isBlank(pixel: Pixel): boolean {
  return pixel.a < 8 || (pixel.r > 236 && pixel.g > 236 && pixel.b > 232);
}

/** Longest unbroken run of `false` in a predicate over `0..count-1` (robust
 * against dirty edge lines and off-centre drawings where trim/grow rules fail). */
function longestRun(
  count: number,
  blankAt: (index: number) => boolean,
): { start: number; length: number } {
  let best = { start: 0, length: 0 };
  let start = -1;
  for (let i = 0; i <= count; i++) {
    const blank = i === count || blankAt(i);
    if (blank) {
      if (start >= 0 && i - start > best.length) best = { start, length: i - start };
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  }
  return best.length > 0 ? best : { start: 0, length: count };
}

/**
 * The drawn rectangle inside a padded texture.
 *
 * A line counts as padding at nine tenths rather than wholly, because the
 * drawing's torn edge reaches into the margin in places.
 */
export function drawnRect(width: number, height: number, at: PixelAt): Rect {
  const rowBlank = (y: number): boolean => {
    let n = 0;
    for (let x = 0; x < width; x++) if (isBlank(at(x, y))) n++;
    return n / width > 0.9;
  };
  const columnBlank = (x: number): boolean => {
    let n = 0;
    for (let y = 0; y < height; y++) if (isBlank(at(x, y))) n++;
    return n / height > 0.9;
  };
  const rows = longestRun(height, rowBlank);
  const columns = longestRun(width, columnBlank);
  return { left: columns.start, top: rows.start, width: columns.length, height: rows.length };
}
