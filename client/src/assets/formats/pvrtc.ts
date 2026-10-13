/** PVR v2 container and PVRTC 2bpp/4bpp decompression to RGBA8. */

import { type DecodedImage, type Pixels, allocPixels } from './image';

export type { DecodedImage };

export const PVR2_HEADER_SIZE = 52;

export const FMT_PVRTC_2BPP = 24;
export const FMT_PVRTC_4BPP = 25;

const FLAG_ALPHA = 0x8000;

/** Modulation weights, in eighths. */
const MOD_STANDARD = [0, 3, 5, 8];
const MOD_PUNCH = [0, 4, 4, 8];

export class PvrError extends Error {}

export interface PvrHeader {
  headerSize: number;
  width: number;
  height: number;
  mipmapCount: number;
  flags: number;
  format: number;
  formatName: string;
  dataLength: number;
  /** Bits per pixel as the header states it. */
  pixelBits: number;
  hasAlpha: boolean;
  twiddled: boolean;
}

/** 'PVR!' at byte 44 — the file extension is not to be trusted. */
export function isPvr(data: Uint8Array): boolean {
  return (
    data.length >= PVR2_HEADER_SIZE &&
    data[44] === 0x50 &&
    data[45] === 0x56 &&
    data[46] === 0x52 &&
    data[47] === 0x21
  );
}

export function parseHeader(data: Uint8Array): PvrHeader {
  if (!isPvr(data)) throw new PvrError('not a PVR v2 file');
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u = (i: number) => dv.getUint32(i * 4, true);
  const flags = u(4);
  const fmt = flags & 0xff;
  return {
    headerSize: u(0),
    height: u(1),
    width: u(2),
    mipmapCount: u(3),
    flags,
    format: fmt,
    formatName:
      fmt === FMT_PVRTC_2BPP
        ? 'PVRTC 2bpp'
        : fmt === FMT_PVRTC_4BPP
          ? 'PVRTC 4bpp'
          : '0x' + fmt.toString(16).padStart(2, '0'),
    dataLength: u(5),
    pixelBits: u(6),
    hasAlpha: (flags & FLAG_ALPHA) !== 0,
    twiddled: (flags & 0x200) !== 0,
  };
}

/**
 * Where block (x, y) of a `cols` x `rows` grid sits in the stored data.
 *
 * The largest square the grid holds, of side `min(cols, rows)`, is laid out
 * in Z-order: bit k of y lands on bit 2k of the index and bit k of x on bit
 * 2k + 1. A non-square grid is a row or column of such squares, each stored
 * whole before the next, so the coordinate along the longer side picks the
 * square and the interleave places the block within it.
 */
function blockIndex(cols: number, rows: number, x: number, y: number): number {
  const side = Math.min(cols, rows);
  let sideBits = 0;
  while (1 << sideBits < side) sideBits++;

  let within = 0;
  for (let k = 0; k < sideBits; k++) {
    within |= ((y >> k) & 1) << (2 * k);
    within |= ((x >> k) & 1) << (2 * k + 1);
  }
  const alongLonger = cols > rows ? x : y;
  const square = alongLonger >> sideBits;
  return (square << (2 * sideBits)) | within;
}

/** 5-bit channel to 8-bit. */
function x5(v: number): number {
  return (v << 3) | (v >> 2);
}

/** 4-bit alpha to 8-bit. */
function x4(v: number): number {
  return (v << 4) | v;
}

function levelBytes(width: number, height: number, bw: number, bh: number): number {
  return Math.max(1, (width / bw) | 0) * Math.max(1, (height / bh) | 0) * 8;
}

export function decompress(data: Uint8Array, header?: PvrHeader, maxSize?: number): DecodedImage {
  const h = header ?? parseHeader(data);
  let width = h.width;
  let height = h.height;
  const fmt = h.format;
  if (fmt !== FMT_PVRTC_2BPP && fmt !== FMT_PVRTC_4BPP) {
    throw new PvrError('unsupported PVR pixel format ' + h.formatName);
  }
  const twoBit = fmt === FMT_PVRTC_2BPP;
  const bw = twoBit ? 8 : 4;
  const bh = 4;
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new PvrError('implausible dimensions ' + width + 'x' + height);
  }

  let bodyAt = h.headerSize;
  let bodyLen = data.length - bodyAt;

  // Walk down the mip chain while a smaller level exists and is still >= the
  // requested cap. Levels are stored largest-first, back to back.
  if (maxSize) {
    let offset = 0;
    while (
      h.mipmapCount &&
      Math.max(width, height) > maxSize &&
      width > bw * 2 &&
      height > bh * 2
    ) {
      const step = levelBytes(width, height, bw, bh);
      if (offset + step + levelBytes(width >> 1, height >> 1, bw, bh) > bodyLen) break;
      offset += step;
      width >>= 1;
      height >>= 1;
    }
    bodyAt += offset;
    bodyLen -= offset;
  }

  const bxCount = Math.max(1, (width / bw) | 0);
  const byCount = Math.max(1, (height / bh) | 0);
  const nBlocks = bxCount * byCount;
  if (bodyLen < nBlocks * 8) {
    throw new PvrError('truncated PVRTC data (' + bodyLen + ' of ' + nBlocks * 8 + ' bytes)');
  }

  // Word reads go through a DataView: the body starts at a header-dependent
  // offset, so a Uint32Array view over it is not guaranteed to be aligned.
  const dv = new DataView(data.buffer, data.byteOffset + bodyAt, nBlocks * 8);

  // Pass 1: decode every word into colours + modulation.
  const colA = new Uint8Array(nBlocks * 4);
  const colB = new Uint8Array(nBlocks * 4);
  const mods = new Uint32Array(nBlocks);
  const modes = new Uint8Array(nBlocks);

  for (let by = 0; by < byCount; by++) {
    for (let bx = 0; bx < bxCount; bx++) {
      const idx = blockIndex(bxCount, byCount, bx, by);
      const modData = dv.getUint32(idx * 8, true);
      const colourData = dv.getUint32(idx * 8 + 4, true);
      const slot = by * bxCount + bx;
      const o = slot * 4;

      // Colour A — low 16 bits.
      const low = colourData & 0xffff;
      if (low & 0x8000) {
        // Opaque mode: RGB 554 — blue carries one bit less than red/green.
        const b4 = (low >> 1) & 0x0f;
        colA[o] = x5((low >> 10) & 0x1f);
        colA[o + 1] = x5((low >> 5) & 0x1f);
        colA[o + 2] = x5(((b4 << 1) | (b4 >> 3)) & 0x1f);
        colA[o + 3] = x4(0x0f);
      } else {
        // Transparent mode: ARGB 3443.
        const a3 = (low >> 12) & 0x07;
        const r4 = (low >> 8) & 0x0f;
        const g4 = (low >> 4) & 0x0f;
        const b3 = (low >> 1) & 0x07;
        colA[o] = x5(((r4 << 1) | (r4 >> 3)) & 0x1f);
        colA[o + 1] = x5(((g4 << 1) | (g4 >> 3)) & 0x1f);
        colA[o + 2] = x5(((b3 << 2) | (b3 >> 1)) & 0x1f);
        colA[o + 3] = x4((a3 << 1) & 0x0f);
      }

      // Colour B — high 16 bits.
      const high = colourData >>> 16;
      if (colourData & 0x80000000) {
        // Opaque mode: RGB 555.
        colB[o] = x5((high >> 10) & 0x1f);
        colB[o + 1] = x5((high >> 5) & 0x1f);
        colB[o + 2] = x5(high & 0x1f);
        colB[o + 3] = x4(0x0f);
      } else {
        // Transparent mode: ARGB 4443.
        const a3 = (high >> 12) & 0x07;
        const r4 = (high >> 8) & 0x0f;
        const g4 = (high >> 4) & 0x0f;
        const b4 = high & 0x0f;
        colB[o] = x5(((r4 << 1) | (r4 >> 3)) & 0x1f);
        colB[o + 1] = x5(((g4 << 1) | (g4 >> 3)) & 0x1f);
        colB[o + 2] = x5(((b4 << 1) | (b4 >> 3)) & 0x1f);
        colB[o + 3] = x4((a3 << 1) & 0x0f);
      }

      mods[slot] = modData;
      modes[slot] = colourData & 1;
    }
  }

  const out = allocPixels(width, height);
  const halfW = bw >> 1;
  const halfH = bh >> 1;

  // Iterate block *quads* rather than pixels. Shifting the output window by
  // half a block puts the run of pixels strictly inside the quad P,Q,R,S of
  // block centres, which makes the bilinear weights identical for every quad
  // — so they are computed once here instead of a million times inside.
  const nPix = bw * bh;
  const weights = new Float64Array(nPix * 4);
  for (let j = 0; j < bh; j++) {
    const wy = j / bh;
    for (let i = 0; i < bw; i++) {
      const wx = i / bw;
      const k = (j * bw + i) * 4;
      weights[k] = (1 - wx) * (1 - wy);
      weights[k + 1] = wx * (1 - wy);
      weights[k + 2] = (1 - wx) * wy;
      weights[k + 3] = wx * wy;
    }
  }

  // Which of P,Q,R,S supplies this pixel's modulation, and at which bit.
  const cornerWhich = new Int32Array(nPix);
  const cornerBit = new Int32Array(nPix);
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const k = j * bw + i;
      cornerWhich[k] = (i >= halfW ? 1 : 0) + (j >= halfH ? 2 : 0);
      cornerBit[k] = ((halfH + j) % bh) * bw + ((halfW + i) % bw);
    }
  }

  const rowStride = width * 4;

  for (let by = 0; by < byCount; by++) {
    const by1 = (by + 1) % byCount;
    const baseY = by * bh + halfH;
    for (let bx = 0; bx < bxCount; bx++) {
      const bx1 = (bx + 1) % bxCount;
      const baseX = bx * bw + halfW;
      const q0 = (by * bxCount + bx) * 4;
      const q1 = (by * bxCount + bx1) * 4;
      const q2 = (by1 * bxCount + bx) * 4;
      const q3 = (by1 * bxCount + bx1) * 4;

      let k = 0;
      for (let j = 0; j < bh; j++) {
        let py = baseY + j;
        if (py >= height) py -= height;
        const outRow = py * rowStride;
        for (let i = 0; i < bw; i++) {
          let px = baseX + i;
          if (px >= width) px -= width;
          const wk = k * 4;
          const w00 = weights[wk];
          const w10 = weights[wk + 1];
          const w01 = weights[wk + 2];
          const w11 = weights[wk + 3];
          const which = cornerWhich[k];
          const pixI = cornerBit[k];
          k++;

          const corner =
            which === 0 ? q0 >> 2 : which === 1 ? q1 >> 2 : which === 2 ? q2 >> 2 : q3 >> 2;
          const md = mods[corner];
          let weight: number;
          let punch = false;
          if (twoBit) {
            weight = (md >>> pixI) & 1 ? 8 : 0;
          } else {
            const sel = (md >>> (pixI * 2)) & 3;
            if (modes[corner]) {
              weight = MOD_PUNCH[sel];
              punch = sel === 2;
            } else {
              weight = MOD_STANDARD[sel];
            }
          }
          const t = weight * 0.125;

          const o = outRow + px * 4;
          for (let c = 0; c < 4; c++) {
            const av =
              colA[q0 + c] * w00 + colA[q1 + c] * w10 + colA[q2 + c] * w01 + colA[q3 + c] * w11;
            const bv =
              colB[q0 + c] * w00 + colB[q1 + c] * w10 + colB[q2 + c] * w01 + colB[q3 + c] * w11;
            // Add a half and truncate, so halves round up. Handing the
            // fraction to the clamped array would round half to even.
            out[o + c] = (av + (bv - av) * t + 0.5) | 0;
          }
          if (punch) out[o + 3] = 0;
        }
      }
    }
  }

  if (maxSize && Math.max(width, height) > maxSize) {
    // No usable mip chain: fall back to shrinking the decoded image.
    return downscale(width, height, out, maxSize);
  }
  return { width, height, pixels: out };
}

/** Nearest-neighbour shrink to at most `maxSize` on the long edge. */
export function downscale(
  width: number,
  height: number,
  px: Pixels,
  maxSize: number,
): DecodedImage {
  const longest = Math.max(width, height);
  if (longest <= maxSize) return { width, height, pixels: px };
  let step = 1;
  while (((longest / (step * 2)) | 0) >= maxSize) step *= 2;
  if (((longest / step) | 0) > maxSize) step *= 2;
  const nw = Math.max(1, (width / step) | 0);
  const nh = Math.max(1, (height / step) | 0);
  const out = allocPixels(nw, nh);
  for (let y = 0; y < nh; y++) {
    const src = y * step * width * 4;
    const dst = y * nw * 4;
    for (let x = 0; x < nw; x++) {
      const s = src + x * step * 4;
      const d = dst + x * 4;
      out[d] = px[s];
      out[d + 1] = px[s + 1];
      out[d + 2] = px[s + 2];
      out[d + 3] = px[s + 3];
    }
  }
  return { width: nw, height: nh, pixels: out };
}
