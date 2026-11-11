/** Texture dispatch by header sniffing: 1,895 of 5,170 ".tga" files in res.bin are PVRTC. */

import { storedEntries } from '../vfs/zip';
import { decodeEtc1, FMT_ETC1 } from './etc1';
import { decompress, downscale, isPvr, parseHeader, type PvrHeader } from './pvrtc';
import type { DecodedImage } from './image';
import { decodeTga } from './tga';

export type { DecodedImage };

export interface TextureInfo {
  format: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  mipmapCount: number;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(data: Uint8Array): boolean {
  return data.length >= 8 && PNG_MAGIC.every((b, i) => data[i] === b);
}

/** The largest level of an ETC1 picture, scaled down to the cap. */
function decodeEtc1Level(data: Uint8Array, h: PvrHeader, maxSize?: number): DecodedImage {
  const image = decodeEtc1(data, h.headerSize, h.width, h.height);
  return maxSize && Math.max(image.width, image.height) > maxSize
    ? downscale(image.width, image.height, image.pixels, maxSize)
    : image;
}

/**
 * ETC1 carries no transparency, so a picture that needs it is stored as two:
 * a small archive of a `SPLIT` mark, `rgb.pvr` and `alpha.pvr`, the second
 * holding the transparency as a grey picture of the same size.
 */
function splitPicture(data: Uint8Array): { colour: Uint8Array; alpha: Uint8Array } | null {
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) return null;
  const parts = storedEntries(data);
  const colour = parts?.get('rgb.pvr');
  const alpha = parts?.get('alpha.pvr');
  return parts?.has('SPLIT') && colour && alpha ? { colour, alpha } : null;
}

/** Decode to RGBA, capping the long edge; PVRTC picks a stored mip where there is a chain (`res.bin` has none). */
export function decodeTexture(
  data: Uint8Array,
  maxSize?: number,
): { image: DecodedImage; info: TextureInfo } {
  const split = splitPicture(data);
  if (split) {
    const colour = decodeTexture(split.colour, maxSize);
    const alpha = decodeTexture(split.alpha, maxSize).image;
    if (alpha.width === colour.image.width && alpha.height === colour.image.height) {
      for (let i = 0; i < alpha.pixels.length; i += 4) {
        colour.image.pixels[i + 3] = alpha.pixels[i]!;
      }
    }
    return { image: colour.image, info: { ...colour.info, hasAlpha: true } };
  }

  if (isPvr(data)) {
    const h = parseHeader(data);
    const image =
      h.format === FMT_ETC1 ? decodeEtc1Level(data, h, maxSize) : decompress(data, h, maxSize);
    return {
      image,
      info: {
        format: h.formatName,
        width: image.width,
        height: image.height,
        hasAlpha: h.hasAlpha,
        mipmapCount: h.mipmapCount,
      },
    };
  }

  let image = decodeTga(data);
  if (maxSize && Math.max(image.width, image.height) > maxSize) {
    image = downscale(image.width, image.height, image.pixels, maxSize);
  }
  return {
    image,
    info: {
      format: 'TGA',
      width: image.width,
      height: image.height,
      hasAlpha: true,
      mipmapCount: 0,
    },
  };
}

/** Straight alpha: Chrome premultiplies by default and WebGL uploads as is, giving cut-outs dark rims (measured). */
export const STRAIGHT_ALPHA: ImageBitmapOptions = { premultiplyAlpha: 'none' };

/**
 * Decode straight to an `ImageBitmap`, which is what the renderer uploads.
 *
 * PNG is handed to the browser rather than decoded here; nothing in the packs
 * needs a PNG decoder of our own.
 */
export async function decodeTextureBitmap(
  data: Uint8Array,
  maxSize?: number,
): Promise<ImageBitmap> {
  if (isPng(data)) {
    return createImageBitmap(new Blob([data as BlobPart], { type: 'image/png' }), STRAIGHT_ALPHA);
  }
  const { image } = decodeTexture(data, maxSize);
  return createImageBitmap(new ImageData(image.pixels, image.width, image.height), STRAIGHT_ALPHA);
}

/** Loading-image art minus padding (960x640 in square POT texture; ratios
 * hold at both rungs). */
export async function cropLoadingArt(image: ImageBitmap): Promise<ImageBitmap> {
  const width = Math.round(image.width * (960 / 1024));
  const height = Math.round(image.height * (640 / 1024));
  if (width >= image.width && height >= image.height) return image;
  const cropped = await createImageBitmap(image, 0, 0, width, height);
  image.close();
  return cropped;
}

/** Re-encode as WebP for art shown as an image, so the browser decodes it natively; null without OffscreenCanvas. */
export async function encodeBitmap(image: ImageBitmap): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  } catch {
    return null;
  }
}
