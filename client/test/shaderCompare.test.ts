import { describe, expect, it } from 'vitest';

import { distance, fingerprint, mean } from '../dev/shaderCompare';

/** A frame of one colour, as `getImageData` would hand it over. */
function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('fingerprint', () => {
  it('reads a single colour as one cell', () => {
    const f = fingerprint(solid(4, 4, 10, 20, 30), 4, 4, 1, 1);
    expect(f).toEqual([10, 20, 30]);
  });

  it('splits a frame into a grid of means', () => {
    // Left half black, right half white.
    const width = 8;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < width / 2 ? 0 : 255;
        const at = (y * width + x) * 4;
        data[at] = data[at + 1] = data[at + 2] = v;
        data[at + 3] = 255;
      }
    }
    const f = fingerprint(data, width, height, 2, 1);
    expect(f).toEqual([0, 0, 0, 255, 255, 255]);
  });

  it('is empty for an empty frame rather than throwing', () => {
    expect(fingerprint(new Uint8ClampedArray(0), 0, 0)).toEqual(new Array(8 * 8 * 3).fill(0));
  });
});

describe('distance', () => {
  it('is zero between a frame and itself', () => {
    const f = fingerprint(solid(4, 4, 120, 130, 140), 4, 4);
    expect(distance(f, f)).toBe(0);
  });

  it('is 255 between black and white', () => {
    const black = fingerprint(solid(4, 4, 0, 0, 0), 4, 4, 1, 1);
    const white = fingerprint(solid(4, 4, 255, 255, 255), 4, 4, 1, 1);
    expect(distance(black, white)).toBeCloseTo(255, 5);
  });

  it('is the size of a uniform offset', () => {
    const a = fingerprint(solid(2, 2, 100, 100, 100), 2, 2, 1, 1);
    const b = fingerprint(solid(2, 2, 130, 130, 130), 2, 2, 1, 1);
    expect(distance(a, b)).toBeCloseTo(30, 5);
  });

  it('shrugs at two empty fingerprints', () => {
    expect(distance([], [])).toBe(0);
  });
});

describe('mean', () => {
  it('averages the cells', () => {
    expect(mean([0, 10, 20])).toBeCloseTo(10, 5);
    expect(mean([])).toBe(0);
  });
});
