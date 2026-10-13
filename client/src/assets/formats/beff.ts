/**
 * `.beff` effects, versions 8 and 9 (`client/docs/formats/beff.md`): one
 * sequential stream with no offsets, so the only integrity check is ending
 * exactly on the last byte. Fields are read from tables.
 */

export const BEFF_SIGNATURE = 0x66666562;

/** Where an emitter's particles are born. */
export const SpawnShape = { point: 0, sphere: 1, disc: 2, box: 3, carrier: 5 } as const;
/** How each particle is drawn. */
export const QuadKind = {
  sprite: 0,
  freeQuad: 1,
  streak: 2,
  facingStreak: 3,
  ribbon: 4,
  facingRibbon: 5,
} as const;
export const BlendMode = { alpha: 0, additive: 1 } as const;
export const AffectorKind = { pull: 0, speedScale: 1, wander: 2, swirl: 3 } as const;

export interface BeffKey<T> {
  frame: number;
  value: T;
}

/** An animated value: keys at frame times, optionally looping past the last. */
export interface BeffTrack<T> {
  loop: boolean;
  keys: Array<BeffKey<T>>;
}

export type Vec3 = [number, number, number];

export interface BeffEmitterSettings {
  spawnShape: number;
  soundId: number;
  faceCamera: boolean;
  inheritMask: number;
  burstSizeJitterPct: number;
  activeFrames: number;
  firstBurstFrame: number;
  burstEveryFrames: number;
  burstSpacingJitterPct: number;
  killParticlesWithEmitter: boolean;
  /** An i32 that is 0 in every emitter of both builds; kept as read. */
  spareWord: number;
  radialSpeedJitterPct: number;
  aimSpeedJitterPct: number;
}

export interface BeffEmitterTracks {
  shapeSizeX: BeffTrack<number>;
  shapeSizeY: BeffTrack<number>;
  shapeSizeZ: BeffTrack<number>;
  hollowPct: BeffTrack<number>;
  emitterAngleX: BeffTrack<number>;
  emitterAngleY: BeffTrack<number>;
  emitterAngleZ: BeffTrack<number>;
  emitterOffsetX: BeffTrack<number>;
  emitterOffsetY: BeffTrack<number>;
  emitterOffsetZ: BeffTrack<number>;
  emitterScaleX: BeffTrack<number>;
  emitterScaleY: BeffTrack<number>;
  emitterScaleZ: BeffTrack<number>;
  burstSize: BeffTrack<number>;
  radialSpeed: BeffTrack<number>;
  aimSpeed: BeffTrack<number>;
  spreadDegrees: BeffTrack<number>;
  aimDirection: BeffTrack<Vec3>;
}

export interface BeffParticleLook {
  quadKind: number;
  inheritMask: number;
  lifeFrames: number;
  lifeJitterPct: number;
  sizeJitterPct: number;
  lockAspect: boolean;
  startTilt: Vec3;
  startTiltJitterPct: Vec3;
  spinJitterPct: Vec3;
  growJitterPct: number;
  blendMode: number;
  anchorColumn: number;
  anchorRow: number;
  uvQuarterTurns: number;
  mirrorU: boolean;
  mirrorV: boolean;
  textureName: string;
  red: BeffTrack<number>;
  green: BeffTrack<number>;
  blue: BeffTrack<number>;
  opacity: BeffTrack<number>;
  width: BeffTrack<number>;
  height: BeffTrack<number>;
  spinX: BeffTrack<number>;
  spinY: BeffTrack<number>;
  spinZ: BeffTrack<number>;
  growX: BeffTrack<number>;
  growY: BeffTrack<number>;
}

export type BeffAffector =
  | { kind: 'pull'; strength: BeffTrack<number>; direction: BeffTrack<Vec3> }
  | { kind: 'speedScale'; factor: BeffTrack<number> }
  | { kind: 'wander'; amplitude: Vec3; changeEveryFrames: number }
  | { kind: 'swirl'; strength: BeffTrack<number>; axis: BeffTrack<Vec3>; swirlMode: 0 | 1 };

export interface BeffEmitter {
  attachPoint: string;
  settings: BeffEmitterSettings;
  tracks: BeffEmitterTracks;
  look: BeffParticleLook;
  affectors: BeffAffector[];
  children: BeffEmitter[];
}

export type BeffNode =
  | { kind: 'emitter'; emitter: BeffEmitter }
  | {
      kind: 'mesh';
      meshPath: string;
      meshRepeats: boolean;
      meshOpacity: BeffTrack<number>;
      /** Version 9 only: the emitter record whose transform tracks move the mesh. */
      carrier: BeffEmitter | null;
    };

export interface BeffFile {
  version: 8 | 9;
  startDelayLow: number;
  startDelayHigh: number;
  nodes: BeffNode[];
}

/**
 * Upper bounds well above anything the shipped files hold. Past them the
 * reader has lost its place, and stopping early beats allocating a huge array.
 */
const LIMITS = {
  nodes: 1024,
  children: 64,
  depth: 4,
  affectors: 64,
  keys: 1024,
  stringLength: 1024,
};

type Scalar = 'i32' | 'u16' | 'f32';

class Cursor {
  private readonly view: DataView;
  pos = 0;

  constructor(
    readonly bytes: Uint8Array,
    private readonly label: string,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  fail(why: string): never {
    throw new Error(`${this.label}: ${why} at byte ${this.pos}`);
  }

  private need(n: number): number {
    const at = this.pos;
    if (at + n > this.bytes.byteLength) this.fail(`file ends early (wanted ${n} more bytes)`);
    this.pos = at + n;
    return at;
  }

  scalar(type: Scalar): number {
    switch (type) {
      case 'i32':
        return this.view.getInt32(this.need(4), true);
      case 'u16':
        return this.view.getUint16(this.need(2), true);
      case 'f32':
        return this.view.getFloat32(this.need(4), true);
    }
  }

  u32(): number {
    return this.view.getUint32(this.need(4), true);
  }

  count(what: string, max: number): number {
    const n = this.scalar('i32');
    if (n < 0 || n > max) this.fail(`${what} ${n} is out of range`);
    return n;
  }

  vec3(): Vec3 {
    return [this.scalar('f32'), this.scalar('f32'), this.scalar('f32')];
  }

  text(): string {
    const length = this.count('string length', LIMITS.stringLength);
    const at = this.need(length);
    let end = at + length;
    while (end > at && this.bytes[end - 1] === 0) end--;
    let out = '';
    for (let i = at; i < end; i++) out += String.fromCharCode(this.bytes[i]);
    return out;
  }
}

type TrackValue = 'int' | 'float' | 'vec3';

function readTrack(c: Cursor, value: 'vec3'): BeffTrack<Vec3>;
function readTrack(c: Cursor, value: 'int' | 'float'): BeffTrack<number>;
function readTrack(c: Cursor, value: TrackValue): BeffTrack<number> | BeffTrack<Vec3> {
  const keyCount = c.count('key count', LIMITS.keys);
  // Only 1 loops; other non-zero values are stray bytes on single-key tracks.
  const loop = c.scalar('i32') === 1;
  const keys: Array<BeffKey<number | Vec3>> = [];
  for (let i = 0; i < keyCount; i++) {
    const frame = c.scalar('i32');
    const v = value === 'vec3' ? c.vec3() : value === 'int' ? c.scalar('i32') : c.scalar('f32');
    keys.push({ frame, value: v });
  }
  return { loop, keys } as BeffTrack<number> | BeffTrack<Vec3>;
}

/** Reads a run of scalar fields in table order into one record. */
function readFields<K extends string>(
  c: Cursor,
  fields: ReadonlyArray<readonly [K, Scalar]>,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const [name, type] of fields) out[name] = c.scalar(type);
  return out;
}

/** Reads a run of tracks in table order into one record. */
function readTracks<K extends string>(
  c: Cursor,
  fields: ReadonlyArray<readonly [K, 'int' | 'float']>,
): Record<K, BeffTrack<number>> {
  const out = {} as Record<K, BeffTrack<number>>;
  for (const [name, type] of fields) out[name] = readTrack(c, type);
  return out;
}

const SETTINGS_BLOCK = [
  ['spawnShape', 'i32'],
  ['soundId', 'u16'],
  ['faceCamera', 'u16'],
  ['inheritMask', 'i32'],
  ['burstSizeJitterPct', 'i32'],
  ['activeFrames', 'i32'],
  ['firstBurstFrame', 'i32'],
  ['burstEveryFrames', 'i32'],
  ['burstSpacingJitterPct', 'i32'],
  ['killParticlesWithEmitter', 'i32'],
  ['spareWord', 'i32'],
  ['radialSpeedJitterPct', 'i32'],
  ['aimSpeedJitterPct', 'i32'],
] as const;

const PLACEMENT_TRACKS = [
  ['shapeSizeX', 'float'],
  ['shapeSizeY', 'float'],
  ['shapeSizeZ', 'float'],
  ['hollowPct', 'int'],
  ['emitterAngleX', 'float'],
  ['emitterAngleY', 'float'],
  ['emitterAngleZ', 'float'],
  ['emitterOffsetX', 'float'],
  ['emitterOffsetY', 'float'],
  ['emitterOffsetZ', 'float'],
] as const;

const SCALE_TRACKS = [
  ['emitterScaleX', 'float'],
  ['emitterScaleY', 'float'],
  ['emitterScaleZ', 'float'],
] as const;

const LAUNCH_TRACKS = [
  ['burstSize', 'float'],
  ['radialSpeed', 'float'],
  ['aimSpeed', 'float'],
  ['spreadDegrees', 'float'],
] as const;

const LOOK_BLOCK = [
  ['quadKind', 'i32'],
  ['inheritMask', 'i32'],
  ['lifeFrames', 'i32'],
  ['lifeJitterPct', 'i32'],
  ['sizeJitterPct', 'i32'],
  ['lockAspect', 'i32'],
  ['startTiltX', 'f32'],
  ['startTiltJitterXPct', 'i32'],
  ['startTiltY', 'f32'],
  ['startTiltJitterYPct', 'i32'],
  ['startTiltZ', 'f32'],
  ['startTiltJitterZPct', 'i32'],
  ['spinJitterXPct', 'i32'],
  ['spinJitterYPct', 'i32'],
  ['spinJitterZPct', 'i32'],
  ['growJitterPct', 'i32'],
  ['blendMode', 'i32'],
  ['anchorColumn', 'i32'],
  ['anchorRow', 'i32'],
  ['uvQuarterTurns', 'i32'],
  ['mirrorU', 'u16'],
  ['mirrorV', 'u16'],
] as const;

const LOOK_TRACKS = [
  ['red', 'int'],
  ['green', 'int'],
  ['blue', 'int'],
  ['opacity', 'int'],
  ['width', 'float'],
  ['height', 'float'],
  ['spinX', 'float'],
  ['spinY', 'float'],
  ['spinZ', 'float'],
  ['growX', 'float'],
  ['growY', 'float'],
] as const;

/** A track holding one value for ever, for fields a version does not store. */
const constant = (value: number): BeffTrack<number> => ({
  loop: false,
  keys: [{ frame: 0, value }],
});

function readSettings(c: Cursor): BeffEmitterSettings {
  const f = readFields(c, SETTINGS_BLOCK);
  return {
    ...f,
    faceCamera: f.faceCamera !== 0,
    killParticlesWithEmitter: f.killParticlesWithEmitter !== 0,
  };
}

function readEmitterTracks(c: Cursor, version: 8 | 9): BeffEmitterTracks {
  const placement = readTracks(c, PLACEMENT_TRACKS);
  const scale =
    version === 9
      ? readTracks(c, SCALE_TRACKS)
      : { emitterScaleX: constant(1), emitterScaleY: constant(1), emitterScaleZ: constant(1) };
  const launch = readTracks(c, LAUNCH_TRACKS);
  return { ...placement, ...scale, ...launch, aimDirection: readTrack(c, 'vec3') };
}

function readLook(c: Cursor): BeffParticleLook {
  const f = readFields(c, LOOK_BLOCK);
  const textureName = c.text();
  return {
    quadKind: f.quadKind,
    inheritMask: f.inheritMask,
    lifeFrames: f.lifeFrames,
    lifeJitterPct: f.lifeJitterPct,
    sizeJitterPct: f.sizeJitterPct,
    lockAspect: f.lockAspect !== 0,
    startTilt: [f.startTiltX, f.startTiltY, f.startTiltZ],
    startTiltJitterPct: [f.startTiltJitterXPct, f.startTiltJitterYPct, f.startTiltJitterZPct],
    spinJitterPct: [f.spinJitterXPct, f.spinJitterYPct, f.spinJitterZPct],
    growJitterPct: f.growJitterPct,
    blendMode: f.blendMode,
    anchorColumn: f.anchorColumn,
    anchorRow: f.anchorRow,
    uvQuarterTurns: f.uvQuarterTurns,
    mirrorU: f.mirrorU !== 0,
    mirrorV: f.mirrorV !== 0,
    textureName,
    ...readTracks(c, LOOK_TRACKS),
  };
}

/** Payload readers by affectorKind. An unknown kind has no knowable length. */
const AFFECTOR_READERS: Record<number, (c: Cursor) => BeffAffector> = {
  [AffectorKind.pull]: c => ({
    kind: 'pull',
    strength: readTrack(c, 'float'),
    direction: readTrack(c, 'vec3'),
  }),
  [AffectorKind.speedScale]: c => ({ kind: 'speedScale', factor: readTrack(c, 'float') }),
  [AffectorKind.wander]: c => ({
    kind: 'wander',
    amplitude: c.vec3(),
    changeEveryFrames: c.scalar('f32'),
  }),
  [AffectorKind.swirl]: c => ({
    kind: 'swirl',
    strength: readTrack(c, 'float'),
    axis: readTrack(c, 'vec3'),
    swirlMode: c.scalar('i32') === 1 ? 1 : 0,
  }),
};

function readAffector(c: Cursor): BeffAffector {
  c.scalar('i32'); // serial: position in the list, implied by order
  const kind = c.scalar('i32');
  const read = AFFECTOR_READERS[kind];
  if (!read) c.fail(`unknown affector kind ${kind}`);
  return read(c);
}

function readEmitter(c: Cursor, version: 8 | 9, depth: number): BeffEmitter {
  if (depth > LIMITS.depth) c.fail('emitters nest too deeply');
  const attachPoint = c.text();
  const childCount = c.count('child emitter count', LIMITS.children);
  const settings = readSettings(c);
  const tracks = readEmitterTracks(c, version);
  const look = readLook(c);
  const affectors: BeffAffector[] = [];
  const affectorCount = c.count('affector count', LIMITS.affectors);
  for (let i = 0; i < affectorCount; i++) affectors.push(readAffector(c));
  const children: BeffEmitter[] = [];
  for (let i = 0; i < childCount; i++) children.push(readEmitter(c, version, depth + 1));
  return { attachPoint, settings, tracks, look, affectors, children };
}

function readNode(c: Cursor, version: 8 | 9): BeffNode {
  const kind = c.scalar('i32');
  if (kind === 0) return { kind: 'emitter', emitter: readEmitter(c, version, 0) };
  if (kind !== 1) c.fail(`unknown node kind ${kind}`);
  const meshPath = c.text();
  const meshRepeats = c.scalar('i32') !== 0;
  const meshOpacity = readTrack(c, 'int');
  const carrier = version === 9 ? readEmitter(c, version, 0) : null;
  return { kind: 'mesh', meshPath, meshRepeats, meshOpacity, carrier };
}

/**
 * Decodes one `.beff`. Throws when the signature or version is not one this
 * reader knows, when a count is out of range, or when the file does not end
 * exactly where its last field does.
 */
export function readBeff(bytes: Uint8Array, label = 'beff'): BeffFile {
  const c = new Cursor(bytes, label);
  const signature = c.u32();
  if (signature !== BEFF_SIGNATURE) c.fail(`not a .beff (signature 0x${signature.toString(16)})`);
  const stored = c.scalar('i32');
  if (stored !== 8 && stored !== 9) c.fail(`unsupported .beff version ${stored}`);
  const version: 8 | 9 = stored === 8 ? 8 : 9;
  const startDelayLow = c.scalar('i32');
  const startDelayHigh = c.scalar('i32');
  const nodeCount = c.count('node count', LIMITS.nodes);
  const nodes: BeffNode[] = [];
  for (let i = 0; i < nodeCount; i++) nodes.push(readNode(c, version));
  const left = bytes.byteLength - c.pos;
  if (left !== 0) c.fail(`${left} bytes left over after the last node`);
  return { version, startDelayLow, startDelayHigh, nodes };
}
