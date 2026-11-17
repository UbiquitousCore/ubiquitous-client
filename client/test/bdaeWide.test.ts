/**
 * The model reader against hand-built files with 8-byte pointer slots, the
 * layout of the 4.2.21 build's models. Every offset here is written out, not
 * taken from the reader's layout tables, so a change to those tables that
 * moves a field shows up as a failure.
 */

import { describe, expect, it } from 'vitest';

import { Bdae } from '../src/assets/formats/bdae';
import { WideModelWriter } from './helpers/formatWriters';

// Model-info slots.
const ANIMATIONS = 56;
const STORE = 68;
const TEXTURES = 96;
const MATERIALS = 112;
const GEOMETRIES = 120;
const CONTROLLERS = 128;
const TREES = 168;

const TEXTURE = 40;
const MATERIAL = 56;
const PARAMETER = 32;
const GEOMETRY = 24;
const PART = 80;
const CONTROLLER = 24;
const NODE_TREE = 24;
const NODE = 96;
const ANIMATION = 40;
const SAMPLER = 28;
const CHANNEL = 24;

function textures(w: WideModelWriter): void {
  const t = w.infoList(TEXTURES, 2, TEXTURE);
  w.word(t, w.str('a-image'), w.str('a'), w.str('texture/a.tga'));
  w.word(t + TEXTURE, w.str('b-image'), w.str('b'), w.str('texture/b.tga'));
}

/** Material `name`, whose one sampler names texture `texture`. */
function material(w: WideModelWriter, at: number, name: string, texture: number): void {
  w.word(at, w.str(name), w.str(`${name}-friendly`), 0, w.str(`#${name}-fx`));
  w.word(at + 40, 0xffffffff);
  w.i32(at + 48, -1);
  w.u32(at + 52, 128);
  const p = w.list(at + 32, 1, PARAMETER);
  w.word(p, w.str('diffuse-sampler'), w.str(''));
  w.u32(p + 16, 11, 1);
  const block = w.alloc(16);
  const surface = w.alloc(8);
  w.u32(block, 1);
  w.link(block + 8, surface);
  w.i32(surface, texture);
  w.link(p + 24, block);
  w.link(p + 28, block + 8);
}

/** A three-vertex mesh, positions and texture set 0, in two parts. */
function geometry(w: WideModelWriter, at: number): void {
  w.word(at, w.str('tri-mesh'), w.str('tri'));
  w.u32(at + 16, 0);
  const mesh = w.alloc(48);
  w.link(at + 20, mesh);
  w.u32(mesh, 1, 3);
  const fmt = w.alloc(56);
  w.link(mesh + 8, fmt);
  w.f32(mesh + 20, 0, 0, 0, 1, 1, 0);
  const stride = 20;
  w.u32(fmt, stride);
  [
    [0, 12],
    [6, 6],
    [3, 2],
    [0, 0],
  ].forEach((values, k) => w.u32(w.list(fmt + 4 + k * 8, 2, 4), ...values));
  const vertices = w.block(1, 3 * stride);
  w.word(fmt + 40, vertices);
  [
    [1, 0, 0, 0.5, 0.25],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ].forEach((v, i) => w.f32(vertices + 4 + i * stride, ...v));
  const parts = w.list(mesh + 12, 2, PART);
  ['a', 'b'].forEach((name, i) => {
    const part = parts + i * PART;
    const indices = w.block(1, 8);
    w.u16(indices + 4, 0, 1, 2);
    w.word(part + 8, w.str(name));
    w.u32(part + 16, 1);
    const slots = new Array(16).fill(0xff);
    slots[0] = 0;
    slots[4] = 1;
    w.u8(part + 20, ...slots);
    w.u32(part + 36, 0xffff, 0, 2, 3);
    w.word(part + 56, indices);
  });
}

function node(
  w: WideModelWriter,
  at: number,
  id: string,
  t: number[],
  children: number,
  instance: string | null,
): number {
  w.word(at, w.str(id), w.str(`${id}-name`), w.str(`${id}-sid`));
  w.f32(at + 24, ...t, 0, 0, 0, 1, 1, 1, 1);
  w.u32(at + 64, 1);
  const kids = w.list(at + 68, children, NODE);
  if (instance) {
    const inst = w.list(at + 76, 1, 8);
    const data = w.alloc(40);
    w.u32(inst, 3);
    w.link(inst + 4, data);
    w.word(data + 8, w.str(`#${instance}`));
  }
  return kids;
}

function sample(): Bdae {
  const w = new WideModelWriter();
  textures(w);
  const m = w.infoList(MATERIALS, 2, MATERIAL);
  material(w, m, 'a', 0);
  material(w, m + MATERIAL, 'b', 1);
  geometry(w, w.infoList(GEOMETRIES, 1, GEOMETRY));
  const tree = w.infoList(TREES, 1, NODE_TREE);
  w.word(tree, w.str('scene'), w.str('scene'));
  const roots = w.list(tree + 16, 2, NODE);
  node(w, roots, 'empty', [9, 9, 9], 0, null);
  const kids = node(w, roots + NODE, 'root', [1, 2, 3], 1, null);
  node(w, kids, 'child', [0, 5, 0], 0, 'tri-mesh');
  return new Bdae(w.done());
}

describe('Bdae with 8-byte pointers', () => {
  it('reads the header’s pointer slots as 8 bytes wide', () => {
    const w = new WideModelWriter();
    const bytes = w.done();
    expect(new Bdae(bytes).header).toEqual({
      signature: 'BRES',
      version: 0,
      headerSize: 80,
      fileSize: bytes.length,
      stringTableOffset: 80,
      modelInfoOffset: w.info,
      modelDataOffset: bytes.length,
    });
    expect(new Bdae(bytes).versionString()).toBe('synthetic');
  });

  it('steps through 40-byte textures and 56-byte materials, following the sampler’s links', () => {
    const doc = sample();
    expect(doc.textures().map(t => t.file)).toEqual(['texture/a.tga', 'texture/b.tga']);
    expect(doc.materials()).toEqual([
      {
        name: 'a',
        nameFriendly: 'a-friendly',
        file: '',
        shader: '#a-fx',
        textureIndex: 0,
        texture: 'texture/a.tga',
        transparent: false,
      },
      expect.objectContaining({ name: 'b', textureIndex: 1, texture: 'texture/b.tga' }),
    ]);
  });

  it('reads a mesh through its format, vertex block and 80-byte parts', () => {
    const [mesh] = sample().meshes(true);
    expect(mesh.name).toBe('tri-mesh');
    expect(mesh.vertexCount).toBe(3);
    expect(mesh.groups.map(g => [g.material, g.start, g.count])).toEqual([
      ['a', 0, 3],
      ['b', 3, 3],
    ]);
    expect([...mesh.uvs!.slice(0, 2)]).toEqual([0.5, 0.25]);
    // Placed by `child` under `root`: translations add up.
    expect([...mesh.positions!.slice(0, 3)]).toEqual([2, 7, 3]);
  });

  it('walks 96-byte nodes and their instances', () => {
    const [empty, root] = sample().nodeHierarchy();
    expect(empty).toMatchObject({ id: 'empty', translation: [9, 9, 9], children: [] });
    expect(root).toMatchObject({ id: 'root', name: 'root-name', sid: 'root-sid', visible: true });
    expect(root.children[0]).toMatchObject({
      id: 'child',
      translation: [0, 5, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      instances: [{ type: 3, url: 'tri-mesh' }],
    });
  });

  it('reads a skin and a morph through 24-byte controllers', () => {
    const w = new WideModelWriter();
    const c = w.infoList(CONTROLLERS, 2, CONTROLLER);
    w.u32(c, 0);
    w.word(c + 8, w.str('tri-mesh-skin'));
    const skin = w.alloc(184);
    w.link(c + 16, skin);
    const binds = w.alloc(64);
    w.f32(binds, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1);
    w.u32(skin, 16);
    w.link(skin + 4, binds);
    w.f32(skin + 16, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1);
    w.word(skin + 112, w.str('#tri-mesh'));
    w.word(w.list(skin + 120, 1, 8), w.str('bone'));
    w.u32(skin + 128, 4);
    const weights = w.block(2, 16);
    w.u8(weights + 4, 0, 0, 0, 0);
    w.f32(weights + 8, 1);
    w.u8(weights + 12, 0, 0, 0, 0);
    w.f32(weights + 16, 0.5);
    w.word(skin + 136, weights);
    w.u32(skin + 176, 1);

    const morph = c + CONTROLLER;
    w.u32(morph, 1);
    w.word(morph + 8, w.str('tri-mesh-morpher'));
    const data = w.alloc(40);
    w.link(morph + 16, data);
    w.word(data, w.str('#tri-mesh'));
    w.word(w.list(data + 12, 2, 8), w.str('smile'), w.str('frown'));
    w.u32(w.list(data + 20, 2, 4), 3, 4);
    w.f32(w.list(data + 28, 2, 4), 0.25, 0.75);
    const doc = new Bdae(w.done());

    expect(doc.allSkins()['tri-mesh-skin']).toMatchObject({
      source: '#tri-mesh',
      jointNames: ['bone'],
      bindPoses: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1]],
      bindShape: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1],
      maxInfluence: 1,
      vertexCount: 2,
      weights: [
        { indices: [0, 0, 0, 0], weights: [1, 0, 0, 0] },
        { indices: [0, 0, 0, 0], weights: [0.5, 0, 0, 0] },
      ],
    });
    expect(doc.morphers()).toEqual([
      {
        name: 'tri-mesh-morpher',
        source: 'tri-mesh',
        targets: ['smile', 'frown'],
        indices: [3, 4],
        weights: [0.25, 0.75],
      },
    ]);
  });

  it('reads 40-byte animation records, with the channel’s target first and its detail 8 bytes wide', () => {
    const w = new WideModelWriter();
    const records = w.infoList(ANIMATIONS, 2, ANIMATION);
    const store = w.alloc(8);
    w.link(w.info + STORE, store);
    const segment = w.alloc(24);
    w.u32(store, 1);
    w.link(store + 4, segment);
    const table = w.alloc(4 + 4 * 8);
    w.u32(segment, 0, 1000, 1);
    w.link(segment + 20, table);
    w.u32(table, 4);
    ['spin', 'smile'].forEach((id, i) => {
      const at = records + i * ANIMATION;
      w.word(at, w.str(id));
      const sampler = w.list(at + 8, 1, SAMPLER);
      w.u32(sampler, 1, 1, 1, i * 2, 6, 1, i * 2 + 1);
      const channel = w.list(at + 16, 1, CHANNEL);
      w.word(channel, w.str(i === 0 ? 'root' : 'tri-mesh-morpher'));
      w.u32(channel + 8, i === 0 ? 3 : 14);
      w.word(channel + 16, i === 0 ? 0xffff : 0xff01);
      w.link(at + 32, w.alloc(12));
      const keys = w.alloc(4);
      const values = w.alloc(8);
      w.u8(keys, 0, 30);
      w.f32(values, 7 + i, 9 + i);
      const field = table + 4 + i * 16;
      w.u32(field, 2);
      w.link(field + 4, keys);
      w.u32(field + 8, 2);
      w.link(field + 12, values);
    });
    const [spin, smile] = new Bdae(w.done()).animations();
    expect(spin.id).toBe('spin');
    expect(spin.channels).toEqual([{ target: 'root', type: 3, member: null }]);
    expect(spin.samplers[0].input.values).toEqual([0, 30]);
    expect(spin.samplers[0].output.values).toEqual([7, 9]);
    expect(smile.channels).toEqual([{ target: 'tri-mesh-morpher', type: 14, member: 1 }]);
    expect(smile.samplers[0].output.values).toEqual([8, 10]);
  });

  it('refuses a pointer slot that does not fit 32 bits, and reads the rest', () => {
    const w = new WideModelWriter();
    textures(w);
    const t = w.info + TEXTURES;
    const first = t + 4 + w.dv.getInt32(t + 4, true);
    w.word(first + 16, 2 ** 32 + 8);
    const doc = new Bdae(w.done());
    expect(doc.textures().map(x => x.file)).toEqual(['texture/b.tga']);
    expect(doc.warnings.join()).toMatch(/does not fit 32 bits/);
  });
});
