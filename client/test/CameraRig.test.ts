/**
 * The camera's obstruction handling.
 *
 * Without it the camera sits wherever the zoom puts it, which inside a
 * building is on the far side of a wall — and the near plane then cuts the
 * wall open. A line test between the player and the camera fixes it.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig, MAX_DISTANCE } from '../src/renderer/CameraRig';

/** Distance from the target to the camera, which is what the probe limits. */
const boom = (rig: CameraRig): number => rig.camera.position.distanceTo(rig.target);

describe('CameraRig obstruction', () => {
  it('sits where the zoom asks when nothing is in the way', () => {
    const rig = new CameraRig();
    rig.setObstructionProbe(() => null);
    rig.update();
    expect(boom(rig)).toBeCloseTo(14, 3);
  });

  it('pulls in to just short of an obstruction', () => {
    const rig = new CameraRig();
    rig.setObstructionProbe(() => 5);
    rig.update();
    // Short of the hit by the near-plane gap, not sitting exactly on it.
    expect(boom(rig)).toBeGreaterThan(4);
    expect(boom(rig)).toBeLessThan(5);
  });

  it('pulls in immediately but eases back out', () => {
    const rig = new CameraRig();
    rig.setObstructionProbe(() => 5);
    rig.update();
    const tight = boom(rig);

    // The way is clear now; one update must not put it straight back to 14.
    rig.setObstructionProbe(() => null);
    rig.update();
    const after = boom(rig);
    expect(after).toBeGreaterThan(tight);
    expect(after).toBeLessThan(14);
  });

  it('keeps a minimum boom however tight the space', () => {
    const rig = new CameraRig();
    rig.setObstructionProbe(() => 0);
    rig.update();
    expect(boom(rig)).toBeGreaterThan(0.5);
  });
});

/**
 * Where the target lands on screen, in normalised device coordinates: 0 is
 * the canvas centre, +1 its right edge.
 */
function targetNdcX(rig: CameraRig): number {
  rig.camera.updateMatrixWorld();
  return rig.target.clone().project(rig.camera).x;
}

/** Enough updates for the eased centre to arrive. */
function settle(rig: CameraRig): void {
  for (let i = 0; i < 200; i++) rig.update();
}

describe('CameraRig view centre', () => {
  it('keeps the target at the canvas centre when nothing covers it', () => {
    const rig = new CameraRig();
    rig.setView(1000, 600, null);
    settle(rig);
    expect(targetNdcX(rig)).toBeCloseTo(0, 5);
    expect(rig.camera.aspect).toBeCloseTo(1000 / 600, 6);
  });

  it('moves the target to the middle of what a left-hand window leaves', () => {
    const rig = new CameraRig();
    // Window 0..400 of 1000: what is left is centred at x = 700, which is
    // 0.4 of the way from the canvas centre to its right edge.
    rig.setView(1000, 600, { left: 0, top: 0, right: 400, bottom: 600 });
    settle(rig);
    expect(targetNdcX(rig)).toBeCloseTo(0.4, 3);
    // Perspective is untouched: the frustum is offset, not the camera turned.
    expect(rig.camera.fov).toBe(55);
  });

  it('glides rather than jumps', () => {
    const rig = new CameraRig();
    rig.setView(1000, 600, null);
    settle(rig);
    rig.setView(1000, 600, { left: 0, top: 0, right: 400, bottom: 600 });
    rig.update();
    const afterOne = targetNdcX(rig);
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne).toBeLessThan(0.4);
    rig.update();
    expect(targetNdcX(rig)).toBeGreaterThan(afterOne);
  });

  it('comes back to centre and drops the offset when the window shuts', () => {
    const rig = new CameraRig();
    rig.setView(1000, 600, { left: 0, top: 0, right: 400, bottom: 600 });
    settle(rig);
    rig.setView(1000, 600, null);
    settle(rig);
    expect(targetNdcX(rig)).toBeCloseTo(0, 5);
    expect(rig.camera.view?.enabled ?? false).toBe(false);
  });

  it('holds the same on-screen place across a resize', () => {
    const rig = new CameraRig();
    rig.setView(1000, 600, { left: 0, top: 0, right: 400, bottom: 600 });
    settle(rig);
    // The window keeps its 40% share of a wider canvas.
    rig.setView(2000, 600, { left: 0, top: 0, right: 800, bottom: 600 });
    expect(targetNdcX(rig)).toBeCloseTo(0.4, 3);
    expect(new THREE.Vector3().project(rig.camera)).toBeDefined();
  });
});

describe('CameraRig zoom', () => {
  it('stops zooming out at the maximum distance', () => {
    const rig = new CameraRig();
    rig.zoom(10_000);
    for (let i = 0; i < 200; i++) rig.update();
    expect(boom(rig)).toBeCloseTo(MAX_DISTANCE, 3);
  });

  it('goes first person when zoomed in to the eyes, and not for a wall in the way', () => {
    const rig = new CameraRig();
    rig.zoom(-10_000);
    rig.update();
    expect(rig.firstPerson).toBe(true);
    expect(boom(rig)).toBeCloseTo(0, 3);

    const walled = new CameraRig();
    walled.setObstructionProbe(() => 0.1);
    walled.update();
    expect(walled.firstPerson).toBe(false);
  });

  it('reverses only the vertical drag in first person', () => {
    const third = new CameraRig();
    third.orbit(0.3, 0.1);
    const eyes = new CameraRig();
    eyes.zoom(-10_000);
    eyes.update();
    eyes.orbit(0.3, 0.1);
    expect(eyes.viewYaw).toBeCloseTo(third.viewYaw, 6);
    expect(eyes.elevation() - 0.4).toBeCloseTo(-(third.elevation() - 0.4), 6);
  });
});
