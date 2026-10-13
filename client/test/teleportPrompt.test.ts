import { describe, expect, it } from 'vitest';

import type { ZoneInfo } from '../src/assets/types';
import type { TeleportStop } from '../src/gameplay/TravelNetwork';
import { teleportDestinationName } from '../src/app/helpers/map/teleportPrompt';

const DETAIL_ZONE_PRIORITY = 13;

function zone(
  id: number,
  name: string,
  bounds: [number, number, number, number],
  mapId: number,
  priority = DETAIL_ZONE_PRIORITY,
): ZoneInfo {
  return {
    id,
    name,
    mapId,
    mapName: 'map',
    centre: [0, 0],
    bounds,
    hasScenery: true,
    parentId: -1,
    priority,
    icon: '',
    friendly: 2,
    atmosphere: {
      fogColor: [0, 0, 0],
      fogNear: 0,
      fogFar: 1,
      skybox: null,
    },
    sound: { music: 0, ambience: 0 },
  };
}

function stop(
  id: number,
  name: string,
  mapId: number,
  position: [number, number, number],
): TeleportStop {
  return { id, name, mapId, position, type: 0 };
}

describe('teleportDestinationName', () => {
  it('uses the detail-zone name when one contains the destination stop', () => {
    const named = teleportDestinationName(
      9,
      stop(9, 'Original stop', 1, [5, 0, 5]),
      [zone(1, 'Arcadian Forest', [0, 0, 10, 10], 1)],
      DETAIL_ZONE_PRIORITY,
    );
    expect(named).toBe('Arcadian Forest');
  });

  it('falls back to the stop name when no matching detail zone is found', () => {
    const named = teleportDestinationName(
      9,
      stop(9, 'Original stop', 1, [5, 0, 5]),
      [zone(1, 'Wrong map', [0, 0, 10, 10], 2)],
      DETAIL_ZONE_PRIORITY,
    );
    expect(named).toBe('Original stop');
  });

  it('falls back to "stop <id>" when the destination stop is unknown', () => {
    expect(teleportDestinationName(9, undefined, [], DETAIL_ZONE_PRIORITY)).toBe('stop 9');
  });

  it('treats reversed bounds as containing, like the game bound checks do', () => {
    const named = teleportDestinationName(
      9,
      stop(9, 'Original stop', 1, [5, 0, 5]),
      [zone(1, 'Arcadian Forest', [10, 10, 0, 0], 1)],
      DETAIL_ZONE_PRIORITY,
    );
    expect(named).toBe('Arcadian Forest');
  });
});
