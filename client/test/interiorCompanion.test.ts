/**
 * A building shell and its interior: which model is the interior, and which
 * of the shell's faces give way to it. Synthetic geometry only.
 */

import { describe, expect, it } from 'vitest';

import { interiorOf, withoutSharedFaces } from '../src/assets/providers/interiorCompanion';
import type { MeshData, ModelData } from '../src/assets/types';

type V = [number, number, number];

const GROUP = {
  texture: 'texture/wall.tga',
  material: 'wall',
  blend: 'opaque' as const,
  doubleSided: false,
  unlit: true,
  shader: 'unlit_textured_solid',
};

/** One mesh from a list of triangles, each its own three vertices. */
function mesh(name: string, triangles: V[][], sizes: number[] = [triangles.length]): MeshData {
  const positions = new Float32Array(triangles.flat(2));
  const indices = Uint16Array.from({ length: triangles.length * 3 }, (_, i) => i);
  let start = 0;
  const groups = sizes.map((size, g) => {
    const group = { ...GROUP, material: `wall${g}`, start, count: size * 3 };
    start += size * 3;
    return group;
  });
  return {
    name,
    positions,
    normals: new Float32Array(positions.length),
    uvs: new Float32Array((positions.length / 3) * 2),
    colors: new Uint8Array(0),
    indices,
    groups,
  };
}

function model(path: string, meshes: MeshData[]): ModelData {
  return { path, meshes, defaultMeshes: [] };
}

/** A unit-square wall in the plane z = `z`, facing +z, split along one diagonal. */
function wall(z: number, x0 = 0, x1 = 1): V[][] {
  return [
    [
      [x0, 0, z],
      [x1, 0, z],
      [x1, 1, z],
    ],
    [
      [x0, 0, z],
      [x1, 1, z],
      [x0, 1, z],
    ],
  ];
}

/** The same wall, split along the other diagonal. */
function wallOtherSplit(z: number): V[][] {
  return [
    [
      [0, 0, z],
      [1, 0, z],
      [0, 1, z],
    ],
    [
      [1, 0, z],
      [1, 1, z],
      [0, 1, z],
    ],
  ];
}

/** The same wall facing the other way. */
function flipped(triangles: V[][]): V[][] {
  return triangles.map(([a, b, c]) => [a!, c!, b!]);
}

function faceCount(m: ModelData): number {
  return m.meshes.reduce((n, mesh) => n + mesh.indices.length / 3, 0);
}

describe('interiorOf', () => {
  it('names the interior placed with a building', () => {
    expect(interiorOf('model/scene/build/human/building_inn.bdae')).toBe(
      'model/scene/build/human/building_inn_inside.bdae',
    );
  });

  it('keeps the spelling of the path it was given', () => {
    expect(interiorOf('model/Inn.BDAE')).toBe('model/Inn_inside.bdae');
  });

  it('gives an interior no interior of its own', () => {
    expect(interiorOf('model/scene/build/human/building_inn_inside.bdae')).toBeNull();
    expect(interiorOf('model/INN_INSIDE.bdae')).toBeNull();
  });

  it('only answers for models', () => {
    expect(interiorOf('effect/fire.beff')).toBeNull();
  });
});

describe('withoutSharedFaces', () => {
  it('drops the shell faces the interior draws in the same place', () => {
    const shell = model('house.bdae', [mesh('inner', wall(0)), mesh('outer', wall(-0.3))]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0))]);

    const out = withoutSharedFaces(shell, interior);

    expect(out.meshes.map(m => m.name)).toEqual(['outer']);
    expect(faceCount(out)).toBe(2);
  });

  it('treats a surface split along the other diagonal as the same surface', () => {
    const shell = model('house.bdae', [mesh('inner', wall(0)), mesh('outer', wall(-0.3))]);
    const interior = model('house_inside.bdae', [mesh('walls', wallOtherSplit(0))]);

    expect(withoutSharedFaces(shell, interior).meshes.map(m => m.name)).toEqual(['outer']);
  });

  it('never empties a shell', () => {
    const shell = model('house.bdae', [mesh('inner', wall(0))]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0))]);

    expect(withoutSharedFaces(shell, interior)).toBe(shell);
  });

  it('allows the few ten-thousandths the two copies disagree by', () => {
    const shell = model('house.bdae', [mesh('inner', wall(0.0003)), mesh('outer', wall(-0.3))]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0))]);

    expect(faceCount(withoutSharedFaces(shell, interior))).toBe(2);
  });

  it('keeps a surface that sits just above another, like a rug on a floor', () => {
    const shell = model('house.bdae', [mesh('floor', wall(0))]);
    const interior = model('house_inside.bdae', [mesh('rug', wall(0.005))]);

    expect(withoutSharedFaces(shell, interior)).toBe(shell);
  });

  it('keeps a face that points the other way', () => {
    const shell = model('house.bdae', [mesh('inner', flipped(wall(0)))]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0))]);

    expect(withoutSharedFaces(shell, interior)).toBe(shell);
  });

  it('keeps a face the interior only partly covers', () => {
    const shell = model('house.bdae', [mesh('inner', wall(0, 0, 2))]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0, 0, 1))]);

    expect(withoutSharedFaces(shell, interior)).toBe(shell);
  });

  it('drops a face covered by two interior faces together', () => {
    const shell = model('house.bdae', [mesh('inner', wall(0, 0, 2)), mesh('outer', wall(-0.3))]);
    const interior = model('house_inside.bdae', [
      mesh('left', wall(0, 0, 1)),
      mesh('right', wall(0, 1, 2)),
    ]);

    expect(withoutSharedFaces(shell, interior).meshes.map(m => m.name)).toEqual(['outer']);
  });

  it('closes up the draw groups around what it drops', () => {
    // Group 0: a wall the interior repeats, then one it does not. Group 1:
    // a wall the interior repeats, nothing else.
    const triangles = [...wall(0), ...wall(-2), ...wall(0)];
    const shell = model('house.bdae', [mesh('inner', triangles, [4, 2])]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0))]);

    const [kept] = withoutSharedFaces(shell, interior).meshes;

    expect(kept!.groups.map(g => [g.material, g.start, g.count])).toEqual([['wall0', 0, 6]]);
    // The two faces kept are the ones at z = -2.
    const zs = Array.from(kept!.indices, i => kept!.positions[i * 3 + 2]);
    expect(zs).toEqual([-2, -2, -2, -2, -2, -2]);
  });

  it('leaves meshes on an animated node alone', () => {
    const moving = {
      ...mesh('door', wall(0)),
      chain: [{ key: 'door', local: [], animated: true }],
    };
    const shell = model('house.bdae', [moving]);
    const interior = model('house_inside.bdae', [mesh('walls', wall(0))]);

    expect(withoutSharedFaces(shell, interior)).toBe(shell);
    expect(
      withoutSharedFaces(
        model('house.bdae', [mesh('inner', wall(0)), mesh('outer', wall(-1))]),
        model('house_inside.bdae', [{ ...mesh('walls', wall(0)), chain: moving.chain }]),
      ).meshes,
    ).toHaveLength(2);
  });
});
