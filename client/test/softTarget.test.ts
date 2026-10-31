import { describe, expect, it } from 'vitest';
import { SOFT_RANGE, pickSoftTarget } from '../src/gameplay/softTarget';

/** Standing at the origin, camera looking along -z, so "ahead" is negative z. */
const here = { from: [0, 0] as const, heading: [0, -1] as const };

describe('pickSoftTarget', () => {
  it('has nothing to pick from nobody', () => {
    expect(pickSoftTarget({ ...here, candidates: [], current: null })).toBeNull();
  });

  it('picks the nearest body in front', () => {
    const candidates = [
      { id: 1, x: 0, z: -12 },
      { id: 2, x: 0, z: -6 },
    ];
    expect(pickSoftTarget({ ...here, candidates, current: null })).toBe(2);
  });

  it('prefers a body dead ahead to a slightly nearer one off to the side', () => {
    const candidates = [
      { id: 1, x: 6, z: -3 },
      { id: 2, x: 0, z: -9 },
    ];
    expect(Math.hypot(6, 3)).toBeLessThan(9);
    expect(pickSoftTarget({ ...here, candidates, current: null })).toBe(2);
  });

  it('ignores a body behind the camera, however close, unless it is at your feet', () => {
    const behind = [{ id: 1, x: 0, z: 8 }];
    expect(pickSoftTarget({ ...here, candidates: behind, current: null })).toBeNull();
    const underfoot = [{ id: 1, x: 0, z: 3 }];
    expect(pickSoftTarget({ ...here, candidates: underfoot, current: null })).toBe(1);
  });

  it('ignores a body out of range', () => {
    const far = [{ id: 1, x: 0, z: -(SOFT_RANGE + 1) }];
    expect(pickSoftTarget({ ...here, candidates: far, current: null })).toBeNull();
  });

  it('follows the camera round when it turns', () => {
    const candidates = [
      { id: 1, x: 0, z: -8 },
      { id: 2, x: 8, z: 0 },
    ];
    expect(pickSoftTarget({ from: [0, 0], heading: [1, 0], candidates, current: null })).toBe(2);
    expect(pickSoftTarget({ from: [0, 0], heading: [0, -1], candidates, current: null })).toBe(1);
  });

  it('keeps the highlighted body until another is clearly better', () => {
    const candidates = [
      { id: 1, x: 0, z: -10 },
      { id: 2, x: 0, z: -9 },
    ];
    expect(pickSoftTarget({ ...here, candidates, current: 1 })).toBe(1);
    const muchCloser = [
      { id: 1, x: 0, z: -10 },
      { id: 2, x: 0, z: -4 },
    ];
    expect(pickSoftTarget({ ...here, candidates: muchCloser, current: 1 })).toBe(2);
  });

  it('lets go of the highlighted body once it leaves the cone', () => {
    const candidates = [
      { id: 1, x: 0, z: 9 },
      { id: 2, x: 0, z: -9 },
    ];
    expect(pickSoftTarget({ ...here, candidates, current: 1 })).toBe(2);
  });

  it('breaks an exact tie by id so the pick is stable', () => {
    const candidates = [
      { id: 7, x: 3, z: -8 },
      { id: 4, x: -3, z: -8 },
    ];
    expect(pickSoftTarget({ ...here, candidates, current: null })).toBe(4);
  });

  it('picks nothing without a heading', () => {
    const candidates = [{ id: 1, x: 0, z: -3 }];
    expect(pickSoftTarget({ from: [0, 0], heading: [0, 0], candidates, current: null })).toBeNull();
  });
});
