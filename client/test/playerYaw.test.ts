import { describe, expect, it } from 'vitest';

import { playerYawFromRotation } from '../src/app/helpers/combat/playerYaw';

describe('playerYawFromRotation', () => {
  it('returns 0 when no body is present', () => {
    expect(playerYawFromRotation(null)).toBe(0);
  });

  it('uses quaternion y/w to derive yaw in radians', () => {
    const identity = { rotation: [0, 0, 0, 1] as [number, number, number, number] };
    expect(playerYawFromRotation(identity)).toBe(0);

    const halfTurn = { rotation: [0, 1, 0, 0] as [number, number, number, number] };
    expect(playerYawFromRotation(halfTurn)).toBeCloseTo(Math.PI, 8);

    const quarterTurn = {
      rotation: [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] as [
        number,
        number,
        number,
        number,
      ],
    };
    expect(playerYawFromRotation(quarterTurn)).toBeCloseTo(Math.PI / 2, 8);
  });
});
