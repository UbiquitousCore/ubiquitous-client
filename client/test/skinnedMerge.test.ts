/**
 * A body's skinned parts are drawn as one mesh on one skeleton, one draw per
 * material. Wrong, it shows as a limb left behind in the bind pose or bent
 * by another part's bone; these pin that a merged body lands every vertex
 * where its parts drawn alone would.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { Appearance, MeshData, ModelData, SkeletonData } from '../src/assets/types';
import { MaterialCache } from '../src/renderer/MaterialCache';
import { buildSkinnedModel } from '../src/renderer/SkinnedModelFactory';

/** A quad at height `y`; `cutout` picks the second material. */
function part(name: string, y: number, cutout: boolean): MeshData {
  return {
    name,
    positions: new Float32Array([0, y, 0, 0.5, y, 0, 0.5, y + 0.5, 0, 0, y + 0.5, 0]),
    normals: new Float32Array(12),
    uvs: new Float32Array(8),
    colors: new Uint8Array(0),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    groups: [
      {
        start: 0,
        count: 6,
        texture: null,
        material: 'm',
        blend: cutout ? 'cutout' : 'opaque',
        doubleSided: false,
        unlit: true,
        shader: '',
      },
    ],
  };
}

const bone = (id: string, parent: number, y: number) => ({
  id,
  name: id,
  sid: '',
  position: [0, y, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
  scale: [1, 1, 1] as [number, number, number],
  parent,
});

/** Inverse bind of a bone standing `y` above the origin. */
const inverseAt = (y: number): number[] => new THREE.Matrix4().makeTranslation(0, -y, 0).toArray();

/**
 * Three parts: two share a material and name the same bones in opposite
 * orders, the third hangs from a bone of its own.
 */
function body(): { model: ModelData; skeleton: SkeletonData } {
  const identity = new THREE.Matrix4().toArray();
  const skin = (
    mesh: string,
    joints: number[],
    binds: number[][],
    indices: number[],
    weights: number[],
  ) => ({
    mesh,
    joints,
    inverseBind: new Float32Array(binds.flat()),
    skinIndices: new Uint16Array(indices),
    skinWeights: new Float32Array(weights),
    bindShape: new Float32Array(identity),
  });
  return {
    model: {
      path: 'body.bdae',
      meshes: [
        part('torso-mesh', 1, false),
        part('legs-mesh', 0, false),
        part('hair-mesh', 1.6, true),
      ],
      defaultMeshes: [],
    },
    skeleton: {
      path: 'body.bdae',
      bones: [bone('Root-node', -1, 0), bone('Spine-node', 0, 1), bone('Head-node', 1, 0.6)],
      skins: [
        skin(
          'torso-mesh',
          [0, 1],
          [inverseAt(0), inverseAt(1)],
          [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
          [0.5, 0.5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0.25, 0.75, 0, 0],
        ),
        skin(
          'legs-mesh',
          [1, 0],
          [inverseAt(1), inverseAt(0)],
          [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
          [1, 0, 0, 0, 1, 0, 0, 0, 0.3, 0.7, 0, 0, 1, 0, 0, 0],
        ),
        skin(
          'hair-mesh',
          [2],
          [inverseAt(1.6)],
          new Array(16).fill(0),
          [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        ),
      ],
    },
  };
}

const cache = () => new MaterialCache({ texture: async () => null }, new THREE.Vector3());

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  root.traverse(node => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) found.push(node as THREE.SkinnedMesh);
  });
  return found;
}

/** Bend the spine and turn the head, then every drawn vertex, rounded and sorted. */
function posedVertices(root: THREE.Object3D): string[] {
  root.getObjectByName('Spine-node')!.rotation.set(0.7, 0, 0.3);
  root.getObjectByName('Head-node')!.rotation.set(0, 1.1, 0);
  root.updateMatrixWorld(true);
  const out: string[] = [];
  const v = new THREE.Vector3();
  for (const mesh of skinnedMeshes(root)) {
    mesh.skeleton.update();
    const count = mesh.geometry.getAttribute('position').count;
    for (let i = 0; i < count; i++) {
      mesh.getVertexPosition(i, v);
      out.push(
        v
          .toArray()
          .map(n => n.toFixed(4))
          .join(','),
      );
    }
  }
  return out.sort();
}

function only(name: string): Appearance {
  return { skin: null, meshes: [name], skinReplacesAll: false, key: name };
}

describe('a body of several skinned parts', () => {
  it('is one mesh on one skeleton, drawn once per material', () => {
    const { model, skeleton } = body();
    const built = buildSkinnedModel(model, skeleton, cache())!;
    const meshes = skinnedMeshes(built.object);

    expect(meshes).toHaveLength(1);
    const merged = meshes[0]!;
    expect(merged.skeleton).toBe(built.skeleton);
    expect(Array.isArray(merged.material) && merged.material).toHaveLength(2);
    expect(merged.geometry.groups).toHaveLength(2);
    expect(merged.geometry.getAttribute('position').count).toBe(12);
  });

  it('lands every vertex where its part drawn alone would, in a bent pose', () => {
    const { model, skeleton } = body();
    const merged = posedVertices(buildSkinnedModel(model, skeleton, cache())!.object);
    const alone = model.meshes.flatMap(m =>
      posedVertices(buildSkinnedModel(model, skeleton, cache(), only(m.name))!.object),
    );

    expect(merged).toEqual(alone.sort());
  });

  it('leaves a body of one skinned part as it was', () => {
    const { model, skeleton } = body();
    const built = buildSkinnedModel(model, skeleton, cache(), only('hair-mesh'))!;
    const meshes = skinnedMeshes(built.object);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.name).toBe('hair-mesh');
    expect(meshes[0]!.skeleton.bones).toHaveLength(1);
  });
});
