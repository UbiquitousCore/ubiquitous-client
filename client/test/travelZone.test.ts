import { describe, expect, it } from 'vitest';

import { topZoneForSubArea } from '../src/app/helpers/map/travelZone';

describe('topZoneForSubArea', () => {
  it('returns null when there is no current display zone', () => {
    expect(topZoneForSubArea(null, { 10: [{ topZoneId: 20, zoneId: 1 }] })).toBeNull();
  });

  it('returns the parent top zone for a mapped sub-area', () => {
    expect(topZoneForSubArea(55, { 10: [{ topZoneId: 55, zoneId: 1 }] })).toBe(10);
  });

  it('returns null when no sub-area points at the current zone', () => {
    expect(topZoneForSubArea(55, { 10: [{ topZoneId: 30, zoneId: 1 }] })).toBeNull();
  });

  it('returns the first matching parent in object-entry order', () => {
    const subAreas = {
      10: [{ topZoneId: 55, zoneId: 1 }],
      20: [{ topZoneId: 55, zoneId: 2 }],
    };
    expect(topZoneForSubArea(55, subAreas)).toBe(10);
  });
});
