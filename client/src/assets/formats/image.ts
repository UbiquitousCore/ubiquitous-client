/** The decoded-image shape; `pixels` is a plain `ArrayBuffer` because `ImageData` rejects shared ones. */

export type Pixels = Uint8ClampedArray<ArrayBuffer>;

/** RGBA8, top-left origin, `width * height * 4` bytes. */
export interface DecodedImage {
  width: number;
  height: number;
  pixels: Pixels;
}

export function allocPixels(width: number, height: number): Pixels {
  return new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
}
