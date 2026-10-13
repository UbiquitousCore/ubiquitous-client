/**
 * Builds synthetic model, collision and world-tile files, laid out as
 * `docs/formats/bdae.md`, `phy.md` and `terrain.md` describe, so the readers
 * can be tested without game data.
 */

/** Little-endian bytes appended front to back. */
export class LeWriter {
  private readonly out: number[] = [];
  private readonly scratch = new DataView(new ArrayBuffer(4));

  get length(): number {
    return this.out.length;
  }

  private push(n: number): this {
    for (let i = 0; i < n; i++) this.out.push(this.scratch.getUint8(i));
    return this;
  }

  u8(...vs: number[]): this {
    for (const v of vs) this.out.push(v & 0xff);
    return this;
  }

  i16(...vs: number[]): this {
    for (const v of vs) {
      this.scratch.setInt16(0, v, true);
      this.push(2);
    }
    return this;
  }

  u16(...vs: number[]): this {
    for (const v of vs) {
      this.scratch.setUint16(0, v, true);
      this.push(2);
    }
    return this;
  }

  i32(...vs: number[]): this {
    for (const v of vs) {
      this.scratch.setInt32(0, v, true);
      this.push(4);
    }
    return this;
  }

  u32(...vs: number[]): this {
    for (const v of vs) {
      this.scratch.setUint32(0, v, true);
      this.push(4);
    }
    return this;
  }

  f32(...vs: number[]): this {
    for (const v of vs) {
      this.scratch.setFloat32(0, v, true);
      this.push(4);
    }
    return this;
  }

  ascii(s: string): this {
    for (let i = 0; i < s.length; i++) this.out.push(s.charCodeAt(i));
    return this;
  }

  bytes(bs: ArrayLike<number>): this {
    for (let i = 0; i < bs.length; i++) this.out.push(bs[i]);
    return this;
  }

  done(): Uint8Array {
    return new Uint8Array(this.out);
  }
}

// — .bdae ------------------------------------------------------------------------

/**
 * A model file under construction: a 60-byte header, an empty relocation
 * table, a string table, a model-info block, then records allocated as they
 * are asked for. Pointers are absolute offsets.
 */
export class ModelWriter {
  readonly bytes: Uint8Array;
  readonly dv: DataView;
  readonly info: number;
  private strings: number;
  private end: number;
  private readonly placed = new Map<string, number>();

  constructor(size = 8192, stringSpace = 1024) {
    this.bytes = new Uint8Array(size);
    this.dv = new DataView(this.bytes.buffer);
    this.strings = 60;
    this.info = 60 + stringSpace;
    this.end = this.info + 188 + 8;
  }

  /** A string table entry; returns the pointer a `str` field holds (its text). */
  str(s: string): number {
    const known = this.placed.get(s);
    if (known !== undefined) return known;
    this.dv.setUint32(this.strings, s.length, true);
    const text = this.strings + 4;
    for (let i = 0; i < s.length; i++) this.bytes[text + i] = s.charCodeAt(i);
    this.strings = text + Math.ceil((s.length + 1) / 4) * 4;
    if (this.strings > this.info) throw new Error('string table full');
    this.placed.set(s, text);
    return text;
  }

  /** Room for `size` bytes, 4-aligned. */
  alloc(size: number): number {
    const at = this.end;
    this.end += Math.ceil(size / 4) * 4;
    if (this.end > this.bytes.length) throw new Error('model buffer full');
    return at;
  }

  u8(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setUint8(at + i, v));
  }

  u16(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setUint16(at + i * 2, v, true));
  }

  u32(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setUint32(at + i * 4, v >>> 0, true));
  }

  i32(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setInt32(at + i * 4, v, true));
  }

  f32(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setFloat32(at + i * 4, v, true));
  }

  /** A count-then-pointer pair at `at`, for `count` records of `size` bytes; returns the records' offset. */
  list(at: number, count: number, size: number): number {
    const ptr = count ? this.alloc(count * size) : 0;
    this.u32(at, count, ptr);
    return ptr;
  }

  /** A model-info list. */
  infoList(slot: number, count: number, size: number): number {
    return this.list(this.info + slot, count, size);
  }

  /** A data block: its tag, then `payload` bytes; returns the block's start. */
  block(tag: number, payload: number): number {
    const at = this.alloc(4 + payload);
    this.u32(at, tag);
    return at;
  }

  done(): Uint8Array {
    const size = this.end;
    this.bytes.set([0x42, 0x52, 0x45, 0x53], 0);
    this.u16(4, 0xfffe, 0);
    this.u32(8, 60, size, 0, 0, 60, 60, this.info, this.info + 188, size, 0, 0);
    this.u32(this.info, this.str('synthetic'));
    this.u32(this.info + 188, 1, 0);
    return this.bytes.slice(0, size);
  }
}

// — .phy ---------------------------------------------------------------------------

/** A `.phy` file: the declared count, then blocks in file axes. */
export class CollisionWriter {
  private readonly w = new LeWriter();

  constructor(declared: number) {
    this.w.i32(declared);
  }

  primitive(type: number, flags: number, yaw: number, centre: number[], half: number[]): this {
    this.w
      .i32(type)
      .u32(flags)
      .f32(yaw, ...centre, ...half);
    return this;
  }

  mesh(
    flags: number,
    position: number[],
    half: number[],
    vertices: number[][],
    faces: number[][],
  ): this {
    this.w
      .i32(7)
      .u32(flags)
      .f32(...position, ...half)
      .i16(vertices.length, faces.length);
    for (const v of vertices) this.w.f32(...v);
    for (const f of faces) this.w.u16(...f);
    return this;
  }

  raw(build: (w: LeWriter) => void): this {
    build(this.w);
    return this;
  }

  done(): Uint8Array {
    return this.w.done();
  }
}

// — .itm / .trn ------------------------------------------------------------------------

/** A path table: count, cumulative span ends, then the text; `spans` pads each span. */
export function pathTable(w: LeWriter, paths: string[], spans?: Uint8Array[]): void {
  const bodies =
    spans ??
    paths.map(p => {
      const span = new Uint8Array(Math.ceil((p.length + 1) / 4) * 4);
      for (let i = 0; i < p.length; i++) span[i] = p.charCodeAt(i);
      return span;
    });
  w.u32(bodies.length);
  let end = 0;
  for (const b of bodies) w.u32((end += b.length));
  for (const b of bodies) w.bytes(b);
}

export interface PlacementSpec {
  kind?: number;
  ref?: number;
  path: number;
  pos: number[];
  rot: number[];
  scale: number[];
  trailer?: [number, number];
}

export function scenery(
  version: number,
  tile: [number, number],
  paths: string[],
  items: PlacementSpec[],
): Uint8Array {
  const w = new LeWriter()
    .ascii('AITM')
    .u32(version)
    .i32(tile[0], tile[1], items.length, paths.length);
  items.forEach((it, i) => {
    w.u32(it.kind ?? 2, i, it.ref ?? 0xffffffff, it.path).f32(...it.pos, ...it.rot, ...it.scale);
    if (version !== 3) w.u32(...(it.trailer ?? [255, 255]));
  });
  pathTable(w, paths);
  return w.done();
}

export interface ChunkSpec {
  flags?: number;
  water?: number;
  layers?: [number, number, number];
}

export function ground(opts: {
  tile?: [number, number];
  chunks?: (i: number) => ChunkSpec;
  height?: (row: number, col: number) => number;
  tint?: (i: number) => number;
  paths?: string[];
  spans?: Uint8Array[];
}): Uint8Array {
  const side = 65;
  const w = new LeWriter()
    .ascii('ATIL')
    .u32(9)
    .i32(...(opts.tile ?? [0, 0]))
    .u32(0)
    .u16(0, 0);
  for (let i = 0; i < 64; i++) {
    const c = opts.chunks?.(i) ?? {};
    w.u32(c.flags ?? 0).i16(c.water ?? 0, ...(c.layers ?? [0, -1, -1]));
  }
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) w.i16(opts.height?.(r, c) ?? 0);
  for (let i = 0; i < side * side; i++) w.u16(opts.tint?.(i) ?? 0xffff);
  for (let i = 0; i < side * side; i++) w.u8(0, 127, 0);
  w.u8(0);
  pathTable(w, opts.paths ?? ['texture/ground.tga'], opts.spans);
  return w.done();
}
