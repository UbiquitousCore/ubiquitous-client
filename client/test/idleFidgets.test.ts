/**
 * A creature standing idle breaks it up now and then with one of the idle
 * variations its folder ships, on a wait of its own so a crowd does not move
 * in step.
 */

import { describe, expect, it } from 'vitest';

import { FIDGET_CLIPS, FIDGET_WAIT, IdleFidgets } from '../src/gameplay/idleFidgets';

const FRAME = 1 / 60;

/** Seconds of idling until the first fidget, and the clip it was. */
function firstFidget(fidgets: IdleFidgets, limit = 60): { at: number; clip: string } | null {
  for (let t = 0; t < limit; t += FRAME) {
    const clip = fidgets.update(FRAME, true);
    if (clip) return { at: t, clip };
  }
  return null;
}

describe('idle fidgets', () => {
  it('waits the shortest gap on the lowest draw and the longest on the highest', () => {
    expect(firstFidget(new IdleFidgets(() => 0))!.at).toBeCloseTo(FIDGET_WAIT.min, 1);
    expect(firstFidget(new IdleFidgets(() => 1 - Number.EPSILON))!.at).toBeCloseTo(
      FIDGET_WAIT.max,
      0,
    );
  });

  it('plays one of the idle variations, chosen by the draw', () => {
    expect(firstFidget(new IdleFidgets(() => 0))!.clip).toBe(FIDGET_CLIPS[0]);
    expect(firstFidget(new IdleFidgets(() => 1 - Number.EPSILON))!.clip).toBe(
      FIDGET_CLIPS[FIDGET_CLIPS.length - 1],
    );
  });

  it('starts the wait again whenever the body stops idling', () => {
    const fidgets = new IdleFidgets(() => 0);
    for (let t = 0; t < FIDGET_WAIT.min - 1; t += FRAME)
      expect(fidgets.update(FRAME, true)).toBeNull();
    // A step, a swing, a gesture: the body was busy, so the idle it returns
    // to is a fresh one.
    expect(fidgets.update(FRAME, false)).toBeNull();
    expect(firstFidget(fidgets)!.at).toBeCloseTo(FIDGET_WAIT.min, 1);
  });

  it('keeps fidgeting for as long as the body stands', () => {
    const fidgets = new IdleFidgets(() => 0);
    let count = 0;
    for (let t = 0; t < FIDGET_WAIT.min * 3 + 1; t += FRAME)
      if (fidgets.update(FRAME, true)) count++;
    expect(count).toBe(3);
  });
});
