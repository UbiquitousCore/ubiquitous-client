import { describe, expect, it } from 'vitest';

import { departureStopNow } from '../src/app/helpers/map/departureStop';

describe('departureStopNow', () => {
  it('returns null without a player position', () => {
    const stopAt = () => {
      throw new Error('should not be called');
    };
    expect(departureStopNow(null, 7, stopAt)).toBeNull();
  });

  it('returns null when map id is unknown', () => {
    const stopAt = () => {
      throw new Error('should not be called');
    };
    expect(departureStopNow([1, 0, 2], undefined, stopAt)).toBeNull();
  });

  it('asks TravelNetwork for the stop at the current position/map', () => {
    const calls: Array<{ at: [number, number, number]; mapId: number }> = [];
    const out = departureStopNow([9, 0, 3], 12, (at, mapId) => {
      calls.push({ at, mapId });
      return 44;
    });
    expect(out).toBe(44);
    expect(calls).toEqual([{ at: [9, 0, 3], mapId: 12 }]);
  });
});
