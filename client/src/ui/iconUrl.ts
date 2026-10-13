/** An `ImageBitmap` as a data URL for `<img>` (object URLs do not take bitmaps everywhere), weakly cached. */

const cache = new WeakMap<ImageBitmap, string>();

export function iconUrl(icon: ImageBitmap): string {
  let url = cache.get(icon);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = icon.width;
    canvas.height = icon.height;
    canvas.getContext('2d')!.drawImage(icon, 0, 0);
    url = canvas.toDataURL();
    cache.set(icon, url);
  }
  return url;
}
