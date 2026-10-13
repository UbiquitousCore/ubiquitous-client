/**
 * `.bdae` models (`client/docs/formats/bdae.md`): records linked by absolute
 * offsets. Lazy: each accessor decodes on first use; unreadable records are
 * skipped and noted in `warnings`.
 */

import { LeView } from './leView';

export class BdaeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BdaeError';
  }
}

// — record sizes and model-info slots ---------------------------------------

const HEADER_SIZE = 60;
const ENDIAN_MARK = 0xfffe;

/** Where each list starts, as an offset from model info. */
const INFO = {
  versionText: 0,
  animationRecords: 36,
  animationStore: 48,
  textures: 76,
  materials: 92,
  geometries: 100,
  controllers: 108,
  nodeTrees: 148,
} as const;

const SIZE = {
  texture: 20,
  material: 36,
  parameter: 24,
  geometry: 16,
  part: 56,
  controller: 12,
  nodeTree: 16,
  node: 80,
  instance: 8,
  animationRecord: 32,
  sampler: 28,
  channel: 16,
} as const;

const PARAM_SAMPLER_2D = 11;

const GEOMETRY_MESH = 0;
const CONTROLLER_SKIN = 0;
const CONTROLLER_MORPH = 1;

const INSTANCE_CONTROLLER = 2;
const INSTANCE_GEOMETRY = 3;

const KEYS_U8 = 1;
const KEYS_U16 = 3;
const KEYS_MS = 4;
const FRAMES_PER_SECOND = 30;

const CHANNEL_MORPH_WEIGHT = 14;

/** Slot-map roles a part assigns to vertex attributes. */
const SLOT = { position: 0, normal: 1, colour: 2, uv0: 4 } as const;
const NO_ATTRIBUTE = 0xff;

const ELEMENT_F32 = 6;
const ELEMENT_U8 = 1;

const TRANSPARENCY_SAMPLER = 'transparent-sampler';
const MORPHER_SUFFIX = '-morpher';

// — public shapes --------------------------------------------------------------

export interface BdaeHeader {
  signature: string;
  version: number;
  headerSize: number;
  fileSize: number;
  stringTableOffset: number;
  modelInfoOffset: number;
  modelDataOffset: number;
}

export interface BdaeTexture {
  /** The texture's id. */
  map: string;
  /** Its display name. */
  mapFriendly: string;
  /** Pack path of the image. */
  file: string;
}

export interface BdaeMaterial {
  /** The id geometry parts name. */
  name: string;
  nameFriendly: string;
  /** The shader library the effect lives in, or '' when it is in this file. */
  file: string;
  /** `#` and the effect id. */
  shader: string;
  textureIndex: number | null;
  texture: string | null;
  /** The material has a transparency sampler. */
  transparent: boolean;
}

export interface BdaeMaterialParam {
  name: string;
  type: number;
  /** Offset of the value. */
  raw: number;
  /** The four floats at the value, or null when they are not in the file. */
  floats: number[] | null;
}

/** Three rows of rotation-and-scale, then the translation, for column vectors. */
export type Affine = number[];

export interface ChainLink {
  /** The node id or name that this file's channels use for it. */
  key: string;
  local: Affine;
  animated: boolean;
}

export interface BdaeGroup {
  material: string;
  texture: string | null;
  /** The part names a material the file does not define. */
  noMaterial: boolean;
  start: number;
  count: number;
}

export interface BdaeMorphTarget {
  name: string;
  positions: Float32Array;
  normals: Float32Array | null;
  weight: number;
}

export interface BdaeMesh {
  name: string;
  nameFriendly: string;
  vertexCount: number;
  boundingBox: { min: number[]; max: number[] };
  positions: Float32Array | null;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  colors: Uint8Array | null;
  indices: Uint16Array | null;
  groups: BdaeGroup[];
  chain?: ChainLink[];
  morph?: { controller: string; targets: BdaeMorphTarget[] };
}

export interface BdaeNode {
  id: string;
  name: string;
  sid: string;
  translation: number[];
  /** As stored: the conjugate of the node's rotation. */
  rotation: number[];
  scale: number[];
  visible: boolean;
  instances: Array<{ type: number; url: string }>;
  children: BdaeNode[];
}

export interface BdaePlacement {
  world: Affine;
  chain?: ChainLink[];
}

export interface BdaeMorpher {
  name: string;
  source: string;
  targets: string[];
  indices: number[];
  weights: number[];
}

export interface BdaeSkin {
  name: string;
  /** `#` and the id of the geometry skinned. */
  source: string;
  jointNames: string[];
  /** One 16-number inverse bind matrix per joint. */
  bindPoses: number[][];
  bindShape: number[];
  maxInfluence: number;
  vertexCount: number;
  weights: Array<{ indices: number[]; weights: number[] }>;
}

export interface BdaeCurveSource {
  type: number;
  components: number;
  /** Which of the file's data sources holds these values. */
  sourceIndex: number;
  values: number[];
}

export interface BdaeSampler {
  interpolation: number;
  input: BdaeCurveSource;
  output: BdaeCurveSource;
}

export interface BdaeChannel {
  target: string;
  type: number;
  /** The morph target a weight channel drives, else null. */
  member: number | null;
}

export interface BdaeClip {
  id: string;
  samplers: BdaeSampler[];
  channels: BdaeChannel[];
}

// — matrix helpers ---------------------------------------------------------------

/**
 * Transforms are 12 numbers: three rows of rotation-and-scale, then the
 * translation, acting on column vectors: p'[i] = Σj m[3i + j] · p[j] + m[9 + i].
 */
const IDENTITY: Affine = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

/** `inner` applied first, then `outer`. */
function compose(outer: Affine, inner: Affine): Affine {
  const out = new Array<number>(12);
  for (let i = 0; i < 3; i++) {
    const o0 = outer[i * 3],
      o1 = outer[i * 3 + 1],
      o2 = outer[i * 3 + 2];
    for (let j = 0; j < 3; j++)
      out[i * 3 + j] = o0 * inner[j] + o1 * inner[3 + j] + o2 * inner[6 + j];
    out[9 + i] = o0 * inner[9] + o1 * inner[10] + o2 * inner[11] + outer[9 + i];
  }
  return out;
}

/** A node's own transform: scale, then rotate by the conjugate of the stored quaternion, then translate. */
function nodeLocal(t: number[], q: number[], s: number[]): Affine {
  const x = -q[0],
    y = -q[1],
    z = -q[2],
    w = q[3];
  const r = [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
  return [
    r[0] * s[0],
    r[1] * s[1],
    r[2] * s[2],
    r[3] * s[0],
    r[4] * s[1],
    r[5] * s[2],
    r[6] * s[0],
    r[7] * s[1],
    r[8] * s[2],
    t[0],
    t[1],
    t[2],
  ];
}

/** A file matrix (row vector times matrix, translation in 12–14) as a transform. */
function fromMat4(m: number[]): Affine {
  return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10], m[12], m[13], m[14]];
}

function isIdentity(m: Affine): boolean {
  return m.every((v, i) => v === IDENTITY[i]);
}

/** Positions through `m`, or directions through its rotation-and-scale alone. */
function bake(values: Float32Array, m: Affine, direction: boolean): Float32Array {
  const out = new Float32Array(values.length);
  const [tx, ty, tz] = direction ? [0, 0, 0] : [m[9], m[10], m[11]];
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i],
      y = values[i + 1],
      z = values[i + 2];
    out[i] = m[0] * x + m[1] * y + m[2] * z + tx;
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z + ty;
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z + tz;
  }
  return out;
}

function boundsOf(lists: Float32Array[]): { min: number[]; max: number[] } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const p of lists) {
    for (let i = 0; i < p.length; i += 3) {
      any = true;
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  }
  return any ? { min, max } : null;
}

const withoutHash = (url: string): string => (url.startsWith('#') ? url.slice(1) : url);

/** Lowercased, without a `-node` or `-mesh` ending: how a loose mesh finds its node. */
const looseKey = (name: string): string => name.toLowerCase().replace(/-(node|mesh)$/, '');

// — records, as read -----------------------------------------------------------

interface VertexFormat {
  stride: number;
  offsets: number[];
  elementTypes: number[];
  components: number[];
  /** Offset of the first vertex, past the block tag. */
  data: number;
}

interface PartRecord {
  material: string;
  slots: number[];
  indexCount: number;
  /** Offset of the first index, past the block tag. */
  indices: number;
}

interface GeometryRecord {
  id: string;
  name: string;
  vertexCount: number;
  format: VertexFormat;
  parts: PartRecord[];
  boundsMin: number[];
  boundsMax: number[];
}

interface NodeRecord {
  id: string;
  name: string;
  sid: string;
  translation: number[];
  rotation: number[];
  scale: number[];
  visible: boolean;
  instances: Array<{ type: number; url: string }>;
  children: NodeRecord[];
}

type NodePath = Array<{ node: NodeRecord; local: Affine }>;

interface Instancing {
  geometry: string;
  world: Affine;
  path: NodePath;
}

interface ControllerRecord {
  kind: number;
  id: string;
  data: number;
}

/** Vertex data for one geometry, in its own space. */
interface RawVertices {
  positions: Float32Array | null;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  colors: Uint8Array | null;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// — the reader -------------------------------------------------------------------

export class Bdae {
  readonly header: BdaeHeader;
  readonly warnings: string[] = [];

  private readonly view: LeView;
  private readonly info: number;
  private readonly cache = new Map<string, unknown>();

  constructor(readonly bytes: Uint8Array) {
    if (bytes.byteLength < HEADER_SIZE)
      throw new BdaeError(`model file is ${bytes.byteLength} bytes, under a header`);
    this.view = new LeView(bytes);
    const v = this.view;
    if (v.tag(0) !== 'BRES') throw new BdaeError('not a model file: wrong signature');
    if (v.u16(4) !== ENDIAN_MARK) throw new BdaeError('model file is not little-endian');
    const headerSize = v.u32(8);
    if (headerSize !== HEADER_SIZE) throw new BdaeError(`unexpected header size ${headerSize}`);
    this.info = v.u32(32);
    this.header = {
      signature: 'BRES',
      version: v.u16(6),
      headerSize,
      fileSize: v.u32(12),
      stringTableOffset: v.u32(28),
      modelInfoOffset: this.info,
      modelDataOffset: v.u32(40),
    };
  }

  // — primitives ----------------------------------------------------------------

  /** The text a `str` field points at; '' for a null pointer. */
  private str(at: number): string {
    const ptr = this.view.u32(at);
    return ptr === 0 ? '' : this.view.text(ptr);
  }

  /** A count-then-pointer pair: the offset of each of `count` records. */
  private list(at: number, size: number): number[] {
    const count = this.view.u32(at);
    if (count === 0) return [];
    const ptr = this.view.u32(at + 4);
    if (!this.view.fits(ptr, count * size))
      throw new RangeError(`list of ${count} at ${ptr} leaves the file`);
    return Array.from({ length: count }, (_, i) => ptr + i * size);
  }

  private u32List(at: number): number[] {
    return this.list(at, 4).map(p => this.view.u32(p));
  }

  private strList(at: number): string[] {
    return this.list(at, 4).map(p => this.str(p));
  }

  private infoList(slot: number, size: number): number[] {
    return this.list(this.info + slot, size);
  }

  /**
   * `once`, handed out as the caller's own copy. For results that hold typed
   * arrays: a caller may move them to another thread, which empties the moved
   * arrays, and the cached copy must survive that.
   */
  private owned<T>(key: string, fallback: () => T, decode: () => T): T {
    return structuredClone(this.once(key, fallback, decode));
  }

  /** Decode once and remember; a failure is noted and yields `fallback`. */
  private once<T>(key: string, fallback: () => T, decode: () => T): T {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    let value: T;
    try {
      value = decode();
    } catch (err) {
      this.warnings.push(`${key}: ${message(err)}`);
      value = fallback();
    }
    this.cache.set(key, value);
    return value;
  }

  /** Reads each record in turn, skipping and noting the ones that fail. */
  private each<T>(what: string, offsets: number[], read: (at: number, i: number) => T | null): T[] {
    const out: T[] = [];
    offsets.forEach((at, i) => {
      try {
        const value = read(at, i);
        if (value !== null) out.push(value);
      } catch (err) {
        this.warnings.push(`${what} ${i}: ${message(err)}`);
      }
    });
    return out;
  }

  versionString(): string {
    return this.once(
      'version',
      () => '',
      () => this.str(this.info + INFO.versionText),
    );
  }

  // — textures and materials -----------------------------------------------------

  textures(): BdaeTexture[] {
    return this.once(
      'textures',
      () => [],
      () =>
        this.each('texture', this.infoList(INFO.textures, SIZE.texture), at => ({
          map: this.str(at),
          mapFriendly: this.str(at + 4),
          file: this.str(at + 8),
        })),
    );
  }

  private parameterOffsets(material: number): number[] {
    return this.list(material + 16, SIZE.parameter);
  }

  private materialOffsets(): number[] {
    return this.once(
      'material list',
      () => [],
      () => this.infoList(INFO.materials, SIZE.material),
    );
  }

  materials(): BdaeMaterial[] {
    return this.once(
      'materials',
      () => [],
      () => {
        const textures = this.textures();
        return this.each('material', this.materialOffsets(), at => {
          let textureIndex: number | null = null;
          let sampled = false;
          let transparent = false;
          for (const p of this.parameterOffsets(at)) {
            if (this.view.u32(p + 8) !== PARAM_SAMPLER_2D) continue;
            if (this.str(p) === TRANSPARENCY_SAMPLER) transparent = true;
            if (sampled) continue;
            sampled = true;
            const surface = this.view.u32(this.view.u32(p + 20));
            const index = this.view.i32(surface);
            textureIndex = index >= 0 ? index : null;
          }
          return {
            name: this.str(at),
            nameFriendly: this.str(at + 4),
            file: this.str(at + 8),
            shader: this.str(at + 12),
            textureIndex,
            texture: textureIndex !== null ? (textures[textureIndex]?.file ?? null) : null,
            transparent,
          };
        });
      },
    );
  }

  materialsByName(): Map<string, BdaeMaterial> {
    return this.once(
      'materials by name',
      () => new Map(),
      () => new Map(this.materials().map(m => [m.name, m])),
    );
  }

  materialParams(index: number): BdaeMaterialParam[] {
    const at = this.materialOffsets()[index];
    if (at === undefined) return [];
    try {
      return this.parameterOffsets(at).map(p => {
        const raw = this.view.u32(p + 20);
        return {
          name: this.str(p),
          type: this.view.u32(p + 8),
          raw,
          floats: this.view.fits(raw, 16) ? this.view.floats(raw, 4) : null,
        };
      });
    } catch {
      return [];
    }
  }

  // — node trees ---------------------------------------------------------------------

  private nodes(): NodeRecord[] {
    return this.once(
      'nodes',
      () => [],
      () => {
        const v = this.view;
        const readNode = (at: number, depth: number): NodeRecord => {
          if (depth > 64) throw new RangeError('node tree nests too deep');
          return {
            id: this.str(at),
            name: this.str(at + 4),
            sid: this.str(at + 8),
            translation: v.floats(at + 12, 3),
            rotation: v.floats(at + 24, 4),
            scale: v.floats(at + 40, 3),
            visible: v.u32(at + 52) !== 0,
            instances: this.list(at + 64, SIZE.instance).map(i => ({
              type: v.u32(i),
              url: withoutHash(this.str(v.u32(i + 4) + 4)),
            })),
            children: this.each('node', this.list(at + 56, SIZE.node), c => readNode(c, depth + 1)),
          };
        };
        const roots: NodeRecord[] = [];
        for (const tree of this.infoList(INFO.nodeTrees, SIZE.nodeTree)) {
          roots.push(...this.each('node', this.list(tree + 8, SIZE.node), at => readNode(at, 0)));
        }
        return roots;
      },
    );
  }

  nodeHierarchy(): BdaeNode[] {
    const copy = (n: NodeRecord): BdaeNode => ({
      id: n.id,
      name: n.name,
      sid: n.sid,
      translation: n.translation.slice(),
      rotation: n.rotation.slice(),
      scale: n.scale.slice(),
      visible: n.visible,
      instances: n.instances.map(i => ({ ...i })),
      children: n.children.map(copy),
    });
    return this.nodes().map(copy);
  }

  /** Visits each node with its model-space transform and the path down to it, root first. */
  private walk(visit: (node: NodeRecord, world: Affine, path: NodePath) => void): void {
    const down = (node: NodeRecord, parent: Affine, above: NodePath): void => {
      const local = nodeLocal(node.translation, node.rotation, node.scale);
      const world = compose(parent, local);
      const path = [...above, { node, local }];
      visit(node, world, path);
      for (const child of node.children) down(child, world, path);
    };
    for (const root of this.nodes()) down(root, IDENTITY, []);
  }

  attachPoints(): Map<string, Affine> {
    return this.once(
      'attach points',
      () => new Map(),
      () => {
        const out = new Map<string, Affine>();
        this.walk((node, world) => {
          for (const key of [node.id, node.name]) if (key && !out.has(key)) out.set(key, world);
        });
        return out;
      },
    );
  }

  animatedNodeKeys(): Set<string> {
    return this.once(
      'animated keys',
      () => new Set(),
      () => new Set(this.animations().flatMap(clip => clip.channels.map(c => c.target))),
    );
  }

  /** Every node that places a geometry, directly or through a morph controller. */
  private instancings(): Instancing[] {
    return this.once(
      'instancings',
      () => [],
      () => {
        const out: Instancing[] = [];
        this.walk((node, world, path) => {
          for (const inst of node.instances) {
            let geometry: string | null = null;
            if (inst.type === INSTANCE_GEOMETRY) geometry = inst.url;
            else if (inst.type === INSTANCE_CONTROLLER && inst.url.endsWith(MORPHER_SUFFIX)) {
              geometry = inst.url.slice(0, -MORPHER_SUFFIX.length);
            }
            if (geometry) out.push({ geometry, world, path });
          }
        });
        return out;
      },
    );
  }

  private placementOf(inst: Instancing): BdaePlacement {
    const animated = this.animatedNodeKeys();
    const moves = (n: NodeRecord): boolean =>
      animated.has(n.id) || (n.name !== '' && animated.has(n.name));
    if (!inst.path.some(p => moves(p.node))) return { world: inst.world };
    return {
      world: inst.world,
      chain: inst.path.map(({ node, local }) => ({
        key: animated.has(node.id) || !animated.has(node.name) ? node.id : node.name,
        local,
        animated: moves(node),
      })),
    };
  }

  placementSplits(): Map<string, BdaePlacement[]> {
    return this.once(
      'placement splits',
      () => new Map(),
      () => {
        const out = new Map<string, BdaePlacement[]>();
        for (const inst of this.instancings()) {
          const list = out.get(inst.geometry) ?? [];
          list.push(this.placementOf(inst));
          out.set(inst.geometry, list);
        }
        return out;
      },
    );
  }

  placements(): Map<string, Affine[]> {
    return new Map([...this.placementSplits()].map(([id, list]) => [id, list.map(p => p.world)]));
  }

  // — controllers ---------------------------------------------------------------------

  private controllers(kind: number): ControllerRecord[] {
    const all = this.once(
      'controllers',
      () => [] as ControllerRecord[],
      () =>
        this.each('controller', this.infoList(INFO.controllers, SIZE.controller), at => ({
          kind: this.view.u32(at),
          id: this.str(at + 4),
          data: this.view.u32(at + 8),
        })),
    );
    return all.filter(c => c.kind === kind);
  }

  morphers(): BdaeMorpher[] {
    return this.owned(
      'morphs',
      () => [],
      () => {
        const morphs = this.controllers(CONTROLLER_MORPH);
        return this.each(
          'morph',
          morphs.map(c => c.data),
          (at, i) => ({
            name: morphs[i].id,
            source: withoutHash(this.str(at)),
            targets: this.strList(at + 8),
            indices: this.u32List(at + 16),
            weights: this.list(at + 24, 4).map(p => this.view.f32(p)),
          }),
        );
      },
    );
  }

  allSkins(): Record<string, BdaeSkin> {
    return this.owned(
      'skins',
      () => ({}),
      () => {
        const out: Record<string, BdaeSkin> = {};
        const skins = this.controllers(CONTROLLER_SKIN);
        this.each(
          'skin',
          skins.map(c => c.data),
          (at, i) => {
            out[skins[i].id] = this.readSkin(skins[i].id, at);
            return null;
          },
        );
        return out;
      },
    );
  }

  private readSkin(id: string, at: number): BdaeSkin {
    const v = this.view;
    const jointNames = this.strList(at + 116);
    const binds = v.u32(at + 4);
    const bindPoses = jointNames.map((_, j) => v.floats(binds + j * 64, 16));
    const influences = v.u32(at + 152);
    const vertexCount = Math.floor(v.u32(at + 124) / (1 + influences));
    const block = v.u32(at + 128) + 4;
    const record = 4 + 4 * influences;
    const weights: BdaeSkin['weights'] = [];
    for (let i = 0; i < vertexCount; i++) {
      const r = block + i * record;
      const w = [0, 0, 0, 0];
      for (let k = 0; k < Math.min(influences, 4); k++) w[k] = v.f32(r + 4 + k * 4);
      weights.push({ indices: [v.u8(r), v.u8(r + 1), v.u8(r + 2), v.u8(r + 3)], weights: w });
    }
    return {
      name: id,
      source: this.str(at + 112),
      jointNames,
      bindPoses,
      bindShape: v.floats(at + 16, 16),
      maxInfluence: influences,
      vertexCount,
      weights,
    };
  }

  skinBinds(): Map<string, number[]> {
    return this.once(
      'skin binds',
      () => new Map(),
      () => {
        const out = new Map<string, number[]>();
        for (const skin of Object.values(this.allSkins()))
          out.set(withoutHash(skin.source), skin.bindShape);
        return out;
      },
    );
  }

  // — geometry --------------------------------------------------------------------------

  private geometries(): GeometryRecord[] {
    return this.once(
      'geometries',
      () => [],
      () =>
        this.each('geometry', this.infoList(INFO.geometries, SIZE.geometry), at => {
          const v = this.view;
          if (v.u32(at + 8) !== GEOMETRY_MESH) return null;
          const mesh = v.u32(at + 12);
          const fmt = v.u32(mesh + 8);
          return {
            id: this.str(at),
            name: this.str(at + 4),
            vertexCount: v.u32(mesh + 4),
            format: {
              stride: v.u32(fmt),
              offsets: this.u32List(fmt + 4),
              elementTypes: this.u32List(fmt + 12),
              components: this.u32List(fmt + 20),
              data: v.u32(fmt + 36) + 4,
            },
            parts: this.list(mesh + 12, SIZE.part).map(p => ({
              material: this.str(p + 4),
              slots: Array.from({ length: 16 }, (_, s) => v.u8(p + 12 + s)),
              indexCount: v.u32(p + 40),
              indices: v.u32(p + 44) + 4,
            })),
            boundsMin: v.floats(mesh + 20, 3),
            boundsMax: v.floats(mesh + 32, 3),
          };
        }),
    );
  }

  /** `want` float components of one attribute for every vertex. */
  private attribute(g: GeometryRecord, attr: number, want: number): Float32Array | null {
    const f = g.format;
    if (attr === NO_ATTRIBUTE || attr >= f.offsets.length) return null;
    if (f.elementTypes[attr] !== ELEMENT_F32 || f.components[attr] < want) return null;
    const out = new Float32Array(g.vertexCount * want);
    for (let i = 0; i < g.vertexCount; i++) {
      const at = f.data + i * f.stride + f.offsets[attr];
      for (let k = 0; k < want; k++) out[i * want + k] = this.view.f32(at + k * 4);
    }
    return out;
  }

  /** Vertex colours as RGBA bytes. */
  private colours(g: GeometryRecord, attr: number): Uint8Array | null {
    const f = g.format;
    if (attr === NO_ATTRIBUTE || attr >= f.offsets.length) return null;
    const n = Math.min(f.components[attr], 4);
    const bytes = f.elementTypes[attr] === ELEMENT_U8;
    const out = new Uint8Array(g.vertexCount * 4).fill(255);
    for (let i = 0; i < g.vertexCount; i++) {
      const at = f.data + i * f.stride + f.offsets[attr];
      for (let k = 0; k < n; k++) {
        out[i * 4 + k] = bytes
          ? this.view.u8(at + k)
          : Math.round(Math.min(1, Math.max(0, this.view.f32(at + k * 4))) * 255);
      }
    }
    return out;
  }

  private vertices(g: GeometryRecord): RawVertices {
    // Every part of a mesh shares one vertex format, so the first part's slot
    // map names the attributes for all of them.
    const slots = g.parts[0]?.slots ?? [];
    const slot = (s: number): number => slots[s] ?? NO_ATTRIBUTE;
    return {
      positions: this.attribute(g, slot(SLOT.position), 3),
      normals: this.attribute(g, slot(SLOT.normal), 3),
      uvs: this.attribute(g, slot(SLOT.uv0), 2),
      colors: this.colours(g, slot(SLOT.colour)),
    };
  }

  /** The parts' indices, concatenated, and one group per usable part. */
  private triangles(g: GeometryRecord): { indices: Uint16Array; groups: BdaeGroup[] } {
    const materials = this.materialsByName();
    const kept: Array<{ part: PartRecord; values: Uint16Array }> = [];
    for (const part of g.parts) {
      const values = new Uint16Array(part.indexCount);
      let inRange = true;
      for (let i = 0; i < part.indexCount; i++) {
        values[i] = this.view.u16(part.indices + i * 2);
        if (values[i] >= g.vertexCount) inRange = false;
      }
      if (inRange) kept.push({ part, values });
      else this.warnings.push(`geometry ${g.id}: a part indexes past its vertices`);
    }
    const indices = new Uint16Array(kept.reduce((n, k) => n + k.values.length, 0));
    const groups: BdaeGroup[] = [];
    let start = 0;
    for (const { part, values } of kept) {
      indices.set(values, start);
      const material = materials.get(part.material);
      groups.push({
        material: part.material,
        texture: material?.texture ?? null,
        noMaterial: material === undefined,
        start,
        count: values.length,
      });
      start += values.length;
    }
    return { indices, groups };
  }

  /**
   * Where a geometry no node instances goes: its skin's bind shape, then the
   * own transform of the node named like it.
   */
  private looseTransform(g: GeometryRecord): Affine {
    const key = looseKey(g.id);
    let node: Affine | null = null;
    this.walk((n, _world, path) => {
      if (node === null && (looseKey(n.id) === key || looseKey(n.name) === key))
        node = path[path.length - 1].local;
    });
    const bind = this.skinBinds().get(g.id);
    return compose(node ?? IDENTITY, bind ? fromMat4(bind) : IDENTITY);
  }

  meshes(withGeometry = true, maxVertices = 300000): BdaeMesh[] {
    return this.owned(
      `meshes ${withGeometry} ${maxVertices}`,
      () => [],
      () => this.buildMeshes(withGeometry, maxVertices),
    );
  }

  private buildMeshes(withGeometry: boolean, maxVertices: number): BdaeMesh[] {
    const geometries = this.geometries();
    const byId = new Map(geometries.map(g => [g.id, g]));
    const splits = this.placementSplits();
    const morphs = this.morphers();
    // In a file that places a morph controller, a loose geometry is one of its targets.
    const morphPlaced = this.nodesWithInstance(INSTANCE_CONTROLLER, url =>
      url.endsWith(MORPHER_SUFFIX),
    );

    for (const id of splits.keys()) {
      if (!byId.has(id))
        this.warnings.push(`a node places ${id}, which is not a mesh in this file`);
    }

    const out: BdaeMesh[] = [];
    for (const g of geometries) {
      const placed = splits.get(g.id);
      if (!placed && morphPlaced) {
        this.warnings.push(`geometry ${g.id}: placed by no node, so left out as a morph target`);
        continue;
      }
      if (g.vertexCount > maxVertices) {
        this.warnings.push(`geometry ${g.id}: ${g.vertexCount} vertices is over the limit`);
        continue;
      }
      const copies: BdaePlacement[] = placed ?? [{ world: this.looseTransform(g) }];
      const morph = morphs.find(m => m.source === g.id);
      copies.forEach((placement, copy) => {
        const name = copy === 0 ? g.id : `${g.id}#${copy + 1}`;
        out.push(
          withGeometry
            ? this.buildMesh(g, name, placement, morph, byId)
            : {
                name,
                nameFriendly: g.name,
                vertexCount: g.vertexCount,
                boundingBox: { min: g.boundsMin.slice(), max: g.boundsMax.slice() },
                positions: null,
                normals: null,
                uvs: null,
                colors: null,
                indices: null,
                groups: [],
                ...(placement.chain ? { chain: placement.chain } : {}),
              },
        );
      });
    }
    return out;
  }

  private nodesWithInstance(type: number, match: (url: string) => boolean): boolean {
    let found = false;
    this.walk(node => {
      if (node.instances.some(i => i.type === type && match(i.url))) found = true;
    });
    return found;
  }

  private buildMesh(
    g: GeometryRecord,
    name: string,
    placement: BdaePlacement,
    morph: BdaeMorpher | undefined,
    byId: Map<string, GeometryRecord>,
  ): BdaeMesh {
    const raw = this.vertices(g);
    const { indices, groups } = this.triangles(g);
    // A mesh on an animated chain stays in its own space; the chain moves it.
    const m = placement.chain ? IDENTITY : placement.world;
    const moved = !isIdentity(m);
    const place = (p: Float32Array | null, direction: boolean): Float32Array | null =>
      p && moved ? bake(p, m, direction) : p;
    const positions = place(raw.positions, false);
    const normals = place(raw.normals, true);

    let morphOut: BdaeMesh['morph'];
    if (morph) {
      const targets: BdaeMorphTarget[] = [];
      morph.targets.forEach((id, i) => {
        const t = byId.get(id);
        if (!t || t.vertexCount !== g.vertexCount) return;
        const tv = this.vertices(t);
        if (!tv.positions) return;
        targets.push({
          name: id,
          positions: place(tv.positions, false)!,
          normals: place(tv.normals, true),
          weight: morph.weights[i] ?? 0,
        });
      });
      morphOut = { controller: morph.name, targets };
    }

    const box = boundsOf([
      ...(positions ? [positions] : []),
      ...(morphOut?.targets.map(t => t.positions) ?? []),
    ]) ?? { min: g.boundsMin.slice(), max: g.boundsMax.slice() };

    return {
      name,
      nameFriendly: g.name,
      vertexCount: g.vertexCount,
      boundingBox: box,
      positions,
      normals,
      uvs: raw.uvs,
      colors: raw.colors,
      indices,
      groups,
      ...(placement.chain ? { chain: placement.chain } : {}),
      ...(morphOut ? { morph: morphOut } : {}),
    };
  }

  // — animation ----------------------------------------------------------------------------

  /** Where each curve source's data starts, and how many keys it holds. */
  private sources(): Array<{ count: number; at: number }> {
    return this.once(
      'sources',
      () => [],
      () => {
        const v = this.view;
        const store = v.u32(this.info + INFO.animationStore);
        if (store === 0 || v.u32(store) === 0) return [];
        const table = v.u32(v.u32(store + 4) + 20);
        if (table === 0) return [];
        return Array.from({ length: v.u32(table) }, (_, i) => {
          const field = table + 4 + i * 8;
          // The offset counts from its own field, not from the file start.
          return { count: v.u32(field), at: field + 4 + v.i32(field + 4) };
        });
      },
    );
  }

  private keyTimes(encoding: number, source: { count: number; at: number } | undefined): number[] {
    if (!source) return [];
    const v = this.view;
    const out = new Array<number>(source.count);
    for (let i = 0; i < source.count; i++) {
      switch (encoding) {
        case KEYS_U8:
          out[i] = v.u8(source.at + i);
          break;
        case KEYS_U16:
          out[i] = v.u16(source.at + i * 2);
          break;
        // Millisecond keys become frames, so every clip's times share one unit.
        case KEYS_MS:
          out[i] = (v.i32(source.at + i * 4) * FRAMES_PER_SECOND) / 1000;
          break;
        default:
          return [];
      }
    }
    return out;
  }

  animations(): BdaeClip[] {
    return this.owned(
      'animations',
      () => [],
      () => {
        const sources = this.sources();
        const v = this.view;
        return this.each(
          'animation',
          this.infoList(INFO.animationRecords, SIZE.animationRecord),
          at => {
            const samplers = this.list(at + 4, SIZE.sampler).map(s => {
              const keyEncoding = v.u32(s + 4);
              const keySource = v.u32(s + 12);
              const valueComponents = v.u32(s + 20);
              const valueSource = v.u32(s + 24);
              const values = sources[valueSource];
              return {
                interpolation: v.u32(s),
                input: {
                  type: keyEncoding,
                  components: v.u32(s + 8),
                  sourceIndex: keySource,
                  values: this.keyTimes(keyEncoding, sources[keySource]),
                },
                output: {
                  type: v.u32(s + 16),
                  components: valueComponents,
                  sourceIndex: valueSource,
                  values: values ? v.floats(values.at, values.count * valueComponents) : [],
                },
              };
            });
            const channels = this.list(at + 12, SIZE.channel).map(c => {
              const type = v.u32(c + 8);
              return {
                target: this.str(c + 4),
                type,
                member: type === CHANNEL_MORPH_WEIGHT ? v.u32(c + 12) & 0xff : null,
              };
            });
            return { id: this.str(at), samplers, channels };
          },
        );
      },
    );
  }
}

// — character variants ------------------------------------------------------------------

/** `hair_03-mesh` → `['hair', 3]`: the family and its variant number, 0 when none. */
export function meshSlot(name: string): [string, number] {
  const base = name.toLowerCase().replace(/-mesh$/, '');
  const match = /^(.*?)[_-]?(\d+)$/.exec(base);
  if (!match || match[1] === '') return [base, 0];
  return [match[1], Number(match[2])];
}

/** One mesh per family, families in order of first appearance: the `choice`-th variant by number, clamped. */
export function selectVariants<T extends { name: string }>(meshes: T[], choice = 0): T[] {
  const families = new Map<string, Array<{ mesh: T; variant: number }>>();
  for (const mesh of meshes) {
    const [family, variant] = meshSlot(mesh.name);
    const list = families.get(family) ?? [];
    list.push({ mesh, variant });
    families.set(family, list);
  }
  return [...families.values()].map(list => {
    const sorted = [...list].sort((a, b) => a.variant - b.variant);
    return sorted[Math.min(Math.max(choice, 0), sorted.length - 1)].mesh;
  });
}
