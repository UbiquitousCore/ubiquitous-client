/**
 * Coarse image fingerprints, for comparing two renders without a GPU and
 * without a screenshot: a mean colour per cell of a small grid, and the
 * root-mean-square distance between two of them.
 *
 * The shader bench uses these to say how close its fallback draws to the
 * build's own water, and to watch that number move as a clean-room shader is
 * written against it. Dev only.
 */

/** The mean RGB of each cell in a `cols` x `rows` grid over the frame. */
export function fingerprint(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cols = 8,
  rows = 8,
): number[] {
  const out = new Array<number>(cols * rows * 3).fill(0);
  const counts = new Array<number>(cols * rows).fill(0);
  if (width <= 0 || height <= 0) return out;
  for (let y = 0; y < height; y++) {
    const gy = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(cols - 1, Math.floor((x * cols) / width));
      const cell = gy * cols + gx;
      const at = (y * width + x) * 4;
      out[cell * 3] += rgba[at];
      out[cell * 3 + 1] += rgba[at + 1];
      out[cell * 3 + 2] += rgba[at + 2];
      counts[cell]++;
    }
  }
  for (let cell = 0; cell < counts.length; cell++) {
    const n = counts[cell] || 1;
    out[cell * 3] /= n;
    out[cell * 3 + 1] /= n;
    out[cell * 3 + 2] /= n;
  }
  return out;
}

/** Root-mean-square difference between two fingerprints, on the 0..255 scale. */
export function distance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum / n);
}

/** The mean of a fingerprint, as a one-number colour to show beside it. */
export function mean(f: readonly number[]): number {
  if (f.length === 0) return 0;
  let sum = 0;
  for (const v of f) sum += v;
  return sum / f.length;
}
