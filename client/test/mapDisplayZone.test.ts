import { describe, expect, it } from 'vitest';

import { containsMapDisplayZone } from '../src/app/helpers/map/mapDisplayZone';

describe('containsMapDisplayZone', () => {
  it('is false when there is no current display zone', () => {
    expect(containsMapDisplayZone(null, 9, [1, 0, 1])).toBe(false);
  });

  it('is false when map ids differ', () => {
    const current = { mapId: 7, bounds: [0, 0, 10, 10] as [number, number, number, number] };
    expect(containsMapDisplayZone(current, 9, [1, 0, 1])).toBe(false);
  });

  it('is true when position is within bounds on the same map', () => {
    const current = { mapId: 9, bounds: [0, 0, 10, 10] as [number, number, number, number] };
    expect(containsMapDisplayZone(current, 9, [5, 0, 5])).toBe(true);
  });

  it('treats reversed bounds as valid bounds', () => {
    const current = { mapId: 9, bounds: [10, 10, 0, 0] as [number, number, number, number] };
    expect(containsMapDisplayZone(current, 9, [5, 0, 5])).toBe(true);
  });
});
