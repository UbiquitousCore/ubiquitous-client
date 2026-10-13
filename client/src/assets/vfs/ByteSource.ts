/**
 * Random access to bytes through ranged reads (a picked `File`, an OPFS
 * handle, or memory); nothing may read a 1.6 GB .ipa whole. Below the assets
 * boundary on purpose.
 */

export interface ByteSource {
  readonly size: number;
  /**
   * Bytes `[offset, offset + length)`. May return fewer at end of source.
   *
   * The result may be a view onto a shared buffer, so callers must copy before
   * holding on to it past the next read.
   */
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async read(offset, length) {
      const buf = await blob.slice(offset, offset + length).arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}

export function bytesSource(data: Uint8Array): ByteSource {
  return {
    size: data.length,
    async read(offset, length) {
      return data.subarray(offset, Math.min(offset + length, data.length));
    },
  };
}

/**
 * A window onto part of another source, addressed from zero.
 *
 * Used for a pack stored uncompressed inside the .ipa: the pack reader gets to
 * treat it as a file of its own without anything being copied.
 */
export function sliceSource(inner: ByteSource, at: number, length: number): ByteSource {
  return {
    size: length,
    read(offset, want) {
      const start = at + Math.max(0, offset);
      const end = Math.min(at + length, start + want);
      return inner.read(start, Math.max(0, end - start));
    },
  };
}

/** Little-endian view over a chunk, for the header readers. */
export function view(a: Uint8Array): DataView {
  return new DataView(a.buffer, a.byteOffset, a.byteLength);
}
