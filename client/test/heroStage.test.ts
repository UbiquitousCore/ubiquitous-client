/**
 * The character sheet's hero stage: where in the main canvas it renders and
 * how much of that the stage canvas takes.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  STAGE_ZOOM_MAX,
  STAGE_ZOOM_MIN,
  clampZoom,
  stageCopyRect,
} from '../src/renderer/heroStage';
import { bodyBox, markNotBody } from '../src/renderer/upperBody';

describe('stageCopyRect', () => {
  it('takes the stage-sized corner, reading from the top of the buffer', () => {
    // GL draws at the bottom-left; a 2D copy reads rows from the top.
    expect(stageCopyRect(384, 640, 1920, 1080)).toEqual({ width: 384, height: 640, sourceY: 440 });
  });

  it('crops a stage bigger than the buffer rather than reading outside it', () => {
    expect(stageCopyRect(384, 640, 300, 200)).toEqual({ width: 300, height: 200, sourceY: 0 });
  });

  it('is nothing when there is no buffer to draw into', () => {
    expect(stageCopyRect(384, 640, 0, 0)).toBeNull();
  });
});

describe('clampZoom', () => {
  it('keeps the wheel between a close-up and a long shot', () => {
    expect(clampZoom(0.1)).toBe(STAGE_ZOOM_MIN);
    expect(clampZoom(9)).toBe(STAGE_ZOOM_MAX);
    expect(clampZoom(1.3)).toBe(1.3);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe('bodyBox', () => {
  it('is the body alone: no nameplate sprite, nothing marked as hanging off it', () => {
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4));
    torso.position.set(0.3, 0.9, 0); // authored off its origin
    body.add(torso);
    const plate = new THREE.Sprite();
    plate.position.set(0, 2.5, 0);
    body.add(plate);
    const polearm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 0.1));
    polearm.position.set(1.5, 1.5, 0);
    markNotBody(polearm);
    body.add(polearm);
    body.updateMatrixWorld(true);

    const box = bodyBox(body);
    const centre = box.getCenter(new THREE.Vector3());
    expect(centre.x).toBeCloseTo(0.3, 5);
    expect(box.max.y).toBeCloseTo(1.8, 5);
    expect(box.max.x).toBeCloseTo(0.6, 5);
  });
});
