import { describe, expect, it } from 'vitest';

import { decodeEtc1 } from '../src/assets/formats/etc1';
import { decodeTexture } from '../src/assets/formats/texture';

const pixel = (image: { width: number; pixels: ArrayLike<number> }, x: number, y: number) =>
  Array.from({ length: 3 }, (_, c) => image.pixels[(y * image.width + x) * 4 + c]);

describe('an ETC1 block', () => {
  it('splits into a left and a right half, each its own colour', () => {
    // Red 15 and 0, green 0 and 15, blue 0; table 0, every pixel its small step up.
    const image = decodeEtc1(Uint8Array.of(0xf0, 0x0f, 0x00, 0x00, 0, 0, 0, 0), 0, 4, 4);
    expect(pixel(image, 0, 0)).toEqual([255, 2, 2]);
    expect(pixel(image, 1, 3)).toEqual([255, 2, 2]);
    expect(pixel(image, 2, 0)).toEqual([2, 255, 2]);
    expect(pixel(image, 3, 3)).toEqual([2, 255, 2]);
  });

  it('splits into a top and a bottom half when flipped, and numbers pixels down each column', () => {
    // Pixel 1 is (0, 1): its large step. Pixel 4 is (1, 0): its small step down.
    const image = decodeEtc1(
      Uint8Array.of(0xf0, 0x0f, 0x00, 0x01, 0x00, 0x10, 0x00, 0x02),
      0,
      4,
      4,
    );
    expect(pixel(image, 0, 1)).toEqual([255, 8, 8]);
    expect(pixel(image, 1, 0)).toEqual([253, 0, 0]);
    expect(pixel(image, 3, 1)).toEqual([255, 2, 2]);
    expect(pixel(image, 0, 2)).toEqual([2, 255, 2]);
  });

  it('reads the second colour as a difference from the first when told to', () => {
    // Red 31 less one, green 0 plus one, blue 16 unchanged; no step would show, so table 0.
    const image = decodeEtc1(Uint8Array.of(0xff, 0x01, 0x80, 0x02, 0, 0, 0, 0), 0, 4, 4);
    expect(pixel(image, 0, 0)).toEqual([255, 2, 134]);
    expect(pixel(image, 3, 0)).toEqual([249, 10, 134]);
  });

  it('leaves out the pixels of a block that hang past the picture', () => {
    const image = decodeEtc1(Uint8Array.of(0xf0, 0x0f, 0x00, 0x00, 0, 0, 0, 0), 0, 3, 2);
    expect(image.pixels.length).toBe(3 * 2 * 4);
    expect(pixel(image, 2, 1)).toEqual([2, 255, 2]);
  });

  it('refuses a picture with fewer blocks than its size needs', () => {
    expect(() => decodeEtc1(new Uint8Array(8), 0, 8, 4)).toThrow(RangeError);
  });
});

/** A PVR v2 file of one ETC1 block, 4x4. */
function onePvrBlock(block: number[]): Uint8Array {
  const out = new Uint8Array(52 + 8);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 52, true);
  dv.setUint32(4, 4, true);
  dv.setUint32(8, 4, true);
  dv.setUint32(16, 0x36, true);
  out.set([0x50, 0x56, 0x52, 0x21], 44);
  out.set(block, 52);
  return out;
}

/** A stored archive of the given entries, local headers only. */
function stored(entries: Array<[string, Uint8Array]>): Uint8Array {
  const parts: number[] = [];
  for (const [name, data] of entries) {
    const header = new Uint8Array(30);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true);
    parts.push(...header, ...[...name].map(c => c.charCodeAt(0)), ...data);
  }
  return Uint8Array.from(parts);
}

describe('a picture stored as colour and transparency apart', () => {
  it('takes its transparency from the second picture', () => {
    const colour = onePvrBlock([0xf0, 0x0f, 0x00, 0x00, 0, 0, 0, 0]);
    // Grey 8 on the left, 0 on the right, each its small step up.
    const alpha = onePvrBlock([0x80, 0x80, 0x80, 0x00, 0, 0, 0, 0]);
    const { image, info } = decodeTexture(
      stored([
        ['SPLIT', new Uint8Array(4)],
        ['rgb.pvr', colour],
        ['alpha.pvr', alpha],
      ]),
    );
    expect(info.hasAlpha).toBe(true);
    expect([...image.pixels.slice(0, 4)]).toEqual([255, 2, 2, 138]);
    expect([...image.pixels.slice(12, 16)]).toEqual([2, 255, 2, 2]);
  });
});
