/**
 * The frame-rate changes that can be checked without a WebGL context: a
 * batch of several parts writes every part's row, a written row marks only
 * its own span for upload, fade clones are reused rather than remade, a
 * skeleton whose bones have not moved skips its work, and a map state that
 * says nothing new is dropped.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  appendEntry,
  createStaticBatchOf,
  disposeBatch,
  removeEntry,
  writeEntry,
} from '../src/renderer/staticBatch';
import type { StaticBatchEntry } from '../src/renderer/staticBatch';
import {
  acquireFadeClone,
  patchFadeMaterial,
  releaseFadeClone,
  setFade,
} from '../src/renderer/fadeMaterial';
import { bonesMoved } from '../src/renderer/skeletonUpdate';
import { sameMapState } from '../src/ui/hudStore';
import type { MapState } from '../src/ui/hudStore';

function triangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), 3),
  );
  return geometry;
}

function placement(id: number, x: number): StaticBatchEntry {
  const object = new THREE.Object3D();
  object.position.set(x, 0, 0);
  return { id, object, visible: true };
}

function xOf(mesh: THREE.InstancedMesh, index: number): number {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  return new THREE.Vector3().setFromMatrixPosition(m).x;
}

describe('a batch of several parts', () => {
  function house() {
    const parent = new THREE.Group();
    const walls = new THREE.MeshBasicMaterial();
    const roof = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const batch = createStaticBatchOf(
      'house',
      [
        { geometry: triangle(), material: walls, baseMatrix: new THREE.Matrix4() },
        {
          geometry: triangle(),
          material: roof,
          baseMatrix: new THREE.Matrix4().makeTranslation(0, 3, 0),
        },
      ],
      parent,
    );
    return { batch, parent };
  }

  it('draws every part at every placement, each under its own transform', () => {
    const { batch, parent } = house();
    appendEntry(batch, placement(1, 10));
    appendEntry(batch, placement(2, 20));
    appendEntry(batch, placement(3, 30));

    expect(parent.children).toHaveLength(2);
    for (const part of batch.parts) {
      expect(part.mesh.count).toBe(3);
      expect(xOf(part.mesh, 2)).toBe(30);
    }
    const m = new THREE.Matrix4();
    batch.parts[1]!.mesh.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).y).toBe(3);
    // The material array rides through to the instanced mesh untouched.
    expect(Array.isArray(batch.parts[1]!.mesh.material)).toBe(true);
    expect(batch.mesh).toBe(batch.parts[0]!.mesh);
  });

  it('moves the last row into a hole in every part', () => {
    const { batch } = house();
    appendEntry(batch, placement(1, 10));
    appendEntry(batch, placement(2, 20));
    expect(removeEntry(batch, 0)).toBe(2);
    for (const part of batch.parts) {
      expect(part.mesh.count).toBe(1);
      expect(xOf(part.mesh, 0)).toBe(20);
    }
  });

  it('takes every part out of the scene when disposed', () => {
    const { batch, parent } = house();
    appendEntry(batch, placement(1, 1));
    disposeBatch(batch);
    expect(parent.children).toHaveLength(0);
  });
});

describe('uploading a written row', () => {
  it('marks one span covering only the rows written since the last upload', () => {
    const batch = createStaticBatchOf(
      'grass',
      [
        {
          geometry: triangle(),
          material: new THREE.MeshBasicMaterial(),
          baseMatrix: new THREE.Matrix4(),
        },
      ],
      new THREE.Group(),
    );
    for (let i = 0; i < 8; i++) appendEntry(batch, placement(i, i));
    const matrices = batch.mesh.instanceMatrix;
    // What an upload does: three clears the ranges and calls back.
    matrices.clearUpdateRanges();
    matrices.onUploadCallback();

    writeEntry(batch, 5);
    writeEntry(batch, 3);
    expect(matrices.updateRanges).toEqual([{ start: 3 * 16, count: 3 * 16 }]);

    matrices.clearUpdateRanges();
    matrices.onUploadCallback();
    writeEntry(batch, 7);
    expect(matrices.updateRanges).toEqual([{ start: 7 * 16, count: 16 }]);
  });
});

describe('fade clones', () => {
  it('are handed out again once given back, reset to draw like the original', () => {
    const original = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const first = acquireFadeClone(original)!;
    expect(first).not.toBe(original);
    setFade(first, 0.3);
    first.polygonOffset = true;
    first.depthWrite = false;
    releaseFadeClone(original, first);

    const again = acquireFadeClone(original)!;
    expect(again).toBe(first);
    expect((again.userData.fade as { value: number }).value).toBe(1);
    expect(again.polygonOffset).toBe(false);
    expect(again.depthWrite).toBe(true);
  });

  it('pick up a texture the original got while they were spare', () => {
    const original = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const clone = acquireFadeClone(original)!;
    releaseFadeClone(original, clone);
    const map = new THREE.Texture();
    original.map = map;
    expect((acquireFadeClone(original) as THREE.MeshBasicMaterial).map).toBe(map);
  });

  it('are disposed with their original', () => {
    const original = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const clone = acquireFadeClone(original)!;
    let disposed = false;
    clone.addEventListener('dispose', () => {
      disposed = true;
    });
    releaseFadeClone(original, clone);
    original.dispose();
    expect(disposed).toBe(true);
  });
});

describe('bonesMoved', () => {
  it('is true the first time and after a move, false for a pose held still', () => {
    const bone = new THREE.Bone();
    bone.updateMatrixWorld(true);
    const seen = new Float32Array(16).fill(NaN);
    expect(bonesMoved([bone], seen)).toBe(true);
    expect(bonesMoved([bone], seen)).toBe(false);

    bone.position.x = 0.1;
    bone.updateMatrixWorld(true);
    expect(bonesMoved([bone], seen)).toBe(true);
    expect(bonesMoved([bone], seen)).toBe(false);
  });
});

describe('sameMapState', () => {
  const state = (x: number): MapState => ({
    zoneName: 'Field',
    bounds: [0, 0, 64, 64],
    playerPosition: [x, 0, 5],
    playerYaw: 0,
    markers: [{ id: '1', label: 'Smith', position: [1, 0, 1], kind: 'service' }],
    places: [],
  });

  it('treats a rebuilt but equal state as the same, and a step as new', () => {
    expect(sameMapState(state(1), state(1))).toBe(true);
    expect(sameMapState(state(1), state(2))).toBe(false);
    const moved = state(1);
    moved.markers[0]!.position = [2, 0, 1];
    expect(sameMapState(state(1), moved)).toBe(false);
  });
});
