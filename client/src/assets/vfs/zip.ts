/** Pack reader (GBMP-stamped ZIP + plain-ZIP .ipas) over ByteSource;
 * central directory up front only; methods 0 (store) and 8 (deflate). */

import { type ByteSource, bytesSource, view } from './ByteSource';
import { inflateRaw } from './inflate';

export const SIG_LFH_PK = 0x04034b50; // "PK\x03\x04"
export const SIG_LFH_GBMP = 0x504d4247; // "GBMP"
export const SIG_CD = 0x02014b50;
export const SIG_EOCD = 0x06054b50;

const CD_SIZE = 46;
const LFH_SIZE = 30;
const EOCD_SIZE = 22;

/** General-purpose flag bit 3: the sizes follow the data, not the local header. */
const SIZES_AFTER_DATA = 0x0008;

export const METHOD_STORE = 0;
export const METHOD_DEFLATE = 8;

export interface PackEntry {
  name: string;
  headerOffset: number;
  method: number;
  compSize: number;
  size: number;
  isDir: boolean;
}

export class PackError extends Error {}

export class PackReader {
  readonly name: string;
  readonly entries: PackEntry[] = [];
  /** The bytes this pack was opened over. Exposed so a caller can address a
   * stored member in place rather than copying it out. */
  readonly source: ByteSource;
  private readonly byName = new Map<string, PackEntry>();

  private constructor(source: ByteSource, name: string) {
    this.source = source;
    this.name = name;
  }

  static async open(source: ByteSource, name = '<pack>'): Promise<PackReader> {
    const reader = new PackReader(source, name);
    await reader.scan();
    return reader;
  }

  get length(): number {
    return this.entries.length;
  }

  /** Case-insensitive: packs and the names that point into them disagree on case. */
  get(name: string): PackEntry | undefined {
    return this.byName.get(normalise(name));
  }

  has(name: string): boolean {
    return this.byName.has(normalise(name));
  }

  /** Where an entry's data starts, past its variable-length local header. */
  async dataOffset(entry: PackEntry): Promise<{ at: number; comp: number; size: number }> {
    const head = await this.source.read(entry.headerOffset, LFH_SIZE);
    if (head.length < LFH_SIZE) {
      throw new PackError(`${this.name}: truncated local header for ${entry.name}`);
    }
    const dv = view(head);
    const sig = dv.getUint32(0, true);
    if (sig !== SIG_LFH_PK && sig !== SIG_LFH_GBMP) {
      throw new PackError(`${this.name}: bad local header 0x${sig.toString(16)} for ${entry.name}`);
    }
    const flag = dv.getUint16(6, true);
    let comp = dv.getUint32(18, true);
    let size = dv.getUint32(22, true);
    const at = entry.headerOffset + LFH_SIZE + dv.getUint16(26, true) + dv.getUint16(28, true);
    if (flag & SIZES_AFTER_DATA || (!comp && !size)) {
      // Sizes are zeroed in the LFH; the central directory is truth.
      comp = entry.compSize;
      size = entry.size;
    }
    return { at, comp, size };
  }

  async read(nameOrEntry: string | PackEntry): Promise<Uint8Array> {
    const entry = typeof nameOrEntry === 'string' ? this.get(nameOrEntry) : nameOrEntry;
    if (!entry) throw new PackError(`${this.name}: no such entry: ${String(nameOrEntry)}`);

    const { at, comp, size } = await this.dataOffset(entry);
    const blob = await this.source.read(at, comp);
    if (entry.method === METHOD_STORE) return size ? blob.subarray(0, size) : blob;
    if (entry.method === METHOD_DEFLATE) return inflateRaw(blob, size);
    throw new PackError(
      `${this.name}: unsupported compression method ${entry.method} for ${entry.name}`,
    );
  }

  /**
   * The entry's bytes as a stream, without ever holding them all.
   *
   * This is how a 654 MB pack gets out of the .ipa and into storage: the
   * bytes go straight from the ranged reads through the inflater into a file,
   * so peak memory is a chunk rather than the whole pack.
   */
  async stream(nameOrEntry: string | PackEntry): Promise<ReadableStream<Uint8Array>> {
    const entry = typeof nameOrEntry === 'string' ? this.get(nameOrEntry) : nameOrEntry;
    if (!entry) throw new PackError(`${this.name}: no such entry: ${String(nameOrEntry)}`);
    const { at, comp } = await this.dataOffset(entry);
    const source = this.source;

    const CHUNK = 4 << 20;
    let sent = 0;
    const raw = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        if (sent >= comp) {
          controller.close();
          return;
        }
        const chunk = await source.read(at + sent, Math.min(CHUNK, comp - sent));
        if (chunk.length === 0) {
          controller.close();
          return;
        }
        sent += chunk.length;
        // Copy: the source may hand back a view onto a reused buffer.
        const owned = new Uint8Array(new ArrayBuffer(chunk.length));
        owned.set(chunk);
        controller.enqueue(owned);
      },
    });

    if (entry.method === METHOD_STORE) return raw;
    if (entry.method === METHOD_DEFLATE) {
      // `DecompressionStream` declares its writable side as `BufferSource`,
      // which does not unify with the reader's chunk type; the pairing is
      // correct at runtime.
      const inflater = new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<
        Uint8Array,
        Uint8Array<ArrayBuffer>
      >;
      return raw.pipeThrough(inflater);
    }
    throw new PackError(
      `${this.name}: unsupported compression method ${entry.method} for ${entry.name}`,
    );
  }

  private async findEocd(): Promise<{ directoryAt: number; directorySize: number; total: number }> {
    const size = this.source.size;
    if (size < EOCD_SIZE) throw new PackError(`${this.name}: too small to be a pack`);

    // A pack with no ZIP comment ends with its EOCD record. Fall back to a
    // bounded backwards scan for one that has a comment.
    let blob = await this.source.read(size - EOCD_SIZE, EOCD_SIZE);
    let at = 0;
    if (view(blob).getUint32(0, true) !== SIG_EOCD) {
      const back = Math.min(size, 65557);
      blob = await this.source.read(size - back, back);
      at = lastIndexOfSig(blob, SIG_EOCD);
      if (at < 0) throw new PackError(`${this.name}: no end-of-central-directory record`);
    }
    const dv = view(blob);
    return {
      total: dv.getUint16(at + 10, true),
      directorySize: dv.getUint32(at + 12, true),
      directoryAt: dv.getUint32(at + 16, true),
    };
  }

  private async scan(): Promise<void> {
    const { directoryAt, directorySize, total } = await this.findEocd();
    const cd = await this.source.read(directoryAt, directorySize);
    const dv = view(cd);
    const decoder = new TextDecoder('utf-8');

    let pos = 0;
    for (let i = 0; i < total; i++) {
      if (pos + CD_SIZE > cd.length) break;
      if (dv.getUint32(pos, true) !== SIG_CD) break;
      const method = dv.getUint16(pos + 10, true);
      const compSize = dv.getUint32(pos + 20, true);
      const size = dv.getUint32(pos + 24, true);
      const fnLen = dv.getUint16(pos + 28, true);
      const extraLen = dv.getUint16(pos + 30, true);
      const commentLen = dv.getUint16(pos + 32, true);
      const localOff = dv.getUint32(pos + 42, true);
      const name = decoder
        .decode(cd.subarray(pos + CD_SIZE, pos + CD_SIZE + fnLen))
        .replace(/\\/g, '/');
      pos += CD_SIZE + fnLen + extraLen + commentLen;

      const entry: PackEntry = {
        name,
        headerOffset: localOff,
        method,
        compSize,
        size,
        isDir: name.endsWith('/'),
      };
      this.entries.push(entry);
      const key = normalise(name);
      if (!this.byName.has(key)) this.byName.set(key, entry);
    }
  }
}

/**
 * Unwrap the ZIP around a .bdae file.
 *
 * Each .bdae in res.bin is a standard ZIP holding one member, normally
 * `little_endian_not_quantized.bdae`, and that member is the model itself.
 * Input that is not a ZIP passes through unchanged.
 */
export async function unwrapBdae(
  data: Uint8Array,
): Promise<{ member: string | null; payload: Uint8Array }> {
  if (data[0] !== 0x50 || data[1] !== 0x4b) return { member: null, payload: data };
  try {
    const inner = await PackReader.open(bytesSource(data), '<bdae>');
    const members = inner.entries.filter(e => !e.isDir);
    if (!members.length) return { member: null, payload: data };
    // Prefer the little-endian variant when several are present.
    members.sort((a, b) => {
      const al = a.name.toLowerCase().includes('little') ? 0 : 1;
      const bl = b.name.toLowerCase().includes('little') ? 0 : 1;
      return al - bl || a.name.localeCompare(b.name);
    });
    return { member: members[0].name, payload: await inner.read(members[0]) };
  } catch {
    return { member: null, payload: data };
  }
}

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^[./]+/, '');
}

function lastIndexOfSig(buf: Uint8Array, sig: number): number {
  const b0 = sig & 0xff;
  const b1 = (sig >> 8) & 0xff;
  const b2 = (sig >> 16) & 0xff;
  const b3 = (sig >>> 24) & 0xff;
  for (let i = buf.length - 4; i >= 0; i--) {
    if (buf[i] === b0 && buf[i + 1] === b1 && buf[i + 2] === b2 && buf[i + 3] === b3) {
      return i;
    }
  }
  return -1;
}
