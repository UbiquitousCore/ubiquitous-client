/**
 * "FTABLE" .tbl files: a 44-byte header (uint32 row count +12, column count
 * +16, row keys +20, format string +24, rows +28, stride +32), one format
 * letter per column; string cells are offset and length into a pool.
 */

const HEADER_SIZE = 44;
const STRING_WIDTH = 6; // uint32 file offset, then int16 length

export class FTableError extends Error {}

/** A cell is a number for every column type except 's'. */
export type Cell = number | string;
export type Row = Cell[];

interface Scalar {
  width: number;
  read(dv: DataView, at: number): number;
}

const SCALARS: Record<string, Scalar> = {
  k: { width: 4, read: (dv, at) => dv.getUint32(at, true) },
  u: { width: 4, read: (dv, at) => dv.getUint32(at, true) },
  i: { width: 4, read: (dv, at) => dv.getInt32(at, true) },
  f: { width: 4, read: (dv, at) => dv.getFloat32(at, true) },
  c: { width: 1, read: (dv, at) => dv.getInt8(at) },
  h: { width: 2, read: (dv, at) => dv.getInt16(at, true) },
};

const DEFAULT_SCALAR = SCALARS.u;

export class FTable {
  readonly rows: number;
  readonly cols: number;
  readonly format: string;
  readonly rowStride: number;

  private readonly data: Uint8Array;
  private readonly dv: DataView;
  private readonly keysAt: number;
  private readonly rowsAt: number;
  /**
   * Strict, so a stored string is UTF-8 only when every byte says so — a
   * lenient decode turns one bad byte into a tofu box and calls it done.
   */
  private readonly strictDecoder = new TextDecoder('utf-8', { fatal: true });
  /**
   * Western-European single-byte text, for strings that are not UTF-8.
   * Quest prose shows tofu boxes where its punctuation should be (a smart
   * apostrophe reads as one bad byte, not three good ones), which is the
   * shape of windows-1252 stored as-is rather than of anything re-encoded.
   */
  private readonly fallbackDecoder = new TextDecoder('windows-1252');

  constructor(data: Uint8Array) {
    if (data.length < HEADER_SIZE) {
      throw new FTableError(`shorter than a ${HEADER_SIZE}-byte FTABLE header`);
    }
    const magic = String.fromCharCode(...data.subarray(0, 6));
    if (magic !== 'FTABLE') throw new FTableError(`bad magic ${JSON.stringify(magic)}`);

    this.data = data;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.rows = this.dv.getUint32(12, true);
    this.cols = this.dv.getUint32(16, true);
    this.keysAt = this.dv.getUint32(20, true);
    const formatAt = this.dv.getUint32(24, true);
    this.rowsAt = this.dv.getUint32(28, true);
    this.rowStride = this.dv.getUint32(32, true);

    this.format = String.fromCharCode(...data.subarray(formatAt, formatAt + this.cols));
  }

  /** Row keys, in row order. */
  keys(): Uint32Array {
    const n = this.rows;
    if (this.keysAt + n * 4 > this.data.length) return new Uint32Array(0);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.dv.getUint32(this.keysAt + i * 4, true);
    return out;
  }

  row(i: number): Row {
    let pos = this.rowsAt + i * this.rowStride;
    if (pos + this.rowStride > this.data.length) {
      throw new FTableError(`row ${i} past end of file`);
    }
    const out: Row = [];
    for (const c of this.format) {
      if (c === 's') {
        const off = this.dv.getUint32(pos, true);
        const len = this.dv.getInt16(pos + 4, true);
        out.push(this.readString(off, len));
        pos += STRING_WIDTH;
      } else {
        const scalar = SCALARS[c] ?? DEFAULT_SCALAR;
        out.push(scalar.read(this.dv, pos));
        pos += scalar.width;
      }
    }
    return out;
  }

  allRows(): Row[] {
    const out: Row[] = new Array(this.rows);
    for (let i = 0; i < this.rows; i++) out[i] = this.row(i);
    return out;
  }

  /** Rows indexed by their key. A repeated key keeps its first row. */
  byKey(): Map<number, Row> {
    const keys = this.keys();
    const out = new Map<number, Row>();
    for (let i = 0; i < this.rows; i++) {
      if (!out.has(keys[i])) out.set(keys[i], this.row(i));
    }
    return out;
  }

  private readString(off: number, length: number): string {
    if (length <= 0 || off <= 0 || off + length > this.data.length) return '';
    // The stored length counts the terminating NUL, so trim it.
    let end = off + length;
    while (end > off && this.data[end - 1] === 0) end--;
    const bytes = this.data.subarray(off, end);
    try {
      return this.strictDecoder.decode(bytes);
    } catch {
      return this.fallbackDecoder.decode(bytes);
    }
  }
}
