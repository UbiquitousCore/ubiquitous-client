/**
 * The BDAE reader against a hand-built file.
 *
 * The file is laid out as the reader expects: a 60-byte header ("BRES", the
 * little-endian mark 0xFFFE at +4, header size at +8, file size at +12, the
 * string table at +28, model info at +32, data at +40), a string table the
 * records point into by absolute offset, and a model-info block of
 * (count, offset) pairs at fixed positions.
 */

import { describe, expect, it } from 'vitest';

import { Bdae, BdaeError } from '../src/assets/formats/bdae';

class Layout {
  readonly bytes = new Uint8Array(2048);
  readonly dv = new DataView(this.bytes.buffer);
  private stringsEnd = 0;
  private readonly placed = new Map<string, number>();

  constructor(readonly stringsAt: number) {
    this.stringsEnd = stringsAt;
  }
  str(s: string): number {
    const known = this.placed.get(s);
    if (known !== undefined) return known;
    const at = this.stringsEnd;
    this.bytes.set(new TextEncoder().encode(s), at);
    this.stringsEnd += s.length + 1;
    this.placed.set(s, at);
    return at;
  }
  u32(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setUint32(at + i * 4, v, true));
  }
  f32(at: number, ...vs: number[]): void {
    vs.forEach((v, i) => this.dv.setFloat32(at + i * 4, v, true));
  }
}

const STRINGS = 64;
const INFO = 512;
const TEXTURES = 700;
const TREES = 760;
const NODES = 800;
const INSTANCES = 1000;
const INSTANCE_DATA = 1020;

/** One texture, and one tree: a root node with a child that places a mesh. */
function sample(): Uint8Array {
  const l = new Layout(STRINGS);
  l.bytes.set(new TextEncoder().encode('BRES'), 0);
  l.dv.setUint16(4, 0xfffe, true);
  l.u32(8, 60, 1200);
  l.u32(28, STRINGS, INFO);
  l.u32(40, 1100);

  // Model info: textures at +76, node trees at +148.
  l.u32(INFO + 76, 1, TEXTURES);
  l.u32(TEXTURES, l.str('diffuse-image'), l.str('diffuse'), l.str('texture/wall.tga'));
  l.u32(INFO + 148, 1, TREES);
  l.u32(TREES + 8, 1, NODES);

  // Node record, 80 bytes: id, name, sid, then translation at +12, rotation
  // at +24, scale at +40, visibility at +52, children at +56, instances at +64.
  const node = (
    at: number,
    id: string,
    t: number[],
    children: [number, number],
    inst: [number, number],
  ) => {
    l.u32(at, l.str(id), l.str(`${id}-name`), l.str(`${id}-sid`));
    l.f32(at + 12, ...t);
    l.f32(at + 24, 0, 0, 0, 1);
    l.f32(at + 40, 1, 1, 1);
    l.u32(at + 52, 1);
    l.u32(at + 56, ...children);
    l.u32(at + 64, ...inst);
  };
  node(NODES, 'root', [1, 2, 3], [1, NODES + 80], [0, 0]);
  node(NODES + 80, 'child', [0, 5, 0], [0, 0], [1, INSTANCES]);
  // Instance: type 3 is geometry; its data holds the URL at +4.
  l.u32(INSTANCES, 3, INSTANCE_DATA);
  l.u32(INSTANCE_DATA + 4, l.str('#wall-mesh'));
  return l.bytes.subarray(0, 1200);
}

describe('Bdae', () => {
  it('reads the header fields at their offsets', () => {
    const bdae = new Bdae(sample());
    expect(bdae.header).toEqual({
      signature: 'BRES',
      version: 0,
      headerSize: 60,
      fileSize: 1200,
      stringTableOffset: STRINGS,
      modelInfoOffset: INFO,
      modelDataOffset: 1100,
    });
  });

  it('reads texture records as three string pointers', () => {
    expect(new Bdae(sample()).textures()).toEqual([
      { map: 'diffuse-image', mapFriendly: 'diffuse', file: 'texture/wall.tga' },
    ]);
  });

  it('reads the node tree: names, transform, children and instances', () => {
    const [root] = new Bdae(sample()).nodeHierarchy();
    expect(root).toMatchObject({
      id: 'root',
      name: 'root-name',
      sid: 'root-sid',
      translation: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      visible: true,
      instances: [],
    });
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({
      id: 'child',
      translation: [0, 5, 0],
      // The leading '#' of the URL is dropped.
      instances: [{ type: 3, url: 'wall-mesh' }],
    });
  });

  it('places a geometry instance through its parents', () => {
    const [world] = new Bdae(sample()).placements().get('wall-mesh')!;
    // Identity rotations and unit scale: the translations add up.
    expect(world.slice(9, 12)).toEqual([1, 7, 3]);
  });

  it('reads a clip: samplers and channels by record, curves through self-relative offsets', () => {
    const l = new Layout(STRINGS);
    l.bytes.set(new TextEncoder().encode('BRES'), 0);
    l.dv.setUint16(4, 0xfffe, true);
    l.u32(8, 60, 1600);
    l.u32(28, STRINGS, INFO);

    const ANIM = 700;
    const SAMPLERS = 740;
    const CHANNELS = 780;
    const STORE = 820;
    const SEGMENT = 840;
    const DATA = 900;
    const KEYS = 1000;
    const VALUES = 1100;
    // Animation records: a (count, offset) pair at +36. The store is a single
    // pointer at +48, to (segment count, segment offset).
    l.u32(INFO + 36, 1, ANIM);
    l.u32(INFO + 48, STORE);
    // Animation record, 32 bytes: id, samplers (count, offset), channels.
    l.u32(ANIM, l.str('bob'), 1, SAMPLERS, 1, CHANNELS);
    // Sampler record, 28 bytes: interpolation, then encoding, components and
    // source number for the keys and for the values. Encoding 1 is one byte
    // per key, value type 6 is floats.
    l.u32(SAMPLERS, 1, 1, 1, 0, 6, 1, 1);
    // Channel record, 16 bytes: -1, target, kind, and a detail word whose low
    // byte 0xff names no morph target.
    l.dv.setInt32(CHANNELS, -1, true);
    l.u32(CHANNELS + 4, l.str('root'), 3, 0xff);
    l.u32(STORE, 1, SEGMENT);
    // Segment record, 24 bytes: start and end in ms, then the source table
    // pointer at +20.
    l.u32(SEGMENT, 0, 1000, 1, 0, 0, DATA);
    // Source table: a count, then (count, offset) per source, where the
    // offset counts from its own field.
    l.u32(DATA, 2);
    l.u32(DATA + 4, 2);
    l.dv.setInt32(DATA + 8, KEYS - (DATA + 8), true);
    l.u32(DATA + 12, 2);
    l.dv.setInt32(DATA + 16, VALUES - (DATA + 16), true);
    l.bytes.set([0, 30], KEYS);
    l.f32(VALUES, 7, 9);

    const [clip] = new Bdae(l.bytes.subarray(0, 1600)).animations();
    expect(clip.id).toBe('bob');
    expect(clip.channels).toEqual([{ target: 'root', type: 3, member: null }]);
    expect(clip.samplers[0].input.values).toEqual([0, 30]);
    expect(clip.samplers[0].output.values).toEqual([7, 9]);
  });

  it('rejects the wrong signature, byte order or header size', () => {
    const wrongSig = sample().slice();
    wrongSig[0] = 0x58;
    expect(() => new Bdae(wrongSig)).toThrow(BdaeError);
    const bigEndian = sample().slice();
    new DataView(bigEndian.buffer).setUint16(4, 0xfeff, true);
    expect(() => new Bdae(bigEndian)).toThrow(/little-endian/);
    const oddHeader = sample().slice();
    new DataView(oddHeader.buffer).setUint32(8, 64, true);
    expect(() => new Bdae(oddHeader)).toThrow(/header size/);
    expect(() => new Bdae(new Uint8Array(59))).toThrow(BdaeError);
  });
});
