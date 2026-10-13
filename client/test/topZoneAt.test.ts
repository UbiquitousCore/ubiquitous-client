import { describe, expect, it } from 'vitest';

import type { ZoneInfo } from '../src/assets/types';
import { pickTopZoneAt } from '../src/app/helpers/map/topZoneAt';

function zone(
  id: number,
  mapId: number,
  bounds: [number, number, number, number],
  priority: number,
): ZoneInfo {
  return {
    id,
    name: `zone-${id}`,
    mapId,
    mapName: 'map',
    centre: [0, 0],
    bounds,
    hasScenery: true,
    parentId: -1,
    priority,
    icon: '',
    friendly: 2,
    atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 1, skybox: null },
    sound: { music: 0, ambience: 0 },
  };
}

describe('pickTopZoneAt', () => {
  const topPriorities = new Set([1, 2]);

  it('returns null when no matching top zone contains the point', () => {
    expect(pickTopZoneAt([zone(1, 9, [0, 0, 5, 5], 1)], 7, [2, 0, 2], topPriorities)).toBeNull();
    expect(pickTopZoneAt([zone(1, 9, [0, 0, 5, 5], 13)], 9, [2, 0, 2], topPriorities)).toBeNull();
  });

  it('picks the highest-priority matching top zone when they overlap', () => {
    const zones = [zone(1, 9, [0, 0, 10, 10], 1), zone(2, 9, [2, 2, 8, 8], 2)];
    expect(pickTopZoneAt(zones, 9, [5, 0, 5], topPriorities)?.id).toBe(2);
  });

  it('keeps later equal-priority zones winning, matching current constructor order behavior', () => {
    const zones = [zone(1, 9, [0, 0, 10, 10], 2), zone(2, 9, [0, 0, 10, 10], 2)];
    expect(pickTopZoneAt(zones, 9, [5, 0, 5], topPriorities)?.id).toBe(2);
  });

  it('treats reversed bounds as valid bounds', () => {
    const zones = [zone(1, 9, [10, 10, 0, 0], 2)];
    expect(pickTopZoneAt(zones, 9, [5, 0, 5], topPriorities)?.id).toBe(1);
  });
});
