/** Raw DEFLATE through the platform's DecompressionStream, so the client
 * carries no inflate code of its own. */

/** Inflate `data` in one go. `sizeHint` trims the result; 0 means unknown. */
export async function inflateRaw(data: Uint8Array, sizeHint = 0): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  const n = sizeHint ? Math.min(sizeHint, buf.byteLength) : buf.byteLength;
  return new Uint8Array(buf, 0, n);
}
