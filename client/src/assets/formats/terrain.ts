/**
 * Readers for a map tile's scenery list (`.itm`) and ground (`.trn`), and the
 * path names of every per-tile file. Layout: client/docs/formats/terrain.md.
 */

import { LeView } from './leView';

/** Samples per side of a tile's height, tint and normal grids. */
export const TRN_SIDE = 65;

const CHUNKS_PER_SIDE = 8;
const CHUNK_COUNT = CHUNKS_PER_SIDE * CHUNKS_PER_SIDE;
const SAMPLES = TRN_SIDE * TRN_SIDE;

/** Where each part of a `.trn` starts; the prefix is the same in every file. */
const TRN = {
  header: 24,
  chunkSize: 12,
  heights: 24 + CHUNK_COUNT * 12,
  tints: 24 + CHUNK_COUNT * 12 + SAMPLES * 2,
  normals: 24 + CHUNK_COUNT * 12 + SAMPLES * 4,
  paths: 24 + CHUNK_COUNT * 12 + SAMPLES * 7 + 1,
} as const;

/** A height sample of -10 everywhere marks a tile with no ground. */
const NO_GROUND_RAW = -1000;

const WATER_BIT = 1 << 16;
const HOLE_BIT = 1 << 17;

const ITM_HEADER = 24;

export class TileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TileFormatError';
  }
}

export interface ItmItem {
  /** Pack path of the model or effect placed. */
  model: string;
  /** The record's third word; its meaning is not known. */
  ref: number;
  /** Index of `model` in the tile's path list. */
  nameIndex: number;
  /** Tile-local position. */
  pos: [number, number, number];
  /** The quaternion as stored: the conjugate of the rotation to apply. */
  rot: [number, number, number, number];
  scale: [number, number, number];
}

export interface ItmTile {
  version: number;
  recordSize: number;
  tile: [number, number];
  count: number;
  names: string[];
  items: ItmItem[];
}

export interface TrnChunk {
  /** Chunk column and row, x first. */
  chunk: [number, number];
  flag: number;
  hasWater: boolean;
  isHole: boolean;
  /** World units. */
  waterLevel: number;
  /** Base texture, then the layers blended by mask 0 and mask 1; -1 is none. */
  textures: [number, number, number];
}

export interface TrnTile {
  version: number;
  side: number;
  textures: string[];
  chunks: TrnChunk[];
  /** True when there is no height grid: an empty tile, or none asked for. */
  flat: boolean;
  /** World units, row-major, row along z. */
  heights: Float32Array | null;
  /** 5-6-5 tint per sample. */
  colours: Uint16Array | null;
}

/**
 * The path table that ends both tile files: a count, the cumulative end of
 * each span in the text that follows, then the text. Returns the paths and
 * where the table ends.
 */
function readPathTable(view: LeView, at: number): { paths: string[]; end: number } {
  const count = view.u32(at);
  const ends = at + 4;
  const text = ends + count * 4;
  if (!view.fits(ends, count * 4))
    throw new TileFormatError('path table runs past the end of the file');
  const paths: string[] = [];
  let from = 0;
  for (let i = 0; i < count; i++) {
    const to = view.u32(ends + i * 4);
    if (to < from || !view.fits(text, to))
      throw new TileFormatError('path span runs past the end of the file');
    paths.push(view.text(text + from, text + to));
    from = to;
  }
  return { paths, end: text + from };
}

export function parseItm(bytes: Uint8Array): ItmTile {
  const view = new LeView(bytes);
  if (view.size < ITM_HEADER || view.tag(0) !== 'AITM')
    throw new TileFormatError('not a scenery tile');
  const version = view.u32(4);
  // Record width from the stamp at +4, by byte count: 3 packs 56 bytes per
  // placement; any other stamp seen packs 64 (two trailing words, unread).
  // Either width lands the path table right after the last placement.
  const recordSize = version === 3 ? 56 : 64;
  const tile: [number, number] = [view.i32(8), view.i32(12)];
  const count = view.i32(16);
  if (count < 0 || !view.fits(ITM_HEADER, count * recordSize)) {
    throw new TileFormatError('placement records run past the end of the file');
  }
  let names: string[];
  try {
    names = readPathTable(view, ITM_HEADER + count * recordSize).paths;
  } catch (err) {
    if (err instanceof TileFormatError) throw err;
    throw new TileFormatError('path table runs past the end of the file');
  }

  const items: ItmItem[] = [];
  for (let i = 0; i < count; i++) {
    const at = ITM_HEADER + i * recordSize;
    const nameIndex = view.u32(at + 12);
    const f = view.floats(at + 16, 10);
    items.push({
      model: names[nameIndex] ?? '',
      ref: view.u32(at + 8),
      nameIndex,
      pos: [f[0], f[1], f[2]],
      rot: [f[3], f[4], f[5], f[6]],
      scale: [f[7], f[8], f[9]],
    });
  }
  return { version, recordSize, tile, count, names, items };
}

export function parseTrn(bytes: Uint8Array, wantHeights = true): TrnTile {
  const view = new LeView(bytes);
  if (view.size < 4 || view.tag(0) !== 'ATIL') throw new TileFormatError('not a ground tile');
  if (view.size < TRN.tints) throw new TileFormatError('ground tile too short for its height grid');
  const version = view.u32(4);

  // A file cut short after the heights keeps its ground and loses its paths.
  let textures: string[] = [];
  if (view.fits(TRN.paths, 4)) {
    try {
      textures = readPathTable(view, TRN.paths).paths;
    } catch {
      textures = [];
    }
  }

  const chunks: TrnChunk[] = [];
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const at = TRN.header + i * TRN.chunkSize;
    const flag = view.u32(at);
    const layer = (k: number): number => {
      const v = view.i16(at + 6 + k * 2);
      return v >= 0 && v < textures.length ? v : -1;
    };
    chunks.push({
      chunk: [i % CHUNKS_PER_SIDE, Math.floor(i / CHUNKS_PER_SIDE)],
      flag,
      hasWater: (flag & WATER_BIT) !== 0,
      isHole: (flag & HOLE_BIT) !== 0,
      waterLevel: view.i16(at + 4) / 100,
      textures: [layer(0), layer(1), layer(2)],
    });
  }

  let heights: Float32Array | null = null;
  let colours: Uint16Array | null = null;
  if (wantHeights) {
    let empty = true;
    const grid = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const raw = view.i16(TRN.heights + i * 2);
      if (raw !== NO_GROUND_RAW) empty = false;
      grid[i] = raw / 100;
    }
    if (!empty) {
      heights = grid;
      if (view.fits(TRN.tints, SAMPLES * 2)) {
        colours = new Uint16Array(SAMPLES);
        for (let i = 0; i < SAMPLES; i++) colours[i] = view.u16(TRN.tints + i * 2);
      }
    }
  }

  return { version, side: TRN_SIDE, textures, chunks, flat: heights === null, heights, colours };
}

function coordinate(n: number): string {
  return n < 0 ? `-${String(-n).padStart(3, '0')}` : String(n).padStart(4, '0');
}

/** A tile's file stem: `0017_0012`, `-025_-016`. */
export function tileStem(x: number, z: number): string {
  return `${coordinate(x)}_${coordinate(z)}`;
}

/** `world/<map>/<kind>/<stem>.<ext>`. */
export function tileName(map: string, kind: string, x: number, z: number, ext: string): string {
  return `world/${map}/${kind}/${tileStem(x, z)}.${ext}`;
}

/** The blend mask for layer 0 or 1, or the shadow map for `null`. */
export function layerName(map: string, x: number, z: number, layer: number | null = null): string {
  const stem = tileStem(x, z);
  return layer === null
    ? `world/${map}/layers/${stem}.shw`
    : `world/${map}/layers/${stem}_${layer}.msk`;
}
