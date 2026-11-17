/**
 * ETC1 blocks to RGBA8, as the Android builds store their pictures inside
 * the same PVR v2 container the PVRTC ones use. Written from the public
 * ETC1 specification: each 4x4 block is two 2x4 halves, each a base colour
 * plus one of four brightness steps per pixel.
 */

import { type DecodedImage, allocPixels } from './image';

export const FMT_ETC1 = 0x36;

/** The small and large step of each of the eight brightness tables. */
const STEPS = [
  [2, 8],
  [5, 17],
  [9, 29],
  [13, 42],
  [18, 60],
  [24, 80],
  [33, 106],
  [47, 183],
] as const;

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
const from4 = (v: number): number => (v << 4) | v;
const from5 = (v: number): number => (v << 3) | (v >> 2);
/** A three-bit two's-complement difference. */
const signed3 = (v: number): number => (v & 4 ? v - 8 : v);

/** The two base colours of a block, from its first three bytes. */
function baseColours(data: Uint8Array, at: number, differential: boolean): number[][] {
  const first: number[] = [];
  const second: number[] = [];
  for (let channel = 0; channel < 3; channel++) {
    const byte = data[at + channel]!;
    if (differential) {
      const base = byte >> 3;
      first.push(from5(base));
      second.push(from5((base + signed3(byte & 7)) & 31));
    } else {
      first.push(from4(byte >> 4));
      second.push(from4(byte & 15));
    }
  }
  return [first, second];
}

/** Decode one level of `width` x `height` pixels whose blocks start at `at`. */
export function decodeEtc1(
  data: Uint8Array,
  at: number,
  width: number,
  height: number,
): DecodedImage {
  const cols = Math.ceil(width / 4);
  const rows = Math.ceil(height / 4);
  if (at + cols * rows * 8 > data.length) throw new RangeError('ETC1 blocks run past the file');
  const pixels = allocPixels(width, height);

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const block = at + (by * cols + bx) * 8;
      const control = data[block + 3]!;
      const bases = baseColours(data, block, (control & 2) !== 0);
      const tables = [STEPS[control >> 5]!, STEPS[(control >> 2) & 7]!];
      const flipped = (control & 1) !== 0;
      const high = (data[block + 4]! << 8) | data[block + 5]!;
      const low = (data[block + 6]! << 8) | data[block + 7]!;

      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          const px = bx * 4 + x;
          const py = by * 4 + y;
          if (px >= width || py >= height) continue;
          // Pixels are numbered down each column in turn.
          const bit = x * 4 + y;
          const half = (flipped ? y : x) < 2 ? 0 : 1;
          const step = tables[half]![(low >> bit) & 1]!;
          const change = (high >> bit) & 1 ? -step : step;
          const out = (py * width + px) * 4;
          const base = bases[half]!;
          pixels[out] = clamp(base[0]! + change);
          pixels[out + 1] = clamp(base[1]! + change);
          pixels[out + 2] = clamp(base[2]! + change);
          pixels[out + 3] = 255;
        }
      }
    }
  }
  return { width, height, pixels };
}
