/**
 * The world-tile readers against hand-built `.itm` and `.trn` files, laid
 * out as docs/formats/terrain.md describes.
 */

import { describe, expect, it } from 'vitest';

import {
  TRN_SIDE,
  TileFormatError,
  layerName,
  parseItm,
  parseTrn,
  tileName,
  tileStem,
} from '../src/assets/formats/terrain';
import { ground, scenery } from './helpers/formatWriters';

describe('parseItm', () => {
  const item = {
    path: 1,
    ref: 7,
    pos: [10, 2, 60],
    rot: [0, 0.6, 0, 0.8],
    scale: [1, 2, 3],
  };

  it('reads 64-byte records in version 4 and 56-byte records in version 3', () => {
    for (const [version, size] of [
      [4, 64],
      [3, 56],
    ]) {
      const doc = parseItm(
        scenery(version, [17, -3], ['model/a.bdae', 'effect/b.beff'], [item, { ...item, path: 0 }]),
      );
      expect(doc).toMatchObject({ version, recordSize: size, tile: [17, -3], count: 2 });
      expect(doc.names).toEqual(['model/a.bdae', 'effect/b.beff']);
      expect(doc.items.map(i => i.model)).toEqual(['effect/b.beff', 'model/a.bdae']);
      expect(doc.items[0]).toMatchObject({
        ref: 7,
        nameIndex: 1,
        pos: [10, 2, 60],
        scale: [1, 2, 3],
      });
      // The quaternion comes back as stored; the provider conjugates it.
      expect(doc.items[0].rot.map(v => +v.toFixed(5))).toEqual([0, 0.6, 0, 0.8]);
    }
  });

  it('reads the third word unsigned', () => {
    const doc = parseItm(
      scenery(4, [0, 0], ['model/a.bdae'], [{ ...item, path: 0, ref: 0xffffffff }]),
    );
    expect(doc.items[0].ref).toBe(0xffffffff);
  });

  it('ignores bytes after the last path span', () => {
    const bytes = scenery(4, [0, 0], ['model/a.bdae'], [{ ...item, path: 0 }]);
    const padded = new Uint8Array([...bytes, ...new TextEncoder().encode('leftover text')]);
    expect(parseItm(padded).names).toEqual(['model/a.bdae']);
  });

  it('throws its own error on a wrong signature or records that do not fit', () => {
    const bytes = scenery(4, [0, 0], ['model/a.bdae'], [{ ...item, path: 0 }]);
    const wrong = bytes.slice();
    wrong[0] = 0x58;
    expect(() => parseItm(wrong)).toThrow(TileFormatError);
    expect(() => parseItm(bytes.slice(0, 40))).toThrow(TileFormatError);
  });
});

describe('parseTrn', () => {
  it('reads heights in hundredths, row-major with rows along z', () => {
    const doc = parseTrn(ground({ height: (r, c) => r * 100 + c }));
    expect(doc.side).toBe(TRN_SIDE);
    expect(doc.flat).toBe(false);
    expect(doc.heights![0]).toBe(0);
    expect(doc.heights![1]).toBeCloseTo(0.01);
    expect(doc.heights![TRN_SIDE]).toBe(1);
  });

  it('finds the path table at the fixed prefix, taking each span up to its zero', () => {
    const encode = (s: string) => new TextEncoder().encode(s);
    const first = new Uint8Array(20);
    first.set(encode('texture/a.tga'));
    first.set(encode('xyz'), 14);
    const second = new Uint8Array(16);
    second.set(encode('texture/b.tga'));
    const doc = parseTrn(ground({ spans: [first, second] }));
    expect(doc.textures).toEqual(['texture/a.tga', 'texture/b.tga']);
  });

  it('treats a tile at -10 everywhere as empty, and one sample at -10 as ground', () => {
    const empty = parseTrn(ground({ height: () => -1000 }));
    expect(empty).toMatchObject({ flat: true, heights: null, colours: null });
    const one = parseTrn(ground({ height: (r, c) => (r === 3 && c === 4 ? -1000 : 250) }));
    expect(one.flat).toBe(false);
    expect(one.heights![3 * TRN_SIDE + 4]).toBe(-10);
  });

  it('skips the grids when heights are not wanted', () => {
    expect(parseTrn(ground({}), false)).toMatchObject({ flat: true, heights: null, colours: null });
  });

  it('reads the 5-6-5 tint per sample', () => {
    expect(parseTrn(ground({ tint: i => i })).colours![100]).toBe(100);
  });

  it('numbers chunks along x first and reads only the water and hole bits', () => {
    const doc = parseTrn(
      ground({
        chunks: i =>
          i === 9
            ? { flags: (0xcccd0000 | (1 << 16)) >>> 0, water: 250 }
            : i === 10
              ? { flags: 1 << 17 }
              : {},
      }),
    );
    expect(doc.chunks[9]).toMatchObject({ chunk: [1, 1], hasWater: true, waterLevel: 2.5 });
    expect(doc.chunks[10]).toMatchObject({ chunk: [2, 1], hasWater: false, isHole: true });
    expect(doc.chunks[8].chunk).toEqual([0, 1]);
  });

  it('keeps layers in place, turning an index past the path table into none', () => {
    const doc = parseTrn(
      ground({
        paths: ['texture/a.tga', 'texture/b.tga'],
        chunks: i => (i === 0 ? { layers: [0, -1, 1] } : { layers: [1, 5, -1] }),
      }),
    );
    expect(doc.chunks[0].textures).toEqual([0, -1, 1]);
    expect(doc.chunks[1].textures).toEqual([1, -1, -1]);
  });

  it('throws on a wrong signature or a file too short for the heights', () => {
    const bytes = ground({});
    const wrong = bytes.slice();
    wrong[0] = 0x58;
    expect(() => parseTrn(wrong)).toThrow(TileFormatError);
    expect(() => parseTrn(bytes.slice(0, 5000))).toThrow(TileFormatError);
  });
});

describe('tile names', () => {
  it('writes four characters per coordinate, a minus sign then three digits when negative', () => {
    expect(tileStem(17, 12)).toBe('0017_0012');
    expect(tileStem(-25, -16)).toBe('-025_-016');
  });

  it('builds each per-tile path', () => {
    expect(tileName('land1', 'terrain', 3, -1, 'trn')).toBe('world/land1/terrain/0003_-001.trn');
    expect(layerName('land1', 3, 4, 0)).toBe('world/land1/layers/0003_0004_0.msk');
    expect(layerName('land1', 3, 4, 1)).toBe('world/land1/layers/0003_0004_1.msk');
    expect(layerName('land1', 3, 4, null)).toBe('world/land1/layers/0003_0004.shw');
  });
});
