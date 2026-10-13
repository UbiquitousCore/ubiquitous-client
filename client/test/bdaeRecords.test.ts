/**
 * The model reader against hand-built files covering geometry, placement,
 * skins, morphs and animation, laid out as docs/formats/bdae.md describes.
 */

import { describe, expect, it } from 'vitest';

import { Bdae, meshSlot, selectVariants } from '../src/assets/formats/bdae';
import { ModelWriter } from './helpers/formatWriters';

// Model-info slots.
const ANIMATIONS = 36;
const STORE = 48;
const TEXTURES = 76;
const MATERIALS = 92;
const GEOMETRIES = 100;
const CONTROLLERS = 108;
const TREES = 148;

interface Vertex {
  pos: number[];
  nrm?: number[];
  uv?: number[];
  col?: number[];
}
interface Part {
  material: string;
  indices: number[];
}

/**
 * A mesh whose attributes are listed position, normal, colour, texture set 0,
 * with the colour stored last in the vertex.
 */
function geometry(w: ModelWriter, at: number, id: string, vertices: Vertex[], parts: Part[]): void {
  const stride = 36;
  const byteOffsets = [0, 12, 32, 24];
  const types = [6, 6, 1, 6];
  const counts = [3, 3, 4, 2];
  const mesh = w.alloc(44);
  w.u32(at, w.str(id), w.str(`${id}-name`), 0, mesh);
  const fmt = w.alloc(44);
  w.u32(mesh, 1, vertices.length, fmt);
  const partsAt = w.list(mesh + 12, parts.length, 56);
  w.u32(fmt, stride);
  const lists = [byteOffsets, types, counts, [0, 0, 0, 0]];
  lists.forEach((values, k) => {
    const ptr = w.list(fmt + 4 + k * 8, values.length, 4);
    w.u32(ptr, ...values);
  });
  const block = w.block(1, vertices.length * stride);
  w.u32(fmt + 36, block);
  vertices.forEach((v, i) => {
    const base = block + 4 + i * stride;
    w.f32(base, ...v.pos);
    w.f32(base + 12, ...(v.nrm ?? [0, 1, 0]));
    w.f32(base + 24, ...(v.uv ?? [0, 0]));
    w.u8(base + 32, ...(v.col ?? [255, 255, 255, 255]));
  });
  parts.forEach((p, i) => {
    const part = partsAt + i * 56;
    const indexBlock = w.block(1, Math.ceil(p.indices.length / 2) * 4);
    w.u16(indexBlock + 4, ...p.indices);
    w.u32(part, 0, w.str(p.material), p.indices.length / 3);
    const slots = new Array(16).fill(0xff);
    slots[0] = 0;
    slots[1] = 1;
    slots[2] = 2;
    slots[4] = 3;
    w.u8(part + 12, ...slots);
    w.u32(
      part + 28,
      0xffff,
      Math.min(...p.indices),
      Math.max(...p.indices),
      p.indices.length,
      indexBlock,
    );
  });
  w.f32(mesh + 20, -1, -1, -1, 1, 1, 1);
}

interface NodeSpec {
  id: string;
  t?: number[];
  q?: number[];
  s?: number[];
  instances?: Array<{ type: number; url: string }>;
  children?: NodeSpec[];
}

function node(w: ModelWriter, at: number, spec: NodeSpec): void {
  w.u32(at, w.str(spec.id), w.str(spec.id.replace(/-node$/, '')), w.str(''));
  w.f32(at + 12, ...(spec.t ?? [0, 0, 0]), ...(spec.q ?? [0, 0, 0, 1]), ...(spec.s ?? [1, 1, 1]));
  w.u32(at + 52, 1);
  const children = spec.children ?? [];
  const kids = w.list(at + 56, children.length, 80);
  children.forEach((c, i) => node(w, kids + i * 80, c));
  const instances = spec.instances ?? [];
  const inst = w.list(at + 64, instances.length, 8);
  instances.forEach((x, i) => {
    const data = w.alloc(24);
    w.u32(inst + i * 8, x.type, data);
    w.u32(data + 4, w.str(`#${x.url}`));
  });
}

function tree(w: ModelWriter, roots: NodeSpec[]): void {
  const t = w.infoList(TREES, 1, 16);
  w.u32(t, w.str('scene'), w.str('scene'));
  const r = w.list(t + 8, roots.length, 80);
  roots.forEach((spec, i) => node(w, r + i * 80, spec));
}

const QUAD: Vertex[] = [
  { pos: [1, 0, 0], uv: [0, 0], col: [10, 20, 30, 240] },
  { pos: [0, 1, 0], uv: [1, 0] },
  { pos: [0, 0, 1], uv: [0, 1] },
  { pos: [1, 1, 1], uv: [1, 1] },
];

/** One textured material, `wall`, whose first sampler names texture 0. */
function wallMaterial(w: ModelWriter, transparent = false): void {
  const tex = w.infoList(TEXTURES, 1, 20);
  w.u32(tex, w.str('wall-image'), w.str('wall'), w.str('texture/wall.tga'));
  const mat = w.infoList(MATERIALS, 1, 36);
  w.u32(mat, w.str('wall'), w.str('Wall'), 0, w.str('#wall-fx'));
  w.i32(mat + 24, 0, -1);
  w.u32(mat + 32, 128);
  const names = transparent ? ['diffuse-sampler', 'transparent-sampler'] : ['diffuse-sampler'];
  const params = w.list(mat + 16, names.length, 24);
  names.forEach((name, i) => {
    const p = params + i * 24;
    const value = w.alloc(8);
    const surface = w.alloc(8);
    w.u32(value, 1, surface);
    w.i32(surface, i === 0 ? 0 : -1);
    w.u32(p, w.str(name), 0, 11, 1, value, value + 4);
  });
}

describe('Bdae geometry', () => {
  function sample(): Bdae {
    const w = new ModelWriter();
    wallMaterial(w, true);
    const g = w.infoList(GEOMETRIES, 1, 16);
    geometry(w, g, 'wall-mesh', QUAD, [
      { material: 'wall', indices: [0, 1, 2] },
      { material: 'gone', indices: [1, 2, 3] },
      { material: 'wall', indices: [0, 2, 9] },
    ]);
    return new Bdae(w.done());
  }

  it('reads attributes by the slot map, wherever they sit in the vertex', () => {
    const [mesh] = sample().meshes(true);
    expect(mesh.name).toBe('wall-mesh');
    expect(mesh.vertexCount).toBe(4);
    expect([...mesh.positions!.slice(0, 6)]).toEqual([1, 0, 0, 0, 1, 0]);
    expect([...mesh.uvs!.slice(0, 4)]).toEqual([0, 0, 1, 0]);
    expect([...mesh.colors!.slice(0, 4)]).toEqual([10, 20, 30, 240]);
    expect([...mesh.normals!.slice(0, 3)]).toEqual([0, 1, 0]);
  });

  it('concatenates the parts, one group each, and drops a part that indexes past the vertices', () => {
    const [mesh] = sample().meshes(true);
    expect([...mesh.indices!]).toEqual([0, 1, 2, 1, 2, 3]);
    expect(mesh.groups).toEqual([
      { material: 'wall', texture: 'texture/wall.tga', noMaterial: false, start: 0, count: 3 },
      { material: 'gone', texture: null, noMaterial: true, start: 3, count: 3 },
    ]);
  });

  it('names a material texture by its first sampler, and marks a transparency sampler', () => {
    expect(sample().materials()).toEqual([
      {
        name: 'wall',
        nameFriendly: 'Wall',
        file: '',
        shader: '#wall-fx',
        textureIndex: 0,
        texture: 'texture/wall.tga',
        transparent: true,
      },
    ]);
  });

  it('hands each caller its own arrays, so moving one result to another thread leaves the model readable', () => {
    const doc = sample();
    const first = doc.meshes(true);
    structuredClone(first, { transfer: [first[0].positions!.buffer, first[0].uvs!.buffer] });
    const [again] = doc.meshes(true);
    expect([...again.positions!.slice(0, 3)]).toEqual([1, 0, 0]);
    expect([...again.uvs!.slice(0, 4)]).toEqual([0, 0, 1, 0]);
  });

  it('returns names and counts only when no geometry is asked for', () => {
    const [mesh] = sample().meshes(false);
    expect(mesh).toMatchObject({
      name: 'wall-mesh',
      vertexCount: 4,
      positions: null,
      indices: null,
    });
  });
});

describe('Bdae placement', () => {
  // The stored quaternion is the conjugate: stored +90° about y turns by -90°.
  const S = Math.SQRT1_2;

  function placed(animatedTarget?: string): Bdae {
    const w = new ModelWriter();
    wallMaterial(w);
    const g = w.infoList(GEOMETRIES, 1, 16);
    geometry(w, g, 'post-mesh', QUAD, [{ material: 'wall', indices: [0, 1, 2] }]);
    tree(w, [
      {
        id: 'root-node',
        t: [10, 0, 0],
        children: [
          { id: 'a-node', q: [0, S, 0, S], instances: [{ type: 3, url: 'post-mesh' }] },
          { id: 'b-node', t: [0, 5, 0], s: [2, 2, 2], instances: [{ type: 3, url: 'post-mesh' }] },
        ],
      },
    ]);
    if (animatedTarget) oneChannel(w, animatedTarget, 1, [0, 30], 1);
    return new Bdae(w.done());
  }

  it('emits a geometry once per instancing node, each baked with its own path', () => {
    const [a, b] = placed().meshes(true);
    expect([a.name, b.name]).toEqual(['post-mesh', 'post-mesh#2']);
    // (1, 0, 0) turned -90° about y is (0, 0, 1), then moved by the root.
    expect([...a.positions!.slice(0, 3)].map(v => +v.toFixed(5))).toEqual([10, 0, 1]);
    expect([...b.positions!.slice(0, 3)]).toEqual([12, 5, 0]);
    expect(b.boundingBox.min).toEqual([10, 5, 0]);
  });

  it('gives every node a model-space transform to hang things from', () => {
    const points = placed().attachPoints();
    expect(points.get('b-node')!.slice(9)).toEqual([10, 5, 0]);
    expect(points.get('b')!.slice(9)).toEqual([10, 5, 0]);
  });

  it('leaves a mesh unbaked, with its node chain, when this file animates a node on the path', () => {
    const doc = placed('root-node');
    const [a] = doc.meshes(true);
    expect([...a.positions!.slice(0, 3)]).toEqual([1, 0, 0]);
    expect(a.chain!.map(c => [c.key, c.animated])).toEqual([
      ['root-node', true],
      ['a-node', false],
    ]);
    expect(a.chain![0].local.slice(9)).toEqual([10, 0, 0]);
    expect(doc.animatedNodeKeys()).toEqual(new Set(['root-node']));
  });

  it('keys a chain link by name when the channels name it that way', () => {
    const [a] = placed('root').meshes(true);
    expect(a.chain![0]).toMatchObject({ key: 'root', animated: true });
  });
});

describe('Bdae skins', () => {
  function skinned(): Bdae {
    const w = new ModelWriter();
    wallMaterial(w);
    const g = w.infoList(GEOMETRIES, 1, 16);
    geometry(w, g, 'body-mesh', QUAD, [{ material: 'wall', indices: [0, 1, 2] }]);
    tree(w, [{ id: 'hip-node' }]);
    const c = w.infoList(CONTROLLERS, 1, 12);
    const skin = w.alloc(156);
    w.u32(c, 0, w.str('body-mesh-skin'), skin);
    const binds = w.alloc(64);
    w.f32(binds, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -2, 0, 1);
    w.u32(skin, 16, binds, 8, 0);
    // Bind shape: a row-vector matrix moving everything up by 3.
    w.f32(skin + 16, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 3, 0, 1);
    w.u32(skin + 112, w.str('#body-mesh'));
    const joints = w.list(skin + 116, 1, 4);
    w.u32(joints, w.str('Bone1'));
    const influences = 2;
    const weights = w.block(2, 4 * (4 + 4 * influences));
    QUAD.forEach((_, i) => {
      const r = weights + 4 + i * (4 + 4 * influences);
      w.u8(r, 0, 0);
      w.f32(r + 4, 0.75, 0.25);
    });
    w.u32(skin + 124, QUAD.length * (1 + influences), weights);
    w.u32(skin + 152, influences);
    return new Bdae(w.done());
  }

  it('reads joints, inverse binds, the bind shape and per-vertex weights padded to four', () => {
    const skin = skinned().allSkins()['body-mesh-skin'];
    expect(skin).toMatchObject({
      name: 'body-mesh-skin',
      source: '#body-mesh',
      jointNames: ['Bone1'],
      maxInfluence: 2,
      vertexCount: 4,
    });
    expect(skin.bindPoses[0][13]).toBe(-2);
    expect(skin.weights[0]).toEqual({ indices: [0, 0, 0, 0], weights: [0.75, 0.25, 0, 0] });
  });

  it('bakes a mesh no node places with its skin’s bind shape', () => {
    const [mesh] = skinned().meshes(true);
    expect([...mesh.positions!.slice(0, 3)]).toEqual([1, 3, 0]);
  });
});

describe('Bdae morphs', () => {
  function morphing(): Bdae {
    const w = new ModelWriter();
    wallMaterial(w);
    const g = w.infoList(GEOMETRIES, 3, 16);
    geometry(w, g, 'flag-mesh', QUAD, [{ material: 'wall', indices: [0, 1, 2] }]);
    geometry(
      w,
      g + 16,
      'flag-wave',
      QUAD.map(v => ({ ...v, pos: [v.pos[0], v.pos[1] + 1, v.pos[2]] })),
      [{ material: 'wall', indices: [0, 1, 2] }],
    );
    geometry(w, g + 32, 'flag-short', QUAD.slice(0, 3), [{ material: 'wall', indices: [0, 1, 2] }]);
    tree(w, [
      { id: 'flag-node', t: [0, 0, 4], instances: [{ type: 2, url: 'flag-mesh-morpher' }] },
    ]);
    const c = w.infoList(CONTROLLERS, 1, 12);
    const morph = w.alloc(32);
    w.u32(c, 1, w.str('flag-mesh-morpher'), morph);
    w.u32(morph, w.str('#flag-mesh'));
    w.u32(w.list(morph + 8, 2, 4), w.str('flag-wave'), w.str('flag-short'));
    w.u32(w.list(morph + 16, 2, 4), 1, 2);
    w.f32(w.list(morph + 24, 2, 4), 0.5, 0);
    oneChannel(w, 'flag-mesh-morpher', 14, [0, 30], 1, 0x1234ff00);
    return new Bdae(w.done());
  }

  it('reads the controller’s targets, their indices and rest weights', () => {
    expect(morphing().morphers()).toEqual([
      {
        name: 'flag-mesh-morpher',
        source: 'flag-mesh',
        targets: ['flag-wave', 'flag-short'],
        indices: [1, 2],
        weights: [0.5, 0],
      },
    ]);
  });

  it('places the source through its controller instance, drops the loose targets, and bakes the blend shapes', () => {
    const meshes = morphing().meshes(true);
    expect(meshes.map(m => m.name)).toEqual(['flag-mesh']);
    const [flag] = meshes;
    expect([...flag.positions!.slice(0, 3)]).toEqual([1, 0, 4]);
    // The short target does not match the vertex count and is left out.
    expect(flag.morph!.targets.map(t => [t.name, t.weight])).toEqual([['flag-wave', 0.5]]);
    expect([...flag.morph!.targets[0].positions.slice(0, 3)]).toEqual([1, 1, 4]);
    expect(flag.boundingBox.max[1]).toBe(2);
  });

  it('reads a weight channel’s morph target from the low byte of its detail word', () => {
    const [clip] = morphing().animations();
    expect(clip.channels).toEqual([{ target: 'flag-mesh-morpher', type: 14, member: 0 }]);
  });
});

/**
 * One animation record driving `target` with one sampler, its keys stored
 * with `encoding`. The source table sits after its key data, so the key
 * source's offset is negative.
 */
function oneChannel(
  w: ModelWriter,
  target: string,
  kind: number,
  keys: number[],
  encoding: number,
  detail = 0xff,
): void {
  const width = encoding === 1 ? 1 : encoding === 3 ? 2 : 4;
  const keyData = w.alloc(keys.length * width);
  keys.forEach((k, i) => {
    if (width === 1) w.u8(keyData + i, k);
    else if (width === 2) w.u16(keyData + i * 2, k);
    else w.i32(keyData + i * 4, k);
  });
  const values = w.alloc(keys.length * 4);
  w.f32(values, ...keys.map((_, i) => i * 0.5));
  const table = w.alloc(4 + 16);
  w.u32(table, 2, keys.length);
  w.i32(table + 8, keyData - (table + 8));
  w.u32(table + 12, keys.length);
  w.i32(table + 16, values - (table + 16));
  const store = w.alloc(8);
  const segment = w.alloc(24);
  w.u32(w.info + STORE, store);
  w.u32(store, 1, segment);
  w.i32(segment, 0, 1000, 1, 0, 0, table);
  const rec = w.infoList(ANIMATIONS, 1, 32);
  w.u32(rec, w.str('clip'));
  const sampler = w.list(rec + 4, 1, 28);
  w.u32(sampler, 1, encoding, 1, 0, 6, 1, 1);
  const channel = w.list(rec + 12, 1, 16);
  w.i32(channel, -1);
  w.u32(channel + 4, w.str(target), kind, detail);
  const base = w.alloc(12);
  const components = w.alloc(12);
  w.u32(base, 7, 3, components);
  w.u32(rec + 24, base);
}

describe('Bdae key times', () => {
  const keysFor = (encoding: number, keys: number[]): number[] => {
    const w = new ModelWriter();
    oneChannel(w, 'root-node', 2, keys, encoding);
    const [clip] = new Bdae(w.done()).animations();
    return clip.samplers[0].input.values;
  };

  it('reads one-byte and two-byte frame numbers', () => {
    expect(keysFor(1, [0, 30, 200])).toEqual([0, 30, 200]);
    expect(keysFor(3, [0, 300, 3000])).toEqual([0, 300, 3000]);
  });

  it('turns signed millisecond keys into frames at 30 per second', () => {
    expect(keysFor(4, [-100, 0, 1000])).toEqual([-3, 0, 30]);
  });

  it('reads the values through the self-relative offset', () => {
    const w = new ModelWriter();
    oneChannel(w, 'root-node', 2, [0, 1, 2], 1);
    const [clip] = new Bdae(w.done()).animations();
    expect(clip.samplers[0]).toMatchObject({
      interpolation: 1,
      input: { type: 1, components: 1, sourceIndex: 0 },
      output: { type: 6, components: 1, sourceIndex: 1, values: [0, 0.5, 1] },
    });
    expect(clip.channels).toEqual([{ target: 'root-node', type: 2, member: null }]);
  });

  it('finds no curves in a file without a source table', () => {
    const w = new ModelWriter();
    oneChannel(w, 'root-node', 2, [0, 1], 1);
    const bytes = w.done();
    const dv = new DataView(bytes.buffer);
    const store = dv.getUint32(w.info + STORE, true);
    dv.setUint32(dv.getUint32(store + 4, true) + 20, 0, true);
    expect(new Bdae(bytes).animations()[0].samplers[0].input.values).toEqual([]);
  });
});

describe('mesh variants', () => {
  it('splits a mesh name into its family and number', () => {
    expect(meshSlot('hair_03-mesh')).toEqual(['hair', 3]);
    expect(meshSlot('Cape-2-mesh')).toEqual(['cape', 2]);
    expect(meshSlot('body-mesh')).toEqual(['body', 0]);
  });

  it('keeps the chosen variant of each family, clamped to the last', () => {
    const meshes = ['hair_01-mesh', 'body_02-mesh', 'hair_03-mesh', 'body_01-mesh'].map(name => ({
      name,
    }));
    expect(selectVariants(meshes, 0).map(m => m.name)).toEqual(['hair_01-mesh', 'body_01-mesh']);
    expect(selectVariants(meshes, 5).map(m => m.name)).toEqual(['hair_03-mesh', 'body_02-mesh']);
  });
});
