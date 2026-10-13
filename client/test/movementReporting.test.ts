import { describe, expect, it } from 'vitest';

import { EntityMovementState } from '../src/net/GameConnection';
import {
  decideTimedPositionReport,
  movementStateForPosture,
} from '../src/app/helpers/combat/movementReporting';

describe('movementStateForPosture', () => {
  it('maps airborne and landing postures to protocol states', () => {
    expect(movementStateForPosture('jump', true, 'forward')).toBe(EntityMovementState.Jumping);
    expect(movementStateForPosture('flourish', true, 'forward')).toBe(EntityMovementState.Jumping);
    expect(movementStateForPosture('fall', true, 'forward')).toBe(EntityMovementState.Falling);
    expect(movementStateForPosture('landStill', false, 'idle')).toBe(EntityMovementState.Landed);
    expect(movementStateForPosture('landMoving', true, 'forward')).toBe(
      EntityMovementState.LandedMoving,
    );
  });

  it('maps swim to standing when idle and swimming when moving', () => {
    expect(movementStateForPosture('swim', true, 'idle')).toBe(EntityMovementState.Standing);
    expect(movementStateForPosture('swim', true, 'forward')).toBe(EntityMovementState.Swimming);
  });

  it('maps stand and run-like postures from movement flag', () => {
    expect(movementStateForPosture('stand', false, 'idle')).toBe(EntityMovementState.Standing);
    expect(movementStateForPosture('run', true, 'forward')).toBe(EntityMovementState.Walking);
    expect(movementStateForPosture('guardMelee', false, 'idle')).toBe(EntityMovementState.Standing);
  });
});

describe('decideTimedPositionReport', () => {
  it('skips unchanged movement before the interval elapses', () => {
    const out = decideTimedPositionReport({
      now: 1050,
      lastSent: 1000,
      intervalMs: 100,
      lastState: EntityMovementState.Standing,
      state: EntityMovementState.Standing,
      moving: false,
      velocity: [0, 0, 0],
    });
    expect(out).toBeNull();
  });

  it('sends unchanged movement once the interval elapses', () => {
    const out = decideTimedPositionReport({
      now: 1105,
      lastSent: 1000,
      intervalMs: 100,
      lastState: EntityMovementState.Standing,
      state: EntityMovementState.Standing,
      moving: false,
      velocity: [3, 0, 4],
    });
    expect(out).toEqual({
      sentAt: 1105,
      state: EntityMovementState.Standing,
      velocity: undefined,
      speed: undefined,
    });
  });

  it('sends immediately when movement state changes', () => {
    const out = decideTimedPositionReport({
      now: 1010,
      lastSent: 1000,
      intervalMs: 100,
      lastState: EntityMovementState.Standing,
      state: EntityMovementState.Walking,
      moving: true,
      velocity: [3, 0, 4],
    });
    expect(out).toEqual({
      sentAt: 1010,
      state: EntityMovementState.Walking,
      velocity: [3, 0, 4],
      speed: 5,
    });
  });
});
