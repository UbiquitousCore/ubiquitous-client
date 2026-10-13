/**
 * Recovering which way a remote body is moving from its facing and its travel.
 *
 * Nothing about this crosses the wire, so it is worked out from the two
 * things that *are* sent. The geometry is easy to get subtly wrong (a sign, or
 * left and right swapped) and the symptom is a body playing the wrong walk,
 * which reads as an animation bug rather than as arithmetic.
 */

import { describe, expect, it } from 'vitest';
import { directionOf } from '../src/gameplay/NetworkBodies';

/**
 * A body at yaw `a` faces `(sin a, cos a)` — `PlayerMovement` sets yaw as
 * `atan2(x, z)`. Its right is that rotated the way the rig rotates its own.
 */
function facing(yaw: number): { fx: number; fz: number; rx: number; rz: number } {
  return {
    fx: Math.sin(yaw),
    fz: Math.cos(yaw),
    rx: -Math.cos(yaw),
    rz: Math.sin(yaw),
  };
}

describe('recovering a remote body movement direction', () => {
  // Every quarter turn, so nothing passes by being right at one angle only.
  const yaws = [0, Math.PI / 4, Math.PI / 2, 2.4, Math.PI, -Math.PI / 2, -2.0];

  it('reads travel along the facing as forward, and against it as backward', () => {
    for (const yaw of yaws) {
      const { fx, fz } = facing(yaw);
      expect(directionOf(fx, fz, yaw)).toBe('forward');
      expect(directionOf(-fx, -fz, yaw)).toBe('backward');
    }
  });

  it('reads travel across the facing as a strafe, on the correct side', () => {
    for (const yaw of yaws) {
      const { rx, rz } = facing(yaw);
      expect(directionOf(rx, rz, yaw)).toBe('right');
      expect(directionOf(-rx, -rz, yaw)).toBe('left');
    }
  });

  it('classifies a diagonal by whichever component leads', () => {
    const yaw = 0.7;
    const { fx, fz, rx, rz } = facing(yaw);
    // Mostly forward with a little right in it is still forward.
    expect(directionOf(fx + rx * 0.3, fz + rz * 0.3, yaw)).toBe('forward');
    // And the other way round.
    expect(directionOf(fx * 0.3 + rx, fz * 0.3 + rz, yaw)).toBe('right');
  });

  it('says forward when the body has not moved enough to tell', () => {
    // Standing still has no travel direction, and guessing one from noise
    // would make a stationary body twitch between clips.
    expect(directionOf(0, 0, 1.2)).toBe('forward');
    expect(directionOf(1e-9, -1e-9, 1.2)).toBe('forward');
  });
});
