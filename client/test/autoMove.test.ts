import { describe, expect, it } from 'vitest';

import {
  approachActionNow,
  beginApproach,
  followActionNow,
  heldDirection,
  updateApproachProgress,
} from '../src/app/helpers/combat/autoMove';

describe('heldDirection', () => {
  it('reports true when any movement direction is held', () => {
    expect(heldDirection({ forward: false, back: false, left: false, right: false })).toBe(false);
    expect(heldDirection({ forward: true, back: false, left: false, right: false })).toBe(true);
    expect(heldDirection({ forward: false, back: true, left: false, right: false })).toBe(true);
  });
});

describe('beginApproach', () => {
  it('builds attack approach ranges from intent and ranged state', () => {
    const melee = beginApproach({
      id: 10,
      asked: 'attack',
      targetKind: 'creature',
      holdsRangedWeapon: false,
      targetWhenAsked: '10',
    });
    expect(melee.stopDistance).toBeLessThan(10);
    expect(melee.reach).toBe(3);

    const ranged = beginApproach({
      id: 11,
      asked: 'attack',
      targetKind: 'creature',
      holdsRangedWeapon: true,
      targetWhenAsked: '11',
    });
    expect(ranged.reach).toBe(25);
    expect(ranged.stopDistance).toBe(20);
  });
});

describe('updateApproachProgress', () => {
  it('tracks distance progress only when both positions are known', () => {
    const prev = null;
    const next = updateApproachProgress(prev, [0, 0, 0], [3, 4, 0], 1);
    expect(next).toEqual({ closest: 5, since: 1 });
    expect(updateApproachProgress(next, null, [3, 4, 0], 2)).toBe(next);
  });
});

describe('approachActionNow', () => {
  it('runs toward target when still wanted and out of range', () => {
    const action = approachActionNow({
      heroDead: false,
      directionHeld: false,
      here: [0, 0, 0],
      there: [10, 0, 0],
      stillWanted: true,
      retargeted: false,
      asked: 'talk',
      now: 'talk',
      stopDistance: 2,
      reach: 10,
      progress: null,
      nowSeconds: 1,
      running: false,
    });
    expect(action).toEqual({ kind: 'run', to: [10, 0, 0] });
  });
});

describe('followActionNow', () => {
  it('brakes when close enough and currently running', () => {
    const action = followActionNow({
      heroDead: false,
      directionHeld: false,
      here: [0, 0, 0],
      there: [1, 0, 0],
      stopDistance: 2,
      running: true,
    });
    expect(action).toEqual({ kind: 'brake' });
  });
});
