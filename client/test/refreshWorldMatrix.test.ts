/**
 * Refreshing a frozen subtree, which done wrong loses the entire scene.
 *
 * Entity subtrees are frozen out of Three.js' per-frame matrix walk for
 * performance. `matrixWorldAutoUpdate = false` does not merely skip the
 * traversal — it also gates the matrixWorld computation inside
 * `updateMatrixWorld` (three/src/core/Object3D.js:1171). So refreshing a
 * frozen object with `updateMatrixWorld(true)` silently does nothing, the
 * object keeps an identity world matrix, every entity ends up at the world
 * origin, and the frustum culls the lot. The symptom was terrain and nothing
 * else.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { refreshWorldMatrix } from '../src/renderer/Renderer';

function parentedAt(
  x: number,
  y: number,
  z: number,
): { parent: THREE.Object3D; child: THREE.Object3D } {
  const parent = new THREE.Group();
  const child = new THREE.Mesh();
  child.position.set(1, 0, 0);
  parent.add(child);
  parent.position.set(x, y, z);
  return { parent, child };
}

describe('refreshWorldMatrix', () => {
  it('updates a frozen object that updateMatrixWorld alone would skip', () => {
    const object = new THREE.Group();
    object.position.set(-156.6, 13, 155.4);
    object.matrixWorldAutoUpdate = false;

    // The naive call is a no-op on a frozen object — this is the bug.
    object.updateMatrixWorld(true);
    expect(object.matrixWorld.elements[12]).toBe(0);

    refreshWorldMatrix(object);
    expect(object.matrixWorld.elements[12]).toBeCloseTo(-156.6, 4);
    expect(object.matrixWorld.elements[13]).toBeCloseTo(13, 4);
    expect(object.matrixWorld.elements[14]).toBeCloseTo(155.4, 4);
  });

  it('leaves the subtree frozen afterwards', () => {
    const object = new THREE.Group();
    object.matrixWorldAutoUpdate = false;
    refreshWorldMatrix(object);
    expect(object.matrixWorldAutoUpdate).toBe(false);
  });

  it('propagates to descendants, which is where the meshes live', () => {
    const { parent, child } = parentedAt(10, 0, 20);
    parent.matrixWorldAutoUpdate = false;

    refreshWorldMatrix(parent);
    // Child sits at +1 on X relative to a parent at (10, 0, 20).
    expect(child.matrixWorld.elements[12]).toBeCloseTo(11, 4);
    expect(child.matrixWorld.elements[14]).toBeCloseTo(20, 4);
  });

  it('picks up a later move, so entities that walk stay where they are drawn', () => {
    const { parent, child } = parentedAt(0, 0, 0);
    parent.matrixWorldAutoUpdate = false;
    refreshWorldMatrix(parent);

    parent.position.set(5, 1, -3);
    refreshWorldMatrix(parent);

    expect(parent.matrixWorld.elements[12]).toBeCloseTo(5, 4);
    expect(child.matrixWorld.elements[12]).toBeCloseTo(6, 4);
    expect(child.matrixWorld.elements[13]).toBeCloseTo(1, 4);
  });

  it('works on an object that was never frozen', () => {
    const object = new THREE.Group();
    object.position.set(2, 3, 4);
    refreshWorldMatrix(object);
    expect(object.matrixWorld.elements[13]).toBeCloseTo(3, 4);
    expect(object.matrixWorldAutoUpdate).toBe(true);
  });
});
