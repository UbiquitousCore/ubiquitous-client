/**
 * Where each field of a `.bdae` record sits (`client/docs/formats/bdae.md`,
 * "Pointer widths"). Each record is written once, as its fields in file
 * order; the offsets follow from the file's pointer width.
 */

/** Bytes in a pointer-sized slot: 4 in files with a 60-byte header, 8 with an 80-byte one. */
type PointerWidth = 4 | 8;

/**
 * `u32`: any 4-byte number. `word`: a pointer-sized slot, holding a string or
 * data-block pointer or a number. `link`: a 4-byte link to another record.
 * `list`: a `u32` count, then a link. A number is that many bytes of floats.
 */
type Field = 'u32' | 'word' | 'link' | 'list' | number;

type Spec = Readonly<Record<string, Field>>;

type RecordLayout<S extends Spec> = { readonly [K in keyof S]: number } & {
  readonly size: number;
};

function bytesOf(field: Field, width: PointerWidth): number {
  if (field === 'word') return width;
  if (field === 'list') return 8;
  if (field === 'u32' || field === 'link') return 4;
  return field;
}

function place<S extends Spec>(width: PointerWidth, spec: S): RecordLayout<S> {
  const out: Record<string, number> = {};
  let at = 0;
  let align = 4;
  for (const [name, field] of Object.entries(spec)) {
    const fieldAlign = field === 'word' ? width : 4;
    at = Math.ceil(at / fieldAlign) * fieldAlign;
    out[name] = at;
    at += bytesOf(field, width);
    align = Math.max(align, fieldAlign);
  }
  out.size = Math.ceil(at / align) * align;
  return out as RecordLayout<S>;
}

const HEADER = {
  signature: 'u32',
  marks: 'u32',
  headerSize: 'u32',
  fileSize: 'u32',
  relocationCount: 'u32',
  zero20: 'u32',
  relocationTable: 'word',
  stringTable: 'word',
  modelInfo: 'word',
  modelInfoEnd: 'word',
  dataArea: 'word',
  dataAreaSize: 'u32',
  dataBlockCount: 'u32',
  zero52: 'u32',
  zero56: 'u32',
} as const;

const MODEL_INFO = {
  versionText: 'word',
  zero4: 'word',
  zero8: 'word',
  unknown12: 'u32',
  zero16: 'u32',
  unknown20: 'u32',
  zero24: 'word',
  timeStart: 'u32',
  timeEnd: 'u32',
  animationRecords: 'list',
  zero44: 'u32',
  animationStore: 'link',
  clipRanges: 'list',
  zero60: 8,
  lights: 'list',
  textures: 'list',
  effects: 'list',
  materials: 'list',
  geometries: 'list',
  controllers: 'list',
  zero116: 32,
  nodeTrees: 'list',
  zero156: 24,
  scenes: 'list',
} as const;

const TEXTURE = { id: 'word', name: 'word', path: 'word', zero12: 'word', zero16: 'word' } as const;

const MATERIAL = {
  id: 'word',
  name: 'word',
  effectFile: 'word',
  effectUrl: 'word',
  parameters: 'list',
  localEffect: 'word',
  zero28: 'u32',
  flags32: 'u32',
} as const;

const PARAMETER = {
  name: 'word',
  semantic: 'word',
  valueType: 'u32',
  one: 'u32',
  valueBlock: 'link',
  value: 'link',
} as const;

const GEOMETRY = { id: 'word', name: 'word', kind: 'u32', data: 'link' } as const;

const MESH = {
  one: 'u32',
  vertexCount: 'u32',
  vertexFormat: 'link',
  parts: 'list',
  boundsMin: 12,
  boundsMax: 12,
} as const;

const VERTEX_FORMAT = {
  stride: 'u32',
  byteOffsets: 'list',
  elementTypes: 'list',
  attributeWidths: 'list',
  attributeFlags: 'list',
  vertexBlock: 'word',
  zero40: 'u32',
} as const;

const PART = {
  zero0: 'u32',
  material: 'word',
  triangleCount: 'u32',
  slotMap: 16,
  fixed28: 'u32',
  lowestIndex: 'u32',
  highestIndex: 'u32',
  indexCount: 'u32',
  indexBlock: 'word',
  zero48: 'word',
  zero52: 'word',
} as const;

const CONTROLLER = { kind: 'u32', id: 'word', data: 'link' } as const;

const SKIN = {
  inverseBindFloats: 'u32',
  inverseBinds: 'link',
  jointPoseFloats: 'u32',
  jointPoses: 'link',
  bindShape: 64,
  bindShapePose: 32,
  sourceUrl: 'word',
  joints: 'list',
  weightWords: 'u32',
  weightBlock: 'word',
  jointListCount: 'u32',
  jointListBlock: 'word',
  sphereCount: 'u32',
  jointSpheres: 'link',
  zero148: 'word',
  influences: 'u32',
} as const;

const MORPH = {
  sourceUrl: 'word',
  zero4: 'u32',
  targetIds: 'list',
  targetIndices: 'list',
  restWeights: 'list',
} as const;

const NODE_TREE = { id: 'word', name: 'word', roots: 'list' } as const;

const NODE = {
  id: 'word',
  name: 'word',
  sid: 'word',
  translation: 12,
  rotation: 16,
  scale: 12,
  visible: 'u32',
  children: 'list',
  instances: 'list',
  extra: 'link',
  extra2: 'link',
} as const;

const INSTANCE = { kind: 'u32', data: 'link' } as const;

const INSTANCE_DATA = { zero0: 'u32', url: 'word' } as const;

const ANIMATION_RECORD = {
  id: 'word',
  samplers: 'list',
  channels: 'list',
  zero20: 'word',
  baseValue: 'link',
  zero28: 'u32',
} as const;

const SAMPLER = {
  interpolation: 'u32',
  keyEncoding: 'u32',
  keyComponents: 'u32',
  keySource: 'u32',
  valueType: 'u32',
  valueComponents: 'u32',
  valueSource: 'u32',
} as const;

// The one record whose fields are reordered between widths, not just widened.
const CHANNEL = {
  4: { minusOne: 'u32', target: 'word', kind: 'u32', detail: 'word' },
  8: { target: 'word', kind: 'u32', zero12: 'u32', detail: 'word' },
} as const;

const STORE = { segmentCount: 'u32', segments: 'link' } as const;

const SEGMENT = {
  start: 'u32',
  end: 'u32',
  one: 'u32',
  zero12: 'u32',
  zero16: 'u32',
  sourceTable: 'link',
} as const;

function layout(width: PointerWidth) {
  return {
    width,
    header: place(width, HEADER),
    info: place(width, MODEL_INFO),
    texture: place(width, TEXTURE),
    material: place(width, MATERIAL),
    parameter: place(width, PARAMETER),
    geometry: place(width, GEOMETRY),
    mesh: place(width, MESH),
    vertexFormat: place(width, VERTEX_FORMAT),
    part: place(width, PART),
    controller: place(width, CONTROLLER),
    skin: place(width, SKIN),
    morph: place(width, MORPH),
    nodeTree: place(width, NODE_TREE),
    node: place(width, NODE),
    instance: place(width, INSTANCE),
    instanceData: place(width, INSTANCE_DATA),
    animationRecord: place(width, ANIMATION_RECORD),
    sampler: place(width, SAMPLER),
    channel: place(width, CHANNEL[width]),
    store: place(width, STORE),
    segment: place(width, SEGMENT),
  };
}

export type BdaeLayout = ReturnType<typeof layout>;

const LAYOUTS: readonly BdaeLayout[] = [layout(4), layout(8)];

/** The smallest header any layout has: a file shorter than this is no model. */
export const MIN_HEADER_SIZE = Math.min(...LAYOUTS.map(l => l.header.size));

/** The layout whose header is `headerSize` bytes, or null when none is. */
export function layoutForHeaderSize(headerSize: number): BdaeLayout | null {
  return LAYOUTS.find(l => l.header.size === headerSize) ?? null;
}
