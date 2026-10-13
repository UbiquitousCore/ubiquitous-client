import { describe, expect, it } from 'vitest';

import type { ZoneInfo } from '../src/assets/types';
import { pickZoneAt } from '../src/app/helpers/map/zoneAt';

function zone(id: number, mapId: number, bounds: [number, number, number, number]): ZoneInfo {
  return {
    id,
    name: `zone-${id}`,
    mapId,
    mapName: 'map',
    centre: [0, 0],
    bounds,
    hasScenery: true,
    parentId: -1,
    priority: 1,
    icon: '',
    friendly: 2,
    atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 1, skybox: null },
    sound: { music: 0, ambience: 0 },
  };
}

describe('pickZoneAt', () => {
  it('returns null when the map has no zones', () => {
    expect(pickZoneAt([zone(1, 7, [0, 0, 5, 5])], 9, [1, 0, 1])).toBeNull();
  });

  it('prefers the smallest containing zone on the map', () => {
    const zones = [zone(1, 9, [0, 0, 10, 10]), zone(2, 9, [2, 2, 4, 4])];
    expect(pickZoneAt(zones, 9, [3, 0, 3])?.id).toBe(2);
  });

  it('falls back to the largest zone on the map when none contain the point', () => {
    const zones = [zone(1, 9, [0, 0, 2, 2]), zone(2, 9, [0, 0, 10, 10])];
    expect(pickZoneAt(zones, 9, [99, 0, 99])?.id).toBe(2);
  });

  it('treats reversed bounds as valid bounds', () => {
    const zones = [zone(1, 9, [10, 10, 0, 0]), zone(2, 9, [2, 2, 4, 4])];
    expect(pickZoneAt(zones, 9, [3, 0, 3])?.id).toBe(2);
    expect(pickZoneAt(zones, 9, [9, 0, 9])?.id).toBe(1);
  });
});
