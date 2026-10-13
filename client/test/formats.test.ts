/**
 * Format readers, against fixtures built byte by byte.
 *
 * Every expectation here is derived from the documented layout of the format
 * itself, so a divergence shows up as a failure rather than as a texture that
 * looks slightly wrong six months later.
 */

import { describe, expect, it } from 'vitest';

import { FTable, FTableError } from '../src/assets/formats/ftable';
import { decodeTga } from '../src/assets/formats/tga';
import { isPvr, parseHeader, decompress } from '../src/assets/formats/pvrtc';
import { decodeTexture, isPng } from '../src/assets/formats/texture';
import { buildPvr, buildTable, buildTga } from './helpers/fixtures';

// -- FTABLE ------------------------------------------------------------

describe('FTable', () => {
  it('reads every scalar type and strings by absolute offset', () => {
    const data = buildTable(
      'ufsi',
      [
        [7, 1.5, 'Test Vale', -3],
        [8, -0.25, 'Sample Town', 42],
      ],
      [100, 200],
    );

    const t = new FTable(data);
    expect(t.rows).toBe(2);
    expect(t.format).toBe('ufsi');
    expect([...t.keys()]).toEqual([100, 200]);

    const [u, f, s, i] = t.row(0);
    expect(u).toBe(7);
    expect(f).toBeCloseTo(1.5, 6);
    expect(s).toBe('Test Vale');
    expect(i).toBe(-3);

    expect(t.row(1)[2]).toBe('Sample Town');
    expect(t.row(1)[3]).toBe(42);
  });

  it('indexes rows by their key', () => {
    const t = new FTable(
      buildTable(
        'us',
        [
          [1, 'a'],
          [2, 'b'],
        ],
        [10, 20],
      ),
    );
    const keyed = t.byKey();
    expect(keyed.get(10)?.[1]).toBe('a');
    expect(keyed.get(20)?.[1]).toBe('b');
    expect(keyed.get(30)).toBeUndefined();
  });

  it('reads a letter it does not know as a four-byte cell', () => {
    const t = new FTable(buildTable('uxu', [[1, 2, 3]], [1]));
    expect(t.rowStride).toBe(12);
    expect(t.row(0)).toEqual([1, 2, 3]);
  });

  it('trims the NUL the stored string length counts', () => {
    // The length field includes the terminator; leaving it in produces names
    // that compare unequal to everything and render with a box glyph.
    const t = new FTable(buildTable('s', [['Sample Hollow']], [1]));
    expect(t.row(0)[0]).toBe('Sample Hollow');
  });

  it('reads single-byte punctuation as windows-1252, not as tofu', () => {
    // Quest prose carries its apostrophes as one byte (0x92): strict UTF-8
    // reads that as one bad byte, and the log shows a box where the
    // punctuation should be. Valid UTF-8 is untouched by the fallback.
    const data = buildTable('s', [['qZq']], [1]);
    const at = data.indexOf(0x5a);
    data[at] = 0x92;
    expect(new FTable(data).row(0)[0]).toBe('q’q');

    const utf8 = buildTable('s', [['café']], [1]);
    expect(new FTable(utf8).row(0)[0]).toBe('café');
  });

  it('finds keys, format and rows where the header says, and steps rows by its stride', () => {
    // Keys at +20, format at +24, rows at +28, stride at +32. Moving the
    // rows and widening the stride must move the reads with them.
    const packed = buildTable(
      'uh',
      [
        [7, -2],
        [9, 5],
      ],
      [1, 2],
    );
    const dv = new DataView(packed.buffer);
    const rowsAt = dv.getUint32(28, true);
    const stride = dv.getUint32(32, true);
    expect(stride).toBe(6);

    const gap = 10;
    const wide = 8;
    const moved = new Uint8Array(packed.length + gap + 2 * (wide - stride));
    moved.set(packed.subarray(0, rowsAt));
    const mdv = new DataView(moved.buffer);
    mdv.setUint32(28, rowsAt + gap, true);
    mdv.setUint32(32, wide, true);
    for (let r = 0; r < 2; r++) {
      moved.set(
        packed.subarray(rowsAt + r * stride, rowsAt + (r + 1) * stride),
        rowsAt + gap + r * wide,
      );
    }
    const t = new FTable(moved);
    expect(t.rowStride).toBe(wide);
    expect(t.allRows()).toEqual([
      [7, -2],
      [9, 5],
    ]);
    expect([...t.keys()]).toEqual([1, 2]);
  });

  it('reads the narrow letters at their widths', () => {
    // h is 2 bytes, c is 1, the rest 4.
    const t = new FTable(buildTable('hckif', [[-7, -8, 9, -10, 0.5]], [1]));
    expect(t.rowStride).toBe(2 + 1 + 4 + 4 + 4);
    expect(t.row(0)).toEqual([-7, -8, 9, -10, 0.5]);
  });

  it('rejects something that is not a table', () => {
    expect(() => new FTable(new Uint8Array(64))).toThrow(FTableError);
    expect(() => new FTable(new Uint8Array(8))).toThrow(/shorter than/);
  });
});

// -- TGA ---------------------------------------------------------------

describe('decodeTga', () => {
  it('swaps BGRA to RGBA', () => {
    // One pixel: B=10 G=20 R=30 A=40.
    const img = decodeTga(buildTga(1, 1, [10, 20, 30, 40]));
    expect(img.width).toBe(1);
    expect([...img.pixels]).toEqual([30, 20, 10, 40]);
  });

  it('flips bottom-up images, which is the TGA default', () => {
    // Two rows, descriptor bit 5 clear: the first row stored is the *bottom*.
    const bottomUp = buildTga(
      1,
      2,
      [
        1,
        1,
        1,
        255, // stored first -> belongs at the bottom
        2,
        2,
        2,
        255,
      ],
      0x00,
    );
    const img = decodeTga(bottomUp);
    expect(img.pixels[0]).toBe(2); // top row is the second one stored
    expect(img.pixels[4]).toBe(1);
  });

  it('decodes RLE', () => {
    // Packet 0x82 = run of 3, then a literal packet of 1.
    const buf = new Uint8Array(18 + 1 + 4 + 1 + 4);
    const dv = new DataView(buf.buffer);
    buf[2] = 10; // RLE true-colour
    dv.setUint16(12, 4, true);
    dv.setUint16(14, 1, true);
    buf[16] = 32;
    buf[17] = 0x20;
    buf.set([0x82, 9, 9, 9, 255, 0x00, 1, 2, 3, 255], 18);

    const img = decodeTga(buf);
    expect(img.width).toBe(4);
    expect([...img.pixels.slice(0, 4)]).toEqual([9, 9, 9, 255]);
    expect([...img.pixels.slice(12, 16)]).toEqual([3, 2, 1, 255]);
  });
});

// -- PVRTC -------------------------------------------------------------

describe('pvrtc', () => {
  it('detects PVR by the magic at byte 44, not by extension', () => {
    const pvr = buildPvr(4, 4, [[0, 0]]);
    expect(isPvr(pvr)).toBe(true);
    // A real TGA carrying the same .tga name must not be mistaken for one.
    expect(isPvr(buildTga(2, 2, new Array(16).fill(0)))).toBe(false);
  });

  it('reads the header', () => {
    const h = parseHeader(buildPvr(64, 32, [[0, 0]]));
    expect(h.width).toBe(64);
    expect(h.height).toBe(32);
    expect(h.format).toBe(25);
    expect(h.formatName).toBe('PVRTC 4bpp');
  });

  it('decodes a flat block to its opaque endpoint colour', () => {
    // One 4x4 block, both endpoints opaque white, modulation all zero -> every
    // pixel takes colour A. Opaque mode A is RGB 554 with the top bit set.
    const white = 0x8000 | (0x1f << 10) | (0x1f << 5) | (0x0f << 1);
    const colour = (0x80000000 | (0x1f << 10) | (0x1f << 5) | 0x1f) >>> 0;
    const word = (((colour >>> 16) << 16) | white) >>> 0;

    const img = decompress(buildPvr(4, 4, [[0, word]]));
    expect(img.width).toBe(4);
    expect(img.height).toBe(4);
    for (let i = 0; i < 16; i++) {
      expect(img.pixels[i * 4]).toBe(255);
      expect(img.pixels[i * 4 + 1]).toBe(255);
      expect(img.pixels[i * 4 + 2]).toBe(255);
      expect(img.pixels[i * 4 + 3]).toBe(255);
    }
  });

  it('stores blocks in Morton order, with squares stacked along the longer side', () => {
    // Stored block s is flat red s, so the centre pixel of each decoded
    // block names the stored block it came from. The expected indices are
    // written out by hand: y bits take the even positions, x bits the odd,
    // and on a non-square grid each min(w, h) square follows the last.
    const redBlock = (s: number): [number, number] => [0, 0x8000 | (s << 10)];
    const storedAt = (pixelsWide: number, pixelsTall: number): number[][] => {
      const cols = pixelsWide / 4;
      const rows = pixelsTall / 4;
      const img = decompress(
        buildPvr(
          pixelsWide,
          pixelsTall,
          Array.from({ length: cols * rows }, (_, s) => redBlock(s)),
        ),
      );
      return Array.from({ length: rows }, (_, by) =>
        Array.from({ length: cols }, (_, bx) => {
          const red = img.pixels[((by * 4 + 2) * pixelsWide + bx * 4 + 2) * 4];
          return red >> 3;
        }),
      );
    };
    expect(storedAt(16, 16)).toEqual([
      [0, 2, 8, 10],
      [1, 3, 9, 11],
      [4, 6, 12, 14],
      [5, 7, 13, 15],
    ]);
    expect(storedAt(16, 8)).toEqual([
      [0, 2, 4, 6],
      [1, 3, 5, 7],
    ]);
    expect(storedAt(8, 16)).toEqual([
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 7],
    ]);
    expect(storedAt(16, 4)).toEqual([[0, 1, 2, 3]]);
  });

  it('refuses a format it cannot decode rather than producing noise', () => {
    const bad = buildPvr(4, 4, [[0, 0]]);
    new DataView(bad.buffer).setUint32(16, 12, true); // some other pixel format
    expect(() => decompress(bad)).toThrow(/unsupported PVR pixel format/);
  });
});

// -- dispatch ----------------------------------------------------------

describe('decodeTexture', () => {
  it('picks the decoder by header, not by the (lying) extension', () => {
    const pvr = decodeTexture(buildPvr(4, 4, [[0, 0]]));
    expect(pvr.info.format).toBe('PVRTC 4bpp');

    const tga = decodeTexture(buildTga(1, 1, [1, 2, 3, 4]));
    expect(tga.info.format).toBe('TGA');
    expect(tga.image.width).toBe(1);
  });

  it('spots PNG, which the browser decodes rather than us', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(isPng(png)).toBe(true);
    expect(isPng(buildTga(1, 1, [0, 0, 0, 0]))).toBe(false);
  });
});
