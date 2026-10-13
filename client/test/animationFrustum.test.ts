/**
 * Skeletons behind the camera cost exactly as much to pose as ones in front.
 *
 * Gated on distance alone (the profile's `animationDistance`, 60), a crowd
 * standing behind the player would be posed every frame and never drawn.
 * Skinning costs 11.2 ms against 2.5 ms for the static scene in this client, so
 * this is the cheapest win available.
 *
 * The padding matters as much as the test: a body is not a point, and a figure
 * whose origin has just left the frustum is still half on screen. `shouldPose`
 * tests a generous sphere and poses anything close to the camera regardless,
 * so nothing freezes in view.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { ANIMATION_BOUND_RADIUS } from '../src/renderer/Renderer';
import { shouldPose } from '../src/renderer/drawBudget';

/** A camera at the origin looking down -Z, and its frustum. */
function lookingDownNegativeZ(): THREE.Frustum {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
}

/** Squared distance from the camera at the origin. */
function d2(x: number, y: number, z: number): number {
  return x * x + y * y + z * z;
}

describe('shouldPose', () => {
  const frustum = lookingDownNegativeZ();

  it('poses a body in plain view', () => {
    expect(shouldPose(frustum, 0, 0, -30, d2(0, 0, -30))).toBe(true);
  });

  it('skips a body behind the camera', () => {
    // The whole point: 30 units away, well inside the animation distance, and
    // completely unseen.
    expect(shouldPose(frustum, 0, 0, 30, d2(0, 0, 30))).toBe(false);
  });

  it('skips a body off to the side', () => {
    expect(shouldPose(frustum, 50, 0, 0, d2(50, 0, 0))).toBe(false);
  });

  it('skips a body beyond the animation distance even in full view', () => {
    // Distance still wins — this is the existing budget, not replaced.
    expect(shouldPose(frustum, 0, 0, -200, d2(0, 0, -200))).toBe(false);
  });

  it('poses a body whose origin is just outside the frustum', () => {
    // A figure walking on from the left: its origin crosses the plane before
    // its shoulder does, and freezing it for those frames is visible. Placed
    // just beyond the left plane at 30 units out, within the body sphere.
    const z = -30;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(30)) * 30 * (16 / 9);
    const justOutside = halfWidth + ANIMATION_BOUND_RADIUS * 0.5;
    expect(shouldPose(frustum, justOutside, 0, z, d2(justOutside, 0, z))).toBe(true);
  });

  it('poses anything close to the camera whatever the frustum says', () => {
    // The player's own model with the camera zoomed inside it, and a rider on
    // a mount straddling the near plane. Both must keep moving.
    expect(shouldPose(frustum, 0, 0, 2, d2(0, 0, 2))).toBe(true);
    expect(shouldPose(frustum, 1, 0, 1, d2(1, 0, 1))).toBe(true);
  });
});
