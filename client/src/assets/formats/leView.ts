/**
 * Bounds-checked little-endian reads over a byte array, shared by the model,
 * collision and world-tile readers.
 *
 * Every read throws `RangeError` when it would leave the array, so a reader
 * can treat "ran off the end" as one failure instead of checking each field.
 */

export class LeView {
  readonly dv: DataView;
  readonly size: number;

  constructor(readonly bytes: Uint8Array) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.size = bytes.byteLength;
  }

  fits(at: number, length: number): boolean {
    return Number.isInteger(at) && at >= 0 && length >= 0 && at + length <= this.size;
  }

  private need(at: number, length: number): void {
    if (!this.fits(at, length))
      throw new RangeError(`read of ${length} at ${at} leaves ${this.size} bytes`);
  }

  u8(at: number): number {
    this.need(at, 1);
    return this.dv.getUint8(at);
  }

  i8(at: number): number {
    this.need(at, 1);
    return this.dv.getInt8(at);
  }

  u16(at: number): number {
    this.need(at, 2);
    return this.dv.getUint16(at, true);
  }

  i16(at: number): number {
    this.need(at, 2);
    return this.dv.getInt16(at, true);
  }

  u32(at: number): number {
    this.need(at, 4);
    return this.dv.getUint32(at, true);
  }

  i32(at: number): number {
    this.need(at, 4);
    return this.dv.getInt32(at, true);
  }

  f32(at: number): number {
    this.need(at, 4);
    return this.dv.getFloat32(at, true);
  }

  /** `count` consecutive floats as a plain array. */
  floats(at: number, count: number): number[] {
    this.need(at, count * 4);
    const out = new Array<number>(count);
    for (let i = 0; i < count; i++) out[i] = this.dv.getFloat32(at + i * 4, true);
    return out;
  }

  /** ASCII text from `at` up to the first zero byte, or up to `end`. */
  text(at: number, end = this.size): string {
    this.need(at, 0);
    const stop = Math.min(end, this.size);
    let out = '';
    for (let i = at; i < stop; i++) {
      const c = this.bytes[i];
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out;
  }

  /** Four bytes read as ASCII, for signatures. */
  tag(at: number): string {
    this.need(at, 4);
    return String.fromCharCode(
      this.bytes[at],
      this.bytes[at + 1],
      this.bytes[at + 2],
      this.bytes[at + 3],
    );
  }
}
