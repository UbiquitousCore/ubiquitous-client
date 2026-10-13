import { describe, expect, it } from 'vitest';

import type { ZoneInfo } from '../src/assets/types';
import type { TeleportStop } from '../src/gameplay/TravelNetwork';
import { mapPlaceForZone } from '../src/app/helpers/map/mapPlace';

function zone(
  id: number,
  mapId: number,
  bounds: [number, number, number, number],
  icon = '',
): ZoneInfo {
  return {
    id,
    name: `zone-${id}`,
    mapId,
    mapName: 'map',
    centre: [12, 34],
    bounds,
    hasScenery: true,
    parentId: -1,
    priority: 13,
    icon,
    friendly: 2,
    atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 1, skybox: null },
    sound: { music: 0, ambience: 0 },
  };
}

function stop(id: number, mapId: number, position: [number, number, number]): TeleportStop {
  return { id, name: `stop-${id}`, mapId, position, type: 0 };
}

describe('mapPlaceForZone', () => {
  it('builds a place with its disposition and teleport marker when a reachable stop exists', () => {
    const z = zone(10, 9, [0, 0, 20, 20], 'board_a');
    const fares = new Map([[1, 450]]);
    const out = mapPlaceForZone({
      zone: z,
      topMapId: 9,
      gatewayRegion: null,
      fares,
      stops: [stop(1, 9, [5, 0, 5])],
    });

    expect(out).toEqual({
      id: 10,
      name: 'zone-10',
      position: [12, 0, 34],
      friendly: 2,
      teleport: { id: 'teleport-1', label: 'zone-10', position: [12, 0, 34], kind: 'teleport' },
    });
  });

  it('leaves teleport nullish when no reachable stop exists', () => {
    const z = zone(10, 9, [0, 0, 20, 20]);
    const out = mapPlaceForZone({
      zone: z,
      topMapId: 9,
      gatewayRegion: null,
      fares: new Map(),
      stops: [stop(1, 9, [5, 0, 5])],
    });

    expect(out.teleport).toBeNull();
  });
});
