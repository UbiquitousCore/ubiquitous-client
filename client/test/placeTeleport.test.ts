import { describe, expect, it } from 'vitest';

import type { ZoneInfo } from '../src/assets/types';
import type { TeleportStop } from '../src/gameplay/TravelNetwork';
import { reachableStopForPlace } from '../src/app/helpers/map/placeTeleport';

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
    priority: 13,
    icon: '',
    friendly: 2,
    atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 1, skybox: null },
    sound: { music: 0, ambience: 0 },
  };
}

function stop(
  id: number,
  mapId: number,
  position: [number, number, number],
  type = 0,
): TeleportStop {
  return { id, name: `stop-${id}`, mapId, position, type };
}

describe('reachableStopForPlace', () => {
  it('finds a reachable bus stop inside the place bounds on the top map', () => {
    const fares = new Map([[1, 100]]);
    const got = reachableStopForPlace(zone(10, 9, [0, 0, 10, 10]), null, 9, fares, [
      stop(1, 9, [5, 0, 5]),
      stop(2, 9, [50, 0, 50]),
    ]);
    expect(got?.id).toBe(1);
  });

  it('uses the gateway region bounds and map when the place is a sub-area link', () => {
    const fares = new Map([[2, 200]]);
    const place = zone(10, 9, [0, 0, 10, 10]);
    const gatewayRegion = zone(20, 11, [40, 40, 60, 60]);
    const got = reachableStopForPlace(place, gatewayRegion, 9, fares, [
      stop(1, 9, [5, 0, 5]),
      stop(2, 11, [50, 0, 50]),
    ]);
    expect(got?.id).toBe(2);
  });

  it('ignores unreachable and non-bus stops', () => {
    const fares = new Map<number, number>();
    const got = reachableStopForPlace(zone(10, 9, [0, 0, 10, 10]), null, 9, fares, [
      stop(1, 9, [5, 0, 5], 1),
      stop(2, 9, [5, 0, 5], 0),
    ]);
    expect(got).toBeUndefined();
  });
});
