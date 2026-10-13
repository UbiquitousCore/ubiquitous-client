/**
 * Fitting a flat decal (a blob shadow, the target ring) onto the ground.
 *
 * Each corner follows the ground beneath it when that ground is standable and
 * within the decal's grade of the centre; otherwise it stays at the centre's
 * height. The world here is a height function, so every case is exact.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_GRADE, QUAD_CORNERS, fitCorners } from '../src/renderer/groundFit';
import type { GroundQuery } from '../src/renderer/groundFit';
import type { GroundPoint } from '../src/world/World';

const UP: [number, number, number] = [0, 1, 0];

function ground(fn: (x: number, z: number) => GroundPoint): GroundQuery {
  return { groundPoint: (x, z) => fn(x, z) };
}

const flatAt = (y: number): GroundPoint => ({ y, normal: UP });

describe('fitCorners', () => {
  it('leaves every corner level on flat ground', () => {
    expect(
      fitCorners(
        ground(() => flatAt(3)),
        0,
        0,
        flatAt(3),
        1,
      ),
    ).toEqual([0, 0, 0, 0]);
  });

  it('follows a gentle hillside at every corner', () => {
    // Rising 0.5 per unit along +x: the +x corners one unit out sit 0.5 up.
    const hill = ground(x => ({ y: 0.5 * x, normal: [-0.447, 0.894, 0] }));
    const corners = fitCorners(hill, 0, 0, { y: 0, normal: [-0.447, 0.894, 0] }, 1);
    QUAD_CORNERS.forEach(([sx], i) => expect(corners[i]).toBeCloseTo(0.5 * sx, 6));
  });

  it('raises only the corners that reach a small step up', () => {
    const step = ground(x => flatAt(x > 0.5 ? 0.2 : 0));
    const corners = fitCorners(step, 0, 0, flatAt(0), 1);
    QUAD_CORNERS.forEach(([sx], i) => expect(corners[i]).toBeCloseTo(sx > 0 ? 0.2 : 0, 6));
  });

  it('does not hang a corner down past a ledge', () => {
    const ledge = ground(x => flatAt(x > 0.5 ? -4 : 0));
    expect(fitCorners(ledge, 0, 0, flatAt(0), 1)).toEqual([0, 0, 0, 0]);
  });

  it('does not climb ground steeper than its grade', () => {
    const cliff = ground(x => flatAt(x > 0.5 ? 2 * MAX_GRADE * 1.5 : 0));
    expect(fitCorners(cliff, 0, 0, flatAt(0), 1)).toEqual([0, 0, 0, 0]);
  });

  it('does not climb onto a wall face, however close', () => {
    const wall = ground(x => (x > 0.5 ? { y: 0.1, normal: [0.95, 0.31, 0] } : flatAt(0)));
    expect(fitCorners(wall, 0, 0, flatAt(0), 1)).toEqual([0, 0, 0, 0]);
  });

  it('lies flat when the body itself stands on steep ground', () => {
    const steep: GroundPoint = { y: 0, normal: [0.9, 0.44, 0] };
    const slope = ground(x => ({ y: 2 * x, normal: steep.normal }));
    expect(fitCorners(slope, 0, 0, steep, 1)).toEqual([0, 0, 0, 0]);
  });

  it('asks for ground at the four corners of the square', () => {
    const asked: Array<[number, number]> = [];
    const probe: GroundQuery = {
      groundPoint: (x, z) => {
        asked.push([x, z]);
        return flatAt(0);
      },
    };
    fitCorners(probe, 10, -5, flatAt(0), 2);
    expect(asked).toEqual(QUAD_CORNERS.map(([sx, sz]) => [10 + 2 * sx, -5 + 2 * sz]));
  });
});

/**
 * The shader blends corner i by the flattened square's UVs, so QUAD_CORNERS
 * has to name the same corner of the square that the UVs do. Got the wrong
 * way round, every decal tilts against the slope it sits on.
 */
describe('the corner order matches the square the shaders draw', () => {
  it('names each UV corner by its own world position', () => {
    const square = new THREE.PlaneGeometry(2, 2);
    square.rotateX(-Math.PI / 2);
    const position = square.getAttribute('position');
    const uv = square.getAttribute('uv');
    for (let i = 0; i < position.count; i++) {
      const index = (uv.getX(i) === 1 ? 1 : 0) + (uv.getY(i) === 1 ? 2 : 0);
      const [sx, sz] = QUAD_CORNERS[index]!;
      expect(Math.sign(position.getX(i))).toBe(sx);
      expect(Math.sign(position.getZ(i))).toBe(sz);
    }
    square.dispose();
  });
});
