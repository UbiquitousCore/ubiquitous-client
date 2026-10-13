/**
 * Builds synthetic `.beff` byte streams, laid out as `docs/formats/beff.md`
 * describes, so the reader can be tested without game data.
 */

export class StreamBuilder {
  private bytes: number[] = [];
  private readonly scratch = new DataView(new ArrayBuffer(4));

  i32(v: number): this {
    this.scratch.setInt32(0, v, true);
    for (let i = 0; i < 4; i++) this.bytes.push(this.scratch.getUint8(i));
    return this;
  }

  u32(v: number): this {
    this.scratch.setUint32(0, v, true);
    for (let i = 0; i < 4; i++) this.bytes.push(this.scratch.getUint8(i));
    return this;
  }

  u16(v: number): this {
    this.scratch.setUint16(0, v, true);
    this.bytes.push(this.scratch.getUint8(0), this.scratch.getUint8(1));
    return this;
  }

  f32(v: number): this {
    this.scratch.setFloat32(0, v, true);
    for (let i = 0; i < 4; i++) this.bytes.push(this.scratch.getUint8(i));
    return this;
  }

  /** Length-prefixed, zero-padded to a multiple of four with at least one zero. */
  text(s: string): this {
    if (s === '') return this.i32(0);
    const padded = (Math.floor(s.length / 4) + 1) * 4;
    this.i32(padded);
    for (let i = 0; i < padded; i++) this.bytes.push(i < s.length ? s.charCodeAt(i) : 0);
    return this;
  }

  raw(...b: number[]): this {
    this.bytes.push(...b);
    return this;
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export type Keys<T> = Array<[frame: number, value: T]>;

export interface TrackSpec<T> {
  keys: Keys<T>;
  /** The raw repeats field. */
  repeats?: number;
}

type Val = 'int' | 'float' | 'vec3';

export function writeTrack(w: StreamBuilder, kind: Val, t: TrackSpec<number | number[]>): void {
  w.i32(t.keys.length).i32(t.repeats ?? 0);
  for (const [frame, value] of t.keys) {
    w.i32(frame);
    if (kind === 'vec3') for (const v of value as number[]) w.f32(v);
    else if (kind === 'int') w.i32(value as number);
    else w.f32(value as number);
  }
}

const one = <T>(v: T): TrackSpec<T> => ({ keys: [[0, v]] });

export type AffectorSpec =
  | { kind: 0; strength: TrackSpec<number>; direction: TrackSpec<number[]> }
  | { kind: 1; factor: TrackSpec<number> }
  | { kind: 2; amplitude: [number, number, number]; changeEveryFrames: number }
  | { kind: 3; strength: TrackSpec<number>; axis: TrackSpec<number[]>; swirlMode: number };

/** Every field an emitter record carries, with a plain default for each. */
export interface EmitterSpec {
  attachPoint: string;
  settings: number[]; // 13 values in table order: i32, u16, u16, then 10 × i32
  placement: Array<TrackSpec<number>>; // 10 tracks
  scale: Array<TrackSpec<number>>; // 3 tracks, written in version 9 only
  launch: Array<TrackSpec<number>>; // 4 tracks
  aimDirection: TrackSpec<number[]>;
  look: number[]; // 22 values in table order
  texture: string;
  lookTracks: Array<TrackSpec<number>>; // 11 tracks
  affectors: AffectorSpec[];
  children: EmitterSpec[];
}

/** Look fields whose table entry is a float, by index. */
const LOOK_FLOATS = new Set([6, 8, 10]);
/** Look fields whose table entry is a u16, by index. */
const LOOK_U16 = new Set([20, 21]);
const LOOK_TRACK_KINDS: Val[] = ['int', 'int', 'int', 'int', ...Array<Val>(7).fill('float')];

export function emitterSpec(over: Partial<EmitterSpec> = {}): EmitterSpec {
  return {
    attachPoint: '',
    settings: [0, 0, 0, 0, 0, -1, 0, 5, 0, 0, 0, 0, 0],
    placement: [one(0), one(0), one(0), one(0), one(0), one(0), one(0), one(0), one(0), one(0)],
    scale: [one(1), one(1), one(1)],
    launch: [one(1), one(0), one(2), one(0)],
    aimDirection: one([0, 1, 0]),
    look: [0, 0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    texture: 'glow.tga',
    lookTracks: [
      one(255),
      one(255),
      one(255),
      one(255),
      one(1),
      one(1),
      one(0),
      one(0),
      one(0),
      one(1),
      one(1),
    ],
    affectors: [],
    children: [],
    ...over,
  };
}

export function writeEmitter(w: StreamBuilder, e: EmitterSpec, version: number): void {
  w.text(e.attachPoint).i32(e.children.length);
  e.settings.forEach((v, i) => (i === 1 || i === 2 ? w.u16(v) : w.i32(v)));
  writeTrack(w, 'float', e.placement[0]);
  writeTrack(w, 'float', e.placement[1]);
  writeTrack(w, 'float', e.placement[2]);
  writeTrack(w, 'int', e.placement[3]);
  for (const t of e.placement.slice(4)) writeTrack(w, 'float', t);
  if (version === 9) for (const t of e.scale) writeTrack(w, 'float', t);
  for (const t of e.launch) writeTrack(w, 'float', t);
  writeTrack(w, 'vec3', e.aimDirection);
  e.look.forEach((v, i) => (LOOK_FLOATS.has(i) ? w.f32(v) : LOOK_U16.has(i) ? w.u16(v) : w.i32(v)));
  w.text(e.texture);
  e.lookTracks.forEach((t, i) => writeTrack(w, LOOK_TRACK_KINDS[i], t));
  w.i32(e.affectors.length);
  e.affectors.forEach((a, i) => {
    w.i32(i + 1).i32(a.kind);
    if (a.kind === 0) {
      writeTrack(w, 'float', a.strength);
      writeTrack(w, 'vec3', a.direction);
    } else if (a.kind === 1) {
      writeTrack(w, 'float', a.factor);
    } else if (a.kind === 2) {
      w.f32(a.amplitude[0]).f32(a.amplitude[1]).f32(a.amplitude[2]).f32(a.changeEveryFrames);
    } else {
      writeTrack(w, 'float', a.strength);
      writeTrack(w, 'vec3', a.axis);
      w.i32(a.swirlMode);
    }
  });
  for (const child of e.children) writeEmitter(w, child, version);
}

export type NodeSpec =
  | { kind: 'emitter'; emitter: EmitterSpec }
  | {
      kind: 'mesh';
      path: string;
      repeats: number;
      opacity: TrackSpec<number>;
      carrier?: EmitterSpec;
    };

export interface BeffSpec {
  version: number;
  delay?: [number, number];
  nodes: NodeSpec[];
}

export function writeBeff(spec: BeffSpec): Uint8Array {
  const w = new StreamBuilder();
  const [low, high] = spec.delay ?? [0, 0];
  w.u32(0x66666562).i32(spec.version).i32(low).i32(high).i32(spec.nodes.length);
  for (const node of spec.nodes) {
    if (node.kind === 'emitter') {
      w.i32(0);
      writeEmitter(w, node.emitter, spec.version);
    } else {
      w.i32(1).text(node.path).i32(node.repeats);
      writeTrack(w, 'int', node.opacity);
      if (spec.version === 9) {
        writeEmitter(
          w,
          node.carrier ?? emitterSpec({ settings: [5, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0] }),
          9,
        );
      }
    }
  }
  return w.finish();
}
