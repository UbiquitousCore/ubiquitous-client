/** TGA: uncompressed and RLE, true-colour, colour-mapped and greyscale; `texture.ts` routes PVR files elsewhere. */

import { type DecodedImage, type Pixels, allocPixels } from './image';

export type { DecodedImage };

export class TgaError extends Error {}

export function decodeTga(data: Uint8Array): DecodedImage {
  if (data.length < 18) throw new TgaError('shorter than an 18-byte TGA header');
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const idLen = data[0];
  const cmapType = data[1];
  const imageType = data[2];
  const cmapFirst = dv.getUint16(3, true);
  const cmapLen = dv.getUint16(5, true);
  const cmapDepth = data[7];
  const width = dv.getUint16(12, true);
  const height = dv.getUint16(14, true);
  const depth = data[16];
  const descriptor = data[17];

  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
    throw new TgaError(`implausible dimensions ${width}x${height}`);
  }

  let pos = 18 + idLen;

  let palette: Uint8Array | null = null;
  if (cmapType === 1) {
    const entryBytes = (cmapDepth + 7) >> 3;
    palette = expandPalette(data.subarray(pos, pos + cmapLen * entryBytes), cmapDepth, cmapLen);
    pos += cmapLen * entryBytes;
  }

  const rle = imageType === 9 || imageType === 10 || imageType === 11;
  const baseType = rle ? imageType - 8 : imageType;
  if (baseType !== 1 && baseType !== 2 && baseType !== 3) {
    throw new TgaError(`unsupported TGA image type ${imageType}`);
  }

  const bpp = (depth + 7) >> 3;
  const count = width * height;
  const raw = rle ? decodeRle(data, pos, count, bpp) : data.subarray(pos, pos + count * bpp);
  if (raw.length < count * bpp) {
    throw new TgaError(`truncated pixel data (${raw.length} of ${count * bpp} bytes)`);
  }

  let out = allocPixels(width, height);
  if (baseType === 1) {
    if (!palette) throw new TgaError('colour-mapped TGA without a palette');
    applyPalette(raw, out, count, bpp, palette, cmapFirst);
  } else if (baseType === 3) {
    expandGrey(raw, out, count, bpp);
  } else {
    expandTruecolor(raw, out, count, depth);
  }

  // descriptor bit 5 set means the first row is the top row.
  if (!(descriptor & 0x20)) out = flipVertical(out, width, height);
  if (descriptor & 0x10) out = flipHorizontal(out, width, height);
  return { width, height, pixels: out };
}

function decodeRle(data: Uint8Array, start: number, count: number, bpp: number): Uint8Array {
  const need = count * bpp;
  const out = new Uint8Array(need);
  let pos = start;
  let at = 0;
  while (at < need && pos < data.length) {
    const packet = data[pos++];
    const n = (packet & 0x7f) + 1;
    if (packet & 0x80) {
      if (pos + bpp > data.length) break;
      for (let i = 0; i < n && at < need; i++) {
        for (let c = 0; c < bpp; c++) out[at + c] = data[pos + c];
        at += bpp;
      }
      pos += bpp;
    } else {
      const take = Math.min(n * bpp, need - at);
      out.set(data.subarray(pos, pos + take), at);
      at += take;
      pos += n * bpp;
    }
  }
  if (at < need) throw new TgaError(`truncated RLE stream (${at} of ${need} bytes)`);
  return out;
}

/** Palette as flat RGBA, four bytes per entry. */
function expandPalette(raw: Uint8Array, depth: number, count: number): Uint8Array {
  const step = (depth + 7) >> 3;
  const pal = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    if ((i + 1) * step > raw.length) break;
    const [r, g, b, a] = pixelToRgba(raw, i * step, depth);
    pal[i * 4] = r;
    pal[i * 4 + 1] = g;
    pal[i * 4 + 2] = b;
    pal[i * 4 + 3] = a;
  }
  return pal;
}

function pixelToRgba(raw: Uint8Array, at: number, depth: number): [number, number, number, number] {
  if (depth === 32) return [raw[at + 2], raw[at + 1], raw[at], raw[at + 3]];
  if (depth === 24) return [raw[at + 2], raw[at + 1], raw[at], 255];
  if (depth === 16 || depth === 15) {
    const v = raw[at] | (raw[at + 1] << 8);
    const r = (v >> 10) & 0x1f;
    const g = (v >> 5) & 0x1f;
    const b = v & 0x1f;
    const a = depth === 15 || v & 0x8000 ? 255 : 0;
    return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2), a];
  }
  if (depth === 8) return [raw[at], raw[at], raw[at], 255];
  throw new TgaError(`unsupported pixel depth ${depth}`);
}

function expandTruecolor(raw: Uint8Array, out: Pixels, count: number, depth: number): void {
  if (depth === 32) {
    for (let i = 0; i < count; i++) {
      const s = i * 4;
      const d = i * 4;
      out[d] = raw[s + 2];
      out[d + 1] = raw[s + 1];
      out[d + 2] = raw[s];
      out[d + 3] = raw[s + 3];
    }
  } else if (depth === 24) {
    for (let i = 0; i < count; i++) {
      const s = i * 3;
      const d = i * 4;
      out[d] = raw[s + 2];
      out[d + 1] = raw[s + 1];
      out[d + 2] = raw[s];
      out[d + 3] = 255;
    }
  } else if (depth === 15 || depth === 16) {
    for (let i = 0; i < count; i++) {
      const [r, g, b, a] = pixelToRgba(raw, i * 2, depth);
      const d = i * 4;
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = b;
      out[d + 3] = a;
    }
  } else {
    throw new TgaError(`unsupported true-colour depth ${depth}`);
  }
}

function expandGrey(raw: Uint8Array, out: Pixels, count: number, bpp: number): void {
  for (let i = 0; i < count; i++) {
    const v = raw[i * bpp];
    const d = i * 4;
    out[d] = v;
    out[d + 1] = v;
    out[d + 2] = v;
    out[d + 3] = bpp === 2 ? raw[i * bpp + 1] : 255;
  }
}

function applyPalette(
  raw: Uint8Array,
  out: Pixels,
  count: number,
  bpp: number,
  palette: Uint8Array,
  first: number,
): void {
  const n = palette.length >> 2;
  for (let i = 0; i < count; i++) {
    const rawIdx = bpp === 1 ? raw[i] : raw[i * bpp] | (raw[i * bpp + 1] << 8);
    const idx = rawIdx - first;
    const d = i * 4;
    if (idx >= 0 && idx < n) {
      out[d] = palette[idx * 4];
      out[d + 1] = palette[idx * 4 + 1];
      out[d + 2] = palette[idx * 4 + 2];
      out[d + 3] = palette[idx * 4 + 3];
    } else {
      out[d] = out[d + 1] = out[d + 2] = out[d + 3] = 0;
    }
  }
}

function flipVertical(buf: Pixels, width: number, height: number): Pixels {
  const stride = width * 4;
  const out = allocPixels(width, height);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * stride;
    out.set(buf.subarray(src, src + stride), y * stride);
  }
  return out;
}

function flipHorizontal(buf: Pixels, width: number, height: number): Pixels {
  const stride = width * 4;
  const out = allocPixels(width, height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const s = row + (width - 1 - x) * 4;
      const d = row + x * 4;
      out[d] = buf[s];
      out[d + 1] = buf[s + 1];
      out[d + 2] = buf[s + 2];
      out[d + 3] = buf[s + 3];
    }
  }
  return out;
}
