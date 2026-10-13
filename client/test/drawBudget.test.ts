/**
 * The draw budget, in draws.
 *
 * Entities are not the unit that costs anything: a placement is one draw per
 * mesh per material group, so a city of 4,000 entities is ~9,600 draws —
 * close to the ~10,000-draw / ~10 fps ceiling the budget exists to stay
 * under. These are the two pieces that let it count the thing it is
 * actually rationing.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { budgetRadius, countDraws } from '../src/renderer/drawBudget';
import { animatedRadius, animationStride, shouldPose } from '../src/renderer/drawBudget';

function meshWithGroups(groupCount: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(groupCount * 3), 1));
  const materials: THREE.Material[] = [];
  for (let i = 0; i < groupCount; i++) {
    geometry.addGroup(i * 3, 3, i);
    materials.push(new THREE.MeshBasicMaterial());
  }
  return new THREE.Mesh(geometry, materials);
}

describe('countDraws', () => {
  it('counts one draw per material group', () => {
    expect(countDraws(meshWithGroups(4))).toBe(4);
  });

  it('counts a single-material mesh as one draw whatever its groups say', () => {
    // Three consults `geometry.groups` only when the material is an array;
    // one material is one `drawElements` over the whole index buffer.
    const mesh = meshWithGroups(4);
    mesh.material = new THREE.MeshBasicMaterial();
    expect(countDraws(mesh)).toBe(1);
  });

  it('sums a subtree, which is what a placement actually is', () => {
    const group = new THREE.Group();
    group.add(meshWithGroups(3), meshWithGroups(2));
    const nested = new THREE.Group();
    nested.add(meshWithGroups(1));
    group.add(nested);
    expect(countDraws(group)).toBe(6);
  });

  it('counts sprites, which are draws too', () => {
    // Nameplates and interaction icons are one draw each and were invisible
    // to a budget that only counted entities.
    const group = new THREE.Group();
    group.add(meshWithGroups(1), new THREE.Sprite());
    expect(countDraws(group)).toBe(2);
  });

  it('counts an InstancedMesh as the one draw it is', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const instanced = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 500);
    expect(countDraws(instanced)).toBe(1);
  });

  it('ignores a group with nothing drawable in it', () => {
    expect(countDraws(new THREE.Group())).toBe(0);
  });
});

describe('budgetRadius', () => {
  // Bands are 10 units wide across a 100-unit cutoff, so band i covers
  // [i*10, (i+1)*10).
  const WIDTH = 10;
  const MAX = 100;

  it('keeps the full distance when the budget is never spent', () => {
    const bands = new Int32Array(10).fill(5); // 50 draws in total
    expect(budgetRadius(bands, WIDTH, 1000, MAX)).toBe(MAX);
  });

  it('cuts at the inner edge of the band that overruns', () => {
    // 100 draws per band; a 250-draw budget is gone partway through band 2,
    // so everything from 20 units out goes. The inner edge is deliberate —
    // the band that broke the budget is excluded rather than half-admitted.
    const bands = new Int32Array(10).fill(100);
    expect(budgetRadius(bands, WIDTH, 250, MAX)).toBe(20);
  });

  it('cuts to nothing when the nearest band alone overruns', () => {
    const bands = new Int32Array(10);
    bands[0] = 5000;
    expect(budgetRadius(bands, WIDTH, 3000, MAX)).toBe(0);
  });

  it('admits a band it exactly fills', () => {
    const bands = new Int32Array(10).fill(100);
    // 300 draws is precisely bands 0..2; the cutoff falls at band 3's edge.
    expect(budgetRadius(bands, WIDTH, 300, MAX)).toBe(30);
  });

  it('skips empty bands rather than stopping at them', () => {
    const bands = new Int32Array(10);
    bands[0] = 10;
    bands[7] = 10_000;
    expect(budgetRadius(bands, WIDTH, 100, MAX)).toBe(70);
  });
});

describe('animationStride', () => {
  // Squared tiers at 10, 20, 25 and 30 units: near every frame, then
  // every 2nd, 4th and 8th, past far never.
  const NEAR = 100;
  const MID_A = 400;
  const MID_B = 625;
  const FAR = 900;

  it('poses the near tier every frame', () => {
    for (let frame = 0; frame < 8; frame++) {
      expect(animationStride(99, frame, 0, NEAR, MID_A, MID_B, FAR)).toBe(1);
      expect(animationStride(NEAR, frame, 5, NEAR, MID_A, MID_B, FAR)).toBe(1);
    }
  });

  it('poses the mid tiers every 2nd and 4th frame, spread across placements', () => {
    expect(animationStride(101, 0, 0, NEAR, MID_A, MID_B, FAR)).toBe(2);
    expect(animationStride(101, 1, 0, NEAR, MID_A, MID_B, FAR)).toBe(0);
    expect(animationStride(101, 0, 1, NEAR, MID_A, MID_B, FAR)).toBe(0);
    expect(animationStride(101, 1, 1, NEAR, MID_A, MID_B, FAR)).toBe(2);
    expect(animationStride(MID_A, 4, 2, NEAR, MID_A, MID_B, FAR)).toBe(2);
    expect(animationStride(401, 0, 0, NEAR, MID_A, MID_B, FAR)).toBe(4);
    expect(animationStride(401, 3, 0, NEAR, MID_A, MID_B, FAR)).toBe(0);
    expect(animationStride(401, 0, 3, NEAR, MID_A, MID_B, FAR)).toBe(0);
    expect(animationStride(401, 1, 3, NEAR, MID_A, MID_B, FAR)).toBe(4);
    expect(animationStride(MID_B, 8, 4, NEAR, MID_A, MID_B, FAR)).toBe(4);
  });

  it('poses the far tier every 8th frame, spread across placements', () => {
    expect(animationStride(626, 0, 0, NEAR, MID_A, MID_B, FAR)).toBe(8);
    expect(animationStride(626, 7, 0, NEAR, MID_A, MID_B, FAR)).toBe(0);
    expect(animationStride(626, 0, 7, NEAR, MID_A, MID_B, FAR)).toBe(0);
    expect(animationStride(626, 1, 7, NEAR, MID_A, MID_B, FAR)).toBe(8);
    expect(animationStride(FAR, 8, 8, NEAR, MID_A, MID_B, FAR)).toBe(8);
  });

  it('never poses past the far tier', () => {
    for (let frame = 0; frame < 16; frame++) {
      expect(animationStride(901, frame, 0, NEAR, MID_A, MID_B, FAR)).toBe(0);
    }
  });
});

describe('posing bounds', () => {
  // Camera at the origin facing down -z with a 90-degree field: x in
  // [-d, d] is on screen at depth d, outside it is not.
  function frustum(): THREE.Frustum {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    camera.updateMatrixWorld();
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    return new THREE.Frustum().setFromProjectionMatrix(matrix);
  }

  it('culls by the animated thing\u2019s own size, not a fixed radius', () => {
    const off = frustum();
    // 20 units deep, 25 to the side: the centre is off screen.
    expect(shouldPose(off, 25, 0, -20, 25 * 25 + 20 * 20, 1000)).toBe(false);
    // A windmill\u2019s sails reach back on screen; a body that far out does not.
    expect(shouldPose(off, 25, 0, -20, 25 * 25 + 20 * 20, 1000, 10)).toBe(true);
    expect(shouldPose(off, 60, 0, -20, 60 * 60 + 20 * 20, 1000, 10)).toBe(false);
  });

  it('measures an entry once, never below the character bound', () => {
    const small = { object: new THREE.Object3D() };
    expect(animatedRadius(small)).toBe(3);
    // Cached: a grown object keeps its first measure.
    small.object.scale.setScalar(100);
    expect(animatedRadius(small)).toBe(3);

    const mill = { object: new THREE.Object3D() };
    const sail = new THREE.Mesh(new THREE.BoxGeometry(2, 24, 2));
    sail.position.set(0, 12, 0);
    mill.object.add(sail);
    mill.object.updateMatrixWorld(true);
    const radius = animatedRadius(mill);
    expect(radius).toBeGreaterThan(12);
    expect(animatedRadius(mill)).toBe(radius);
  });
});
