import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { MeshData, ModelData, SkeletonData } from '../src/assets/types';
import { MaterialCache } from '../src/renderer/MaterialCache';
import { buildSkinnedModel } from '../src/renderer/SkinnedModelFactory';

/** One triangle at `y`, unlit and untextured. */
function mesh(name: string, y: number): MeshData {
  return {
    name,
    positions: new Float32Array([0, y, -0.3, 0.1, y, -0.3, 0, y + 0.1, -0.3]),
    normals: new Float32Array(9),
    uvs: new Float32Array(6),
    colors: new Uint8Array(0),
    indices: new Uint16Array([0, 1, 2]),
    groups: [
      {
        start: 0,
        count: 3,
        texture: null,
        material: 'm',
        blend: 'opaque',
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

/** A body skinned to the root, a cape and a prop with no skin, and a spine above the waist. */
function body(): { model: ModelData; skeleton: SkeletonData } {
  const identity = new THREE.Matrix4().toArray();
  return {
    model: {
      path: 'body.bdae',
      meshes: [mesh('body_01-mesh', 1), mesh('cape_02-mesh', 1.5), mesh('prop-mesh', 1.5)],
      defaultMeshes: [],
    },
    skeleton: {
      path: 'body.bdae',
      bones: [bone('Bip01-node', -1, 0), bone('Bip01_Spine1-node', 0, 1)],
      skins: [
        {
          mesh: 'body_01-mesh',
          joints: [0],
          inverseBind: new Float32Array(identity),
          skinIndices: new Uint16Array(12),
          skinWeights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          bindShape: new Float32Array(identity),
        },
      ],
    },
  };
}

const cache = () => new MaterialCache({ texture: async () => null }, new THREE.Vector3());

/** Where a mesh's first vertex is drawn, in the model's own space. */
function drawnAt(root: THREE.Object3D, name: string): THREE.Vector3 {
  const found = root.getObjectByName(name) as THREE.Mesh;
  const p = found.geometry.getAttribute('position');
  return new THREE.Vector3(p.getX(0), p.getY(0), p.getZ(0)).applyMatrix4(found.matrixWorld);
}

describe('a cape a body ships with no skin', () => {
  it('stands where the file puts it, and leans with the spine while a prop stays put', () => {
    const { model, skeleton } = body();
    const built = buildSkinnedModel(model, skeleton, cache())!;
    built.object.updateMatrixWorld(true);
    expect(
      drawnAt(built.object, 'cape_02-mesh')
        .toArray()
        .map(v => +v.toFixed(5)),
    ).toEqual([0, 1.5, -0.3]);

    const spine = built.object.getObjectByName('Bip01_Spine1-node')!;
    spine.rotation.x = Math.PI / 2;
    built.object.updateMatrixWorld(true);

    const cape = drawnAt(built.object, 'cape_02-mesh');
    expect(cape.y).toBeCloseTo(1.3, 5);
    expect(cape.z).toBeCloseTo(0.5, 5);
    expect(
      drawnAt(built.object, 'prop-mesh')
        .toArray()
        .map(v => +v.toFixed(5)),
    ).toEqual([0, 1.5, -0.3]);
  });
});
